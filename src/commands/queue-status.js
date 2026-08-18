const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-status')
    .setDescription('Show the current storyteller queue order and any in-progress round.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, state) {
    if (state.queue.length === 0) {
      await interaction.reply({ content: 'The queue is empty. Run /queue-sync first.', flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = state.queue.map((id, i) => `${i + 1}. <@${id}>`);
    let content = `**Queue (top → bottom):**\n${lines.join('\n')}`;

    if (state.round) {
      const filledLines = state.round.filled.map(
        (f) => `${state.round.slots[f.slotIndex]}: <@${f.userId}>`,
      );
      content += `\n\n**${state.round.title}** in progress (${state.round.filled.length}/${state.round.slots.length} slots filled)`;
      if (filledLines.length) content += `\n${filledLines.join('\n')}`;
      if (state.round.pendingUserId) content += `\nWaiting on: <@${state.round.pendingUserId}>`;
    }

    const snoozed = Object.entries(state.snoozedUntil).filter(([, until]) => until > Date.now());
    if (snoozed.length) {
      const snoozedLines = snoozed.map(
        ([id, until]) => `<@${id}> — back <t:${Math.floor(until / 1000)}:R>`,
      );
      content += `\n\n**Snoozed:**\n${snoozedLines.join('\n')}`;
    }

    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  },
};
