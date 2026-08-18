const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { moveToBottom, moveToFront, nextCandidate } = require('./queue');

const PASS_LABEL = 'Not Available';
const SNOOZE_LABEL = "Don't ask again for a month";
const SNOOZE_DAYS = 30;
const RESPONSE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_SNOOZE_DAYS = 7;
const TIMEOUT_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DROP_OUT_EMOJI = '❌';
const BUTTONS_PER_ROW = 5;
const MAX_SLOT_ROWS = 4; // leaves 1 row free for the pass/snooze buttons (5 action rows max/message)
const MAX_SLOTS = BUTTONS_PER_ROW * MAX_SLOT_ROWS;

function buildSlotButtons(roundId, slots, filledSlots) {
  const takenIndexes = new Set(filledSlots.map((f) => f.slotIndex));
  const rows = [];
  for (let i = 0; i < slots.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    slots.slice(i, i + BUTTONS_PER_ROW).forEach((label, offset) => {
      const index = i + offset;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`poll:slot:${index}:${roundId}`)
          .setLabel(label.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(takenIndexes.has(index)),
      );
    });
    rows.push(row);
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:pass:${roundId}`)
        .setLabel(PASS_LABEL)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`poll:snooze:${roundId}`)
        .setLabel(SNOOZE_LABEL)
        .setStyle(ButtonStyle.Danger),
    ),
  );
  return rows;
}

function buildResultsEmbed(title, slots, filled, footerText) {
  const lines = slots.map((label, index) => {
    const entries = filled.filter((f) => f.slotIndex === index);
    if (entries.length === 0) return `**${label}:** _unfilled_`;
    return `**${label}:** ${entries.map((e) => `<@${e.userId}>`).join(', ')}`;
  });
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2)
    .setTimestamp();
  if (footerText) embed.setFooter({ text: footerText });
  return embed;
}

const REOPEN_HINT = `Can't make it after all? React ${DROP_OUT_EMOJI} on this message to reopen your slot.`;

/** Best-effort post to the configured log channel; a missing config or a send failure is a silent no-op. */
async function postToLogChannel(client, state, message) {
  const logChannelId = state.config?.logChannelId;
  if (!logChannelId) return;
  try {
    const channel = await client.channels.fetch(logChannelId);
    await channel.send(message);
  } catch (err) {
    console.error('Failed to post to log channel:', err.message);
  }
}

async function sendResultsMessage(client, state, saveState) {
  const { round } = state;
  const channel = await client.channels.fetch(round.channelId);
  const embed = buildResultsEmbed(round.title, round.slots, round.filled, REOPEN_HINT);
  const message = await channel.send({ embeds: [embed] });
  await message.react(DROP_OUT_EMOJI).catch((err) => console.error('Failed to add drop-out reaction:', err.message));

  state.lastRound = {
    title: round.title,
    slots: round.slots,
    filled: round.filled,
    channelId: round.channelId,
    resultsMessageId: message.id,
  };
  saveState(state);
}

/**
 * Starts a new poll round from a template: resets round state and asks the
 * first person. Throws if a round is already active or the queue is empty.
 */
async function startRound(client, state, saveState, channelId, template) {
  if (state.round) {
    throw new Error('A round is already in progress.');
  }
  if (state.queue.length === 0) {
    throw new Error('The queue is empty. Run /queue-sync first.');
  }
  state.round = {
    id: `${Date.now()}`,
    channelId,
    title: template.name,
    slots: template.slots,
    filled: [],
    askedThisRound: [],
    ineligibleThisRound: [],
    pendingUserId: null,
    pendingSince: null,
    startedAt: Date.now(),
  };
  saveState(state);
  await askNext(client, state, saveState);
}

/**
 * DMs the next candidate this round (see queue.nextCandidate — prefers
 * someone fresh, falls back to re-asking existing slot-holders once
 * everyone's had a turn). If a DM can't be delivered, posts a fallback
 * notice in the round channel, marks them ineligible for the rest of this
 * round (they keep their queue position), and moves on. If nobody eligible
 * is left before all slots are filled, ends the round with what's filled.
 */
async function askNext(client, state, saveState) {
  const { round } = state;
  const userId = nextCandidate(state.queue, round, state.snoozedUntil, Date.now());

  if (!userId) {
    await sendResultsMessage(client, state, saveState);
    state.round = null;
    saveState(state);
    return;
  }

  const rows = buildSlotButtons(round.id, round.slots, round.filled);
  const remaining = round.slots.length - round.filled.length;
  const alreadyHasSlot = round.filled.some((f) => f.userId === userId);

  try {
    const user = await client.users.fetch(userId);
    const intro = alreadyHasSlot
      ? `Nobody else is left in the queue — would you like to cover another slot for **${round.title}**?`
      : `It's your turn! Would you like to sign up for **${round.title}**?`;
    await user.send({
      content:
        `${intro}\n${remaining} slot${remaining === 1 ? '' : 's'} still open. Pick one below, ` +
        `or choose "${PASS_LABEL}" to be asked first next time.`,
      components: rows,
    });
    round.pendingUserId = userId;
    round.pendingSince = Date.now();
    if (!round.askedThisRound.includes(userId)) round.askedThisRound.push(userId);
    saveState(state);
    await postToLogChannel(
      client,
      state,
      `📨 Asking <@${userId}> about **${round.title}** (${remaining} slot${remaining === 1 ? '' : 's'} open).`,
    );
  } catch (err) {
    console.error(`Could not DM ${userId}, skipping for this round:`, err.message);
    if (!round.askedThisRound.includes(userId)) round.askedThisRound.push(userId);
    if (!round.ineligibleThisRound.includes(userId)) round.ineligibleThisRound.push(userId);
    round.pendingUserId = null;
    round.pendingSince = null;
    saveState(state);
    try {
      const channel = await client.channels.fetch(round.channelId);
      await channel.send(
        `<@${userId}> I couldn't send you a DM (check your privacy settings). ` +
          `Skipping you for this round — you keep your place in the queue.`,
      );
    } catch (channelErr) {
      console.error('Also failed to post DM-failure notice in channel:', channelErr.message);
    }
    await postToLogChannel(client, state, `⚠️ Couldn't DM <@${userId}> for **${round.title}** — DMs likely closed, skipped.`);
    await askNext(client, state, saveState);
  }
}

async function handleSlotChoice(client, state, saveState, userId, slotIndex) {
  const { round } = state;
  const slotLabel = round.slots[slotIndex];
  round.filled.push({ slotIndex, userId });
  round.pendingUserId = null;
  round.pendingSince = null;
  state.queue = moveToBottom(state.queue, userId);

  await postToLogChannel(client, state, `✅ <@${userId}> picked **${slotLabel}** for **${round.title}**.`);

  if (round.filled.length >= round.slots.length) {
    await sendResultsMessage(client, state, saveState);
    state.round = null;
    saveState(state);
    return;
  }

  saveState(state);
  await askNext(client, state, saveState);
}

async function handlePass(client, state, saveState, userId) {
  const { round } = state;
  if (!round.ineligibleThisRound.includes(userId)) round.ineligibleThisRound.push(userId);
  round.pendingUserId = null;
  round.pendingSince = null;
  state.queue = moveToFront(state.queue, userId);
  saveState(state);
  await postToLogChannel(client, state, `⏭️ <@${userId}> said Not Available for **${round.title}**.`);
  await askNext(client, state, saveState);
}

/**
 * Snoozes a user for SNOOZE_DAYS: nextCandidate excludes them from every
 * round (this one and any future one) regardless of anything else, until
 * the snooze expires or an admin clears it with /clear-snooze. Queue
 * position is left untouched.
 */
async function handleSnooze(client, state, saveState, userId) {
  const { round } = state;
  state.snoozedUntil[userId] = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  round.pendingUserId = null;
  round.pendingSince = null;
  saveState(state);
  await postToLogChannel(client, state, `🔕 <@${userId}> won't be asked again for a month (re: **${round.title}**).`);
  await askNext(client, state, saveState);
}

/**
 * Checked periodically (see TIMEOUT_CHECK_INTERVAL_MS / index.js): if the
 * person currently being asked hasn't responded within RESPONSE_TIMEOUT_MS,
 * snoozes them for TIMEOUT_SNOOZE_DAYS and moves on, the same way a passed
 * or unreachable person is skipped. The timestamp this compares against is
 * persisted in state, so it survives a bot restart.
 */
async function checkForTimeouts(client, state, saveState) {
  const { round } = state;
  if (!round || !round.pendingUserId || !round.pendingSince) return;
  if (Date.now() - round.pendingSince < RESPONSE_TIMEOUT_MS) return;

  const userId = round.pendingUserId;
  state.snoozedUntil[userId] = Date.now() + TIMEOUT_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  round.pendingUserId = null;
  round.pendingSince = null;
  saveState(state);

  try {
    const channel = await client.channels.fetch(round.channelId);
    await channel.send(
      `<@${userId}> didn't respond within 24 hours, so they've been snoozed for a week and skipped for this round.`,
    );
  } catch (err) {
    console.error('Failed to post response-timeout notice:', err.message);
  }
  await postToLogChannel(client, state, `⌛ <@${userId}> didn't respond to **${round.title}** within 24h — snoozed for a week.`);

  await askNext(client, state, saveState);
}

/**
 * Cancels the active round early (e.g. started by mistake, or an admin
 * just wants to abandon it). Posts a notice with whatever was filled so
 * far — this is a distinct outcome from a normal completion, so it does
 * NOT set state.lastRound: dropped-out-slot reopening only applies to
 * rounds that ran to completion. Returns false if there's no active round.
 */
async function stopRound(client, state, saveState) {
  const { round } = state;
  if (!round) return false;

  try {
    const channel = await client.channels.fetch(round.channelId);
    const embed = buildResultsEmbed(`${round.title} (stopped early)`, round.slots, round.filled);
    await channel.send({
      content: 'Polling was stopped by an admin before all slots were filled.',
      embeds: [embed],
    });
  } catch (err) {
    console.error('Failed to post stop notice:', err.message);
  }

  state.round = null;
  saveState(state);
  return true;
}

/**
 * Handles a ❌ reaction on a completed round's results message: vacates
 * every slot the reacting user held and automatically resumes polling down
 * the queue to refill them. Returns false (no-op) if there's no matching
 * completed round, the user held no slot in it, or another round is
 * already active (caller should tell the reactor to wait / ask an admin).
 */
async function reopenVacatedSlots(client, state, saveState, userId) {
  const last = state.lastRound;
  if (!last) return false;

  const vacatedEntries = last.filled.filter((f) => f.userId === userId);
  if (vacatedEntries.length === 0) return false;
  if (state.round) return false;

  const remainingFilled = last.filled.filter((f) => f.userId !== userId);
  const vacatedLabels = vacatedEntries.map((f) => last.slots[f.slotIndex]).join(', ');

  try {
    const channel = await client.channels.fetch(last.channelId);
    const message = await channel.messages.fetch(last.resultsMessageId);
    await message.edit({ embeds: [buildResultsEmbed(last.title, last.slots, remainingFilled, REOPEN_HINT)] });
    await channel.send(`⚠️ <@${userId}> can no longer do **${vacatedLabels}** — reopening the queue to fill it.`);
  } catch (err) {
    console.error('Failed to update results message for drop-out:', err.message);
  }

  state.round = {
    id: `${Date.now()}`,
    channelId: last.channelId,
    title: last.title,
    slots: last.slots,
    filled: remainingFilled,
    askedThisRound: [...remainingFilled.map((f) => f.userId), userId],
    ineligibleThisRound: [userId],
    pendingUserId: null,
    pendingSince: null,
    startedAt: Date.now(),
  };
  state.lastRound = null;
  saveState(state);
  await askNext(client, state, saveState);
  return true;
}

module.exports = {
  startRound,
  stopRound,
  askNext,
  handleSlotChoice,
  handlePass,
  handleSnooze,
  checkForTimeouts,
  reopenVacatedSlots,
  buildResultsEmbed,
  PASS_LABEL,
  SNOOZE_LABEL,
  DROP_OUT_EMOJI,
  REOPEN_HINT,
  MAX_SLOTS,
  TIMEOUT_CHECK_INTERVAL_MS,
};
