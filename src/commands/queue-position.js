const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-position')
    .setDescription('Check your own place in the queue.'),

  async execute(interaction, state) {
    const userId = interaction.user.id;
    const index = state.queue.indexOf(userId);

    if (index === -1) {
      await interaction.reply({
        content:
          "You're not currently in the queue. Make sure you have the queue role — an admin may need to run /queue-sync.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let content = `You're #${index + 1} of ${state.queue.length} in the queue.`;
    const snoozeUntil = state.snoozedUntil[userId];
    if (snoozeUntil && snoozeUntil > Date.now()) {
      content += ` You're currently snoozed until <t:${Math.floor(snoozeUntil / 1000)}:R> — run /queue-rejoin to come off it early.`;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
