const { postToLogChannel } = require('./log-channel');
const { ukDateTimeToEpoch, ukEndOfDay, ukToday } = require('./dates');

const DEFAULT_REMINDER_TIME = '09:00';
const REMINDER_CHECK_INTERVAL_MS = 60 * 1000;

/** The configured "HH:MM" UK reminder time, on or off. Never set means the default. ("off" was an older way of disabling.) */
function configuredReminderTime(state) {
  const time = state.config.reminderTime;
  return time && time !== 'off' ? time : DEFAULT_REMINDER_TIME;
}

/** The configured schedule, on or off: { time: "HH:MM" UK, daysBefore: 0 (on the day) or 1 (the day before) }. */
function configuredSchedule(state) {
  return { time: configuredReminderTime(state), daysBefore: state.config.reminderDaysBefore ?? 0 };
}

/** When reminders go out (see configuredSchedule), or null while they're off — the default until /reminders-setup turns them on. */
function reminderSchedule(state) {
  return state.config.remindersEnabled ? configuredSchedule(state) : null;
}

/** { time: "19:00", daysBefore: 1 } -> "19:00 UK the day before". */
function describeSchedule({ time, daysBefore }) {
  return `${time} UK ${daysBefore ? 'the day before' : 'on the day'}`;
}

/** ["a"] -> "a", ["a", "b", "c"] -> "a, b and c". */
function joinList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
}

/**
 * Brings state.upcomingEvents in line with a round's (or the last completed
 * round's) slot assignments: one entry per slot that falls on a known day,
 * that day isn't over yet, and someone's in it. Call it whenever who's in
 * which slot changes. Someone added after the slot's reminder time doesn't
 * get one — they've only just signed up. No-op for rounds saved before
 * reminders existed (no eventGroupId/slotDates).
 */
function syncEventReminders(state, source, now = Date.now()) {
  const { eventGroupId, slotDates } = source;
  if (!eventGroupId || !slotDates) return;

  const previous = new Map(
    state.upcomingEvents.filter((e) => e.groupId === eventGroupId).map((e) => [e.slotIndex, e]),
  );
  const next = state.upcomingEvents.filter((e) => e.groupId !== eventGroupId);

  source.slots.forEach((label, slotIndex) => {
    const date = slotDates[slotIndex];
    if (!date || ukEndOfDay(date) <= now) return;
    const userIds = [...new Set(source.filled.filter((f) => f.slotIndex === slotIndex).map((f) => f.userId))];
    if (userIds.length === 0) return;
    const attendees = {};
    for (const userId of userIds) {
      attendees[userId] = previous.get(slotIndex)?.attendees[userId] ?? { addedAt: now, reminded: false };
    }
    next.push({ groupId: eventGroupId, slotIndex, title: source.title, slotLabel: label, date, attendees });
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
async function dropOutHint(client, state, events) {
  const last = state.lastRound;
  if (last?.resultsMessageId && events.some((e) => e.groupId === last.eventGroupId)) {
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

/** One DM per person per day of slots, even if they're in more than one slot that day. */
async function sendReminder(client, state, userId, events, today) {
  const when = events[0].date === today ? 'today' : 'tomorrow';
  const labelsByTitle = new Map();
  for (const e of events) labelsByTitle.set(e.title, [...(labelsByTitle.get(e.title) ?? []), `**${e.slotLabel}**`]);
  const slots = joinList([...labelsByTitle].map(([title, labels]) => `${joinList(labels)} in **${title}**`));
  try {
    const user = await client.users.fetch(userId);
    await user.send(
      `⏰ Just a reminder that you're down for ${slots} ${when}.\n${await dropOutHint(client, state, events)}`,
    );
    await postToLogChannel(client, state, `⏰ Sent <@${userId}> their reminder for ${slots} (${when}).`);
  } catch (err) {
    console.error(`Could not DM ${userId} their event reminder:`, err.message);
    await postToLogChannel(client, state, `⚠️ Couldn't DM <@${userId}> their reminder for ${slots} — DMs likely closed.`);
  }
}

/**
 * Checked every REMINDER_CHECK_INTERVAL_MS (see index.js): once the
 * configured reminder time comes round (on the slot's day, or the day
 * before), DMs everyone in it. If the bot was offline at that time, it
 * catches up as soon as it's back, as long as the slot's day isn't over —
 * the DM says "today" or "tomorrow" to match when it actually goes out.
 * Each reminder is marked sent and persisted before the DM is attempted,
 * so a restart or a failed DM never repeats one. Events are dropped once
 * their day is over.
 */
async function checkForReminders(client, state, saveState) {
  const now = Date.now();
  const upcoming = state.upcomingEvents.filter((e) => ukEndOfDay(e.date) > now);
  if (upcoming.length !== state.upcomingEvents.length) {
    state.upcomingEvents = upcoming;
    saveState(state);
  }

  const schedule = reminderSchedule(state);
  if (!schedule) return;

  const due = new Map(); // "userId:date" -> { userId, events }
  for (const event of upcoming) {
    const sendAt = ukDateTimeToEpoch(event.date, schedule.time, schedule.daysBefore);
    if (now < sendAt) continue;
    for (const [userId, attendee] of Object.entries(event.attendees)) {
      if (attendee.reminded || attendee.addedAt >= sendAt) continue;
      attendee.reminded = true;
      const key = `${userId}:${event.date}`;
      due.set(key, { userId, events: [...(due.get(key)?.events ?? []), event] });
    }
  }
  if (due.size === 0) return;

  saveState(state);
  const today = ukToday(new Date(now));
  for (const { userId, events } of due.values()) {
    await sendReminder(client, state, userId, events, today);
  }
}

module.exports = {
  reminderSchedule,
  configuredSchedule,
  describeSchedule,
  syncEventReminders,
  cancelEventReminders,
  checkForReminders,
  REMINDER_CHECK_INTERVAL_MS,
};
