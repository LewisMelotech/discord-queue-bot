const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { moveToBottom } = require('../logic/queue');
const { buildResultsEmbed, REOPEN_HINT } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polling-edit')
    .setDescription("Add or remove someone from a slot on the last completed round.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('slot').setDescription('Which slot to edit').setRequired(true).setAutocomplete(true),
    )
    .addUserOption((opt) => opt.setName('user').setDescription('Who to add or remove').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Add them to the slot, or remove them from it')
        .setRequired(true)
        .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }),
    )
    .addBooleanOption((opt) =>
      opt.setName('move').setDescription('If adding: also move them to the bottom of the queue (default: yes)').setRequired(false),
    ),

  async autocomplete(interaction, state) {
    const last = state.lastRound;
    if (!last) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = last.slots
      .map((label, index) => ({ name: `${index + 1}. ${label}`.slice(0, 100), value: String(index) }))
      .filter((c) => c.name.toLowerCase().includes(focused))
      .slice(0, 25);
    await interaction.respond(choices);
  },

  async execute(interaction, state, saveState) {
    const last = state.lastRound;
    if (!last) {
      await interaction.reply({ content: 'No completed round to edit.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (state.round) {
      await interaction.reply({
        content: 'A round is currently in progress — wait for it to finish, or /polling-stop it, before editing results.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const slotIndex = parseInt(interaction.options.getString('slot'), 10);
    if (Number.isNaN(slotIndex) || slotIndex < 0 || slotIndex >= last.slots.length) {
      await interaction.reply({ content: 'Unrecognized slot — pick one from the list.', flags: MessageFlags.Ephemeral });
      return;
    }
    const slotLabel = last.slots[slotIndex];

    const user = interaction.options.getUser('user');
    const action = interaction.options.getString('action');
    const move = interaction.options.getBoolean('move') ?? true;
    const alreadyThere = last.filled.some((f) => f.slotIndex === slotIndex && f.userId === user.id);

    let summary;
    if (action === 'add') {
      if (alreadyThere) {
        summary = `<@${user.id}> is already in **${slotLabel}**.`;
      } else {
        last.filled.push({ slotIndex, userId: user.id });
        if (move) state.queue = moveToBottom(state.queue, user.id);
        summary = `Added <@${user.id}> to **${slotLabel}**.`;
      }
    } else if (!alreadyThere) {
      summary = `<@${user.id}> isn't in **${slotLabel}**.`;
    } else {
      last.filled = last.filled.filter((f) => !(f.slotIndex === slotIndex && f.userId === user.id));
      summary = `Removed <@${user.id}> from **${slotLabel}**.`;
    }

    saveState(state);

    try {
      const channel = await interaction.client.channels.fetch(last.channelId);
      const message = await channel.messages.fetch(last.resultsMessageId);
      await message.edit({ embeds: [buildResultsEmbed(last.title, last.slots, last.filled, REOPEN_HINT)] });
    } catch (err) {
      console.error('Failed to refresh results message:', err.message);
      summary += `\n(Couldn't refresh the results message: ${err.message})`;
    }

    await interaction.reply({ content: summary, flags: MessageFlags.Ephemeral });
  },
};
