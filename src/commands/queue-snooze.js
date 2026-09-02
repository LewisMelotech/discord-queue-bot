const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { SNOOZE_DAYS } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-snooze')
    .setDescription(`Snooze yourself, even without an active poll (default ${SNOOZE_DAYS} days).`)
    .addIntegerOption((opt) =>
      opt
        .setName('days')
        .setDescription(`How many days to snooze for (default ${SNOOZE_DAYS})`)
        .setRequired(false)
        .setMinValue(1),
    ),

  async execute(interaction, state, saveState) {
    const days = interaction.options.getInteger('days') ?? SNOOZE_DAYS;
    const userId = interaction.user.id;

    state.snoozedUntil[userId] = Date.now() + days * 24 * 60 * 60 * 1000;
    saveState(state);

    await interaction.reply({
      content: `You're snoozed for ${days} day${days === 1 ? '' : 's'}. Run /queue-rejoin any time to come off it early.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
