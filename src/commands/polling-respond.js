const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { handleSlotChoice, handlePass, handleSnooze } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polling-respond')
    .setDescription('Respond on behalf of the person currently being asked.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) => opt.setName('user').setDescription('Who to respond for').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('choice').setDescription('What to respond with').setRequired(true).setAutocomplete(true),
    ),

  async autocomplete(interaction, state) {
    const { round } = state;
    if (!round) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused().toLowerCase();
    const takenIndexes = new Set(round.filled.map((f) => f.slotIndex));
    const choices = [
      ...round.slots
        .map((label, index) => ({ label, index }))
        .filter(({ index }) => !takenIndexes.has(index))
        .map(({ label, index }) => ({ name: `${index + 1}. ${label}`.slice(0, 100), value: `slot:${index}` })),
      { name: 'Not Available', value: 'pass' },
      { name: "Don't ask again for a month", value: 'snooze' },
    ]
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(choices);
  },

  async execute(interaction, state, saveState) {
    const { round } = state;
    if (!round) {
      await interaction.reply({ content: 'No round is currently in progress.', flags: MessageFlags.Ephemeral });
      return;
    }

    const user = interaction.options.getUser('user');
    if (round.pendingUserId !== user.id) {
      await interaction.reply({
        content: round.pendingUserId
          ? `The bot is currently waiting on <@${round.pendingUserId}>, not <@${user.id}>.`
          : 'Nobody is currently being asked.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const choice = interaction.options.getString('choice');

    if (choice === 'pass') {
      await interaction.reply({ content: `Recorded <@${user.id}> as Not Available.`, flags: MessageFlags.Ephemeral });
      await handlePass(interaction.client, state, saveState, user.id);
      return;
    }

    if (choice === 'snooze') {
      await interaction.reply({ content: `Snoozed <@${user.id}> for a month.`, flags: MessageFlags.Ephemeral });
      await handleSnooze(interaction.client, state, saveState, user.id);
      return;
    }

    const match = /^slot:(\d+)$/.exec(choice);
    const slotIndex = match ? parseInt(match[1], 10) : NaN;
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= round.slots.length) {
      await interaction.reply({ content: 'Unrecognized choice — pick one from the list.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (round.filled.some((f) => f.slotIndex === slotIndex)) {
      await interaction.reply({ content: 'That slot is already taken — pick a different one.', flags: MessageFlags.Ephemeral });
      return;
    }

    const slotLabel = round.slots[slotIndex];
    await interaction.reply({ content: `Recorded <@${user.id}> for **${slotLabel}**.`, flags: MessageFlags.Ephemeral });
    await handleSlotChoice(interaction.client, state, saveState, user.id, slotIndex);
  },
};
