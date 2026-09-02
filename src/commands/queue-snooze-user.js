const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { SNOOZE_DAYS } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-snooze-user')
    .setDescription(`Snooze someone else, even without an active poll (default ${SNOOZE_DAYS} days).`)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) => opt.setName('user').setDescription('Who to snooze').setRequired(true))
    .addIntegerOption((opt) =>
      opt
        .setName('days')
        .setDescription(`How many days to snooze for (default ${SNOOZE_DAYS})`)
        .setRequired(false)
        .setMinValue(1),
    ),

  async execute(interaction, state, saveState) {
    const user = interaction.options.getUser('user');
    const days = interaction.options.getInteger('days') ?? SNOOZE_DAYS;

    state.snoozedUntil[user.id] = Date.now() + days * 24 * 60 * 60 * 1000;
    saveState(state);

    try {
      await user.send(
        `You've been snoozed for ${days} day${days === 1 ? '' : 's'} by an admin. ` +
          'Run /queue-rejoin in the server any time to come off it early.',
      );
    } catch (err) {
      console.error(`Could not DM ${user.id} about being snoozed:`, err.message);
    }

    await interaction.reply({
      content: `Snoozed <@${user.id}> for ${days} day${days === 1 ? '' : 's'}.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
