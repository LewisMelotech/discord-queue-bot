const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { moveByOffset } = require('../logic/queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-move')
    .setDescription('Manually move someone up or down in the queue.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((opt) => opt.setName('user').setDescription('Who to move').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('direction')
        .setDescription('Toward the front (sooner) or back (later) of the queue')
        .setRequired(true)
        .addChoices({ name: 'Up (sooner)', value: 'up' }, { name: 'Down (later)', value: 'down' }),
    )
    .addIntegerOption((opt) =>
      opt.setName('by').setDescription('How many positions to move (default 1)').setRequired(false).setMinValue(1),
    ),

  async execute(interaction, state, saveState) {
    const user = interaction.options.getUser('user');
    const direction = interaction.options.getString('direction');
    const amount = interaction.options.getInteger('by') ?? 1;

    if (!state.queue.includes(user.id)) {
      await interaction.reply({ content: `<@${user.id}> isn't in the queue.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const delta = direction === 'up' ? -amount : amount;
    state.queue = moveByOffset(state.queue, user.id, delta);
    saveState(state);

    const newPosition = state.queue.indexOf(user.id) + 1;
    await interaction.reply({
      content: `Moved <@${user.id}> ${direction} — now #${newPosition} of ${state.queue.length} in the queue.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
