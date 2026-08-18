const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { syncQueueWithRole } = require('../logic/queue');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue-sync')
    .setDescription('Refresh the storyteller queue from the current role members.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, state, saveState) {
    if (!state.config.storytellerRoleId) {
      await interaction.reply({ content: 'Run /setup first to choose the queue role.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId));

    const role = await guild.roles.fetch(state.config.storytellerRoleId);
    if (!role) {
      await interaction.editReply('Could not find the configured storyteller role — it may have been deleted. Run /setup again.');
      return;
    }

    const members = await guild.members.fetch();
    const roleMemberIds = members
      .filter((m) => m.roles.cache.has(role.id) && !m.user.bot)
      .map((m) => m.id);

    const { queue, added, removed } = syncQueueWithRole(state.queue, roleMemberIds);
    state.queue = queue;
    for (const id of removed) delete state.snoozedUntil[id];
    saveState(state);

    const lines = [`Queue synced — ${queue.length} people with **${role.name}**.`];
    if (added.length) lines.push(`Added: ${added.map((id) => `<@${id}>`).join(', ')}`);
    if (removed.length) lines.push(`Removed (no longer have the role): ${removed.map((id) => `<@${id}>`).join(', ')}`);

    await interaction.editReply(lines.join('\n'));
  },
};
