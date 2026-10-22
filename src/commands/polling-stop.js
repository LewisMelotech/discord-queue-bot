const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { stopRound } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polling-stop')
    .setDescription('Cancel the in-progress round early.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((opt) =>
      opt
        .setName('cancel-reminders')
        .setDescription('Also cancel event reminders for anyone already in a slot (default: keep them)')
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const cancelReminders = interaction.options.getBoolean('cancel-reminders') ?? false;
    const stopped = await stopRound(interaction.client, state, saveState, cancelReminders);
    await interaction.reply({
      content: stopped
        ? `Stopped the round.${cancelReminders ? ' Event reminders for it are cancelled.' : ''}`
        : "There's no round in progress.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
