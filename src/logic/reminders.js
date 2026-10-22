const { postToLogChannel } = require('./log-channel');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_LEAD_TIMES_MS = [24 * HOUR_MS, HOUR_MS];
const MAX_LEAD_TIMES = 5;
const MAX_LEAD_TIME_MS = 14 * DAY_MS;
const REMINDER_CHECK_INTERVAL_MS = MINUTE_MS;
const UNIT_MS = { d: DAY_MS, h: HOUR_MS, m: MINUTE_MS };

/** How long before each event to remind people, longest first. Null (never set) means the default. */
function leadTimes(state) {
  return state.config.reminderLeadTimesMs ?? DEFAULT_LEAD_TIMES_MS;
}

/**
 * Parses "24h, 1h" / "2d" / "1h30m" into lead times in ms, longest first.
 * "off" or "none" gives [] (reminders disabled). Returns null if anything
 * is unparseable or out of range.
 */
function parseLeadTimes(input) {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === 'off' || trimmed === 'none') return [];
  const values = [];
  for (const part of trimmed.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!/^(\d+\s*[dhm]\s*)+$/.test(part)) return null;
    let ms = 0;
    for (const [, amount, unit] of part.matchAll(/(\d+)\s*([dhm])/g)) ms += parseInt(amount, 10) * UNIT_MS[unit];
    if (ms <= 0 || ms > MAX_LEAD_TIME_MS) return null;
    values.push(ms);
  }
  const unique = [...new Set(values)];
  if (unique.length === 0 || unique.length > MAX_LEAD_TIMES) return null;
  return unique.sort((a, b) => b - a);
}

/** 86400000 -> "24h", 172800000 -> "2d", 5400000 -> "1h30m". */
function formatLeadTime(ms) {
  if (ms >= 2 * DAY_MS && ms % DAY_MS === 0) return `${ms / DAY_MS}d`;
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.round((ms % HOUR_MS) / MINUTE_MS);
  return `${hours ? `${hours}h` : ''}${minutes ? `${minutes}m` : ''}`;
}

/** [24h, 1h] -> "24h and 1h". */
function describeLeadTimes(leads) {
  const labels = leads.map(formatLeadTime);
  return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0];
}

/**
 * Brings state.upcomingEvents in line with a round's (or the last completed
 * round's) slot assignments: one entry per slot that has a start time, is
 * still in the future, and has someone in it. Call it whenever who's in
 * which slot changes. Someone newly added only gets the reminders that are
 * still ahead of them — picking a slot 5h before it starts skips the 24h
 * one rather than sending it straight away. No-op for rounds saved before
 * reminders existed (no eventGroupId/slotTimes).
 */
function syncEventReminders(state, source, now = Date.now()) {
  const { eventGroupId, slotTimes } = source;
  if (!eventGroupId || !slotTimes) return;

  const previous = new Map(
    state.upcomingEvents.filter((e) => e.groupId === eventGroupId).map((e) => [e.slotIndex, e]),
  );
  const next = state.upcomingEvents.filter((e) => e.groupId !== eventGroupId);

  source.slots.forEach((label, slotIndex) => {
    const startsAt = slotTimes[slotIndex];
    if (!startsAt || startsAt <= now) return;
    const userIds = [...new Set(source.filled.filter((f) => f.slotIndex === slotIndex).map((f) => f.userId))];
    if (userIds.length === 0) return;
    const attendees = {};
    for (const userId of userIds) {
      attendees[userId] = previous.get(slotIndex)?.attendees[userId] ?? { addedAt: now, sent: [] };
    }
    next.push({ groupId: eventGroupId, slotIndex, title: source.title, slotLabel: label, startsAt, attendees });
  });

  state.upcomingEvents = next;
}

/** Drops every pending reminder for a round, e.g. when it's abandoned. */
function cancelEventReminders(state, eventGroupId) {
  state.upcomingEvents = state.upcomingEvents.filter((e) => e.groupId !== eventGroupId);
}

/**
 * Where to point someone who can't make it: the ❌ on the results message
 * only works while that's still the latest completed round, so link it
 * then, and otherwise send them to an admin.
 */
async function dropOutHint(client, state, event) {
  const last = state.lastRound;
  if (last?.eventGroupId === event.groupId && last.resultsMessageId) {
    try {
      const channel = await client.channels.fetch(last.channelId);
      return (
        "Can't make it any more? Head to the results message to give your slot up: " +
        `https://discord.com/channels/${channel.guildId}/${last.channelId}/${last.resultsMessageId}`
      );
    } catch (err) {
      console.error('Failed to look up results channel for reminder:', err.message);
    }
  }
  return "Can't make it any more? Let an admin know as soon as you can.";
}

async function sendReminder(client, state, event, userId) {
  const startsAt = Math.floor(event.startsAt / 1000);
  try {
    const user = await client.users.fetch(userId);
    await user.send(
      `⏰ Reminder: you're down for **${event.slotLabel}** in **${event.title}**, starting <t:${startsAt}:F> ` +
        `(<t:${startsAt}:R>).\n${await dropOutHint(client, state, event)}`,
    );
    await postToLogChannel(
      client,
      state,
      `⏰ Reminded <@${userId}> about **${event.slotLabel}** (${event.title}), starting <t:${startsAt}:R>.`,
    );
  } catch (err) {
    console.error(`Could not DM ${userId} their event reminder:`, err.message);
    await postToLogChannel(
      client,
      state,
      `⚠️ Couldn't DM <@${userId}> their reminder for **${event.slotLabel}** (${event.title}) — DMs likely closed.`,
    );
  }
}

/**
 * Checked every REMINDER_CHECK_INTERVAL_MS (see index.js): DMs each person
 * in an upcoming slot once per configured lead time as it comes due. If
 * several are due at once (e.g. the bot was offline through one), only one
 * DM goes out — its relative timestamp shows the real time left. Each
 * reminder is marked sent before the DM is attempted and persisted, so a
 * restart or a failed DM never repeats one. Events that have started are
 * dropped.
 */
async function checkForReminders(client, state, saveState) {
  const now = Date.now();
  const leads = leadTimes(state);
  const upcoming = state.upcomingEvents.filter((e) => e.startsAt > now);
  if (upcoming.length !== state.upcomingEvents.length) {
    state.upcomingEvents = upcoming;
    saveState(state);
  }

  for (const event of upcoming) {
    for (const [userId, attendee] of Object.entries(event.attendees)) {
      const due = leads.filter(
        (lead) =>
          !attendee.sent.includes(lead) && event.startsAt - lead <= now && event.startsAt - lead >= attendee.addedAt,
      );
      if (due.length === 0) continue;
      attendee.sent.push(...due);
      saveState(state);
      await sendReminder(client, state, event, userId);
    }
  }
}

module.exports = {
  leadTimes,
  parseLeadTimes,
  describeLeadTimes,
  syncEventReminders,
  cancelEventReminders,
  checkForReminders,
  REMINDER_CHECK_INTERVAL_MS,
};
