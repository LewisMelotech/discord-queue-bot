const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { stopRound } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polling-stop')
    .setDescription('Cancel the in-progress round early.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, state, saveState) {
    const stopped = await stopRound(interaction.client, state, saveState);
    await interaction.reply({
      content: stopped ? 'Stopped the round.' : "There's no round in progress.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
