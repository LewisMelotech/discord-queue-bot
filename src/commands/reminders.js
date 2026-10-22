const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { reminderTime } = require('../logic/reminders');
const { normalizeTime, formatDay } = require('../logic/dates');

const MAX_LISTED_EVENTS = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Show upcoming event reminders, or change what time of day they go out.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('time')
        .setDescription('UK time to DM people on the day of their slot, e.g. "9am" or "08:30" — or "off"')
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const input = interaction.options.getString('time');
    if (input !== null) {
      const off = ['off', 'none'].includes(input.trim().toLowerCase());
      const time = off ? 'off' : normalizeTime(input);
      if (!time) {
        await interaction.reply({
          content: `"${input}" isn't a time I recognise — try something like "9am" or "08:30", or "off" to turn reminders off.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      state.config.reminderTime = time;
      saveState(state);
    }

    const time = reminderTime(state);
    const lines = [
      time
        ? `Event reminders ${input !== null ? 'will now go' : 'go'} out at ${time} UK on the day of each slot, by DM to whoever's in it.`
        : `Event reminders are ${input !== null ? 'now ' : ''}off. Run /reminders time:9am to turn them back on.`,
    ];

    const upcoming = [...state.upcomingEvents].sort((a, b) => a.date.localeCompare(b.date) || a.slotIndex - b.slotIndex);
    if (upcoming.length === 0) {
      lines.push(
        '\nNo upcoming events. A slot gets a reminder once someone picks it, as long as its name has a day of ' +
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
