const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { leadTimes, parseLeadTimes, describeLeadTimes } = require('../logic/reminders');

const MAX_LISTED_EVENTS = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminders')
    .setDescription('Show upcoming event reminders, or change how long before an event they go out.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('times')
        .setDescription('How long before each event to DM whoever\'s in it, e.g. "24h, 1h" or "2d, 30m" — or "off"')
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const input = interaction.options.getString('times');
    if (input !== null) {
      const parsed = parseLeadTimes(input);
      if (!parsed) {
        await interaction.reply({
          content:
            `Couldn't read "${input}". Use a comma-separated list of up to 5 times like "24h, 1h" or "2d, 1h30m" ` +
            '(d/h/m, at most 14 days each), or "off" to turn reminders off.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      state.config.reminderLeadTimesMs = parsed;
      saveState(state);
    }

    const leads = leadTimes(state);
    const lines = [
      leads.length
        ? `Event reminders ${input !== null ? 'will now go' : 'go'} out ${describeLeadTimes(leads)} before each event, by DM to whoever's in the slot.`
        : `Event reminders are ${input !== null ? 'now ' : ''}off. Run /reminders times:"24h, 1h" to turn them back on.`,
    ];

    const upcoming = [...state.upcomingEvents].sort((a, b) => a.startsAt - b.startsAt);
    if (upcoming.length === 0) {
      lines.push(
        '\nNo upcoming events. A slot only gets reminders once someone picks it, and only if it has a start ' +
          'time — include one in the slot name (e.g. "Sat {{next}} 19:00") or set time: on the template.',
      );
    } else {
      lines.push('\n**Upcoming:**');
      for (const event of upcoming.slice(0, MAX_LISTED_EVENTS)) {
        const who = Object.keys(event.attendees).map((id) => `<@${id}>`).join(', ');
        lines.push(`• **${event.slotLabel}** (${event.title}) <t:${Math.floor(event.startsAt / 1000)}:f> — ${who}`);
      }
      if (upcoming.length > MAX_LISTED_EVENTS) lines.push(`…and ${upcoming.length - MAX_LISTED_EVENTS} more.`);
    }

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
