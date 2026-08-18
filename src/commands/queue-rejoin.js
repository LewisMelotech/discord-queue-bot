const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-rejoin')
    .setDescription("Clear your own snooze, if you're currently on one."),

  async execute(interaction, state, saveState) {
    const userId = interaction.user.id;
    const until = state.snoozedUntil[userId];

    if (!until || until <= Date.now()) {
      await interaction.reply({ content: "You're not currently snoozed.", flags: MessageFlags.Ephemeral });
      return;
    }

    delete state.snoozedUntil[userId];
    saveState(state);

    await interaction.reply({ content: "You're back in the queue rotation.", flags: MessageFlags.Ephemeral });
  },
};
