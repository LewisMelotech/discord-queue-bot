const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { reminderTime, configuredReminderTime } = require('../logic/reminders');
const { normalizeTime, formatDay } = require('../logic/dates');

const MAX_LISTED_EVENTS = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders-setup')
    .setDescription('Turn event reminders on or off, and set what time they go out on the day.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) =>
      opt
        .setName('enabled')
        .setDescription('DM whoever is in a slot on the morning of its day (off until turned on here)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription('UK time to send them on the day, e.g. "9am" or "08:30" (default 9am)')
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const enabled = interaction.options.getBoolean('enabled');
    const timeInput = interaction.options.getString('time');
    const time = timeInput === null ? null : normalizeTime(timeInput);
    if (timeInput !== null && !time) {
      await interaction.reply({
        content: `"${timeInput}" isn't a time I recognise — try something like "9am" or "08:30".`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Setting a time on its own turns reminders on, since that's what it's for.
    const changed = enabled !== null || time !== null;
    if (time) state.config.reminderTime = time;
    if (enabled !== null) state.config.remindersEnabled = enabled;
    else if (time) state.config.remindersEnabled = true;
    if (changed) saveState(state);

    const now = changed ? 'now ' : '';
    const activeTime = reminderTime(state);
    const lines = [
      activeTime
        ? `Event reminders are ${now}on: whoever's in a slot gets a DM at ${activeTime} UK on the day.`
        : `Event reminders are ${now}off. Run /reminders-setup enabled:True to turn them on ` +
          `(they'll go out at ${configuredReminderTime(state)} UK on the day).`,
    ];

    const upcoming = [...state.upcomingEvents].sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
    if (upcoming.length === 0) {
      lines.push(
        '\nNo upcoming slots. A slot gets a reminder once someone picks it, as long as its name has a day of ' +
          'the week in it (e.g. "Sat AM" or "Sat {{next}}").',
      );
    } else {
      lines.push('\n**Upcoming:**');
      for (const event of upcoming.slice(0, MAX_LISTED_EVENTS)) {
        const who = Object.keys(event.attendees).map((id) => `<@${id}>`).join(', ');
        lines.push(`• ${formatDay(event.date)} — **${event.slotLabel}** (${event.title}): ${who}`);
      }
      if (upcoming.length > MAX_LISTED_EVENTS) lines.push(`…and ${upcoming.length - MAX_LISTED_EVENTS} more.`);
    }

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
