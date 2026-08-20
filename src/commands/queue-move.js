const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { moveByOffset, moveToPosition } = require('../logic/queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-move')
    .setDescription('Manually move someone up, down, or to a specific spot in the queue.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) => opt.setName('user').setDescription('Who to move').setRequired(true))
    .addIntegerOption((opt) =>
      opt
        .setName('position')
        .setDescription('Move directly to this spot (1 = front) — everyone between shifts to make room')
        .setRequired(false)
        .setMinValue(1),
    )
    .addStringOption((opt) =>
      opt
        .setName('direction')
        .setDescription('Instead of position: toward the front (sooner) or back (later), relative to now')
        .setRequired(false)
        .addChoices({ name: 'Up (sooner)', value: 'up' }, { name: 'Down (later)', value: 'down' }),
    )
    .addIntegerOption((opt) =>
      opt.setName('by').setDescription('With direction: how many positions to move (default 1)').setRequired(false).setMinValue(1),
    ),

  async execute(interaction, state, saveState) {
    const user = interaction.options.getUser('user');
    const position = interaction.options.getInteger('position');
    const direction = interaction.options.getString('direction');
    const amount = interaction.options.getInteger('by') ?? 1;

    if (!state.queue.includes(user.id)) {
      await interaction.reply({ content: `<@${user.id}> isn't in the queue.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (position !== null && direction !== null) {
      await interaction.reply({ content: 'Use either position or direction, not both.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (position === null && direction === null) {
      await interaction.reply({ content: 'Provide either position or direction.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (position !== null) {
      state.queue = moveToPosition(state.queue, user.id, position);
    } else {
      const delta = direction === 'up' ? -amount : amount;
      state.queue = moveByOffset(state.queue, user.id, delta);
    }
    saveState(state);

    const newPosition = state.queue.indexOf(user.id) + 1;
    await interaction.reply({
      content: `Moved <@${user.id}> — now #${newPosition} of ${state.queue.length} in the queue.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
