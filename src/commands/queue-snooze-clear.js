const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear-snooze')
    .setDescription("Clear everyone's snooze and DM them that they're back in the rotation.")
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
    const roleMemberIds = members.filter((m) => m.roles.cache.has(role.id) && !m.user.bot).map((m) => m.id);

    const snoozedRoleMembers = roleMemberIds.filter((id) => state.snoozedUntil[id]);
    if (snoozedRoleMembers.length === 0) {
      await interaction.editReply('Nobody with the queue role is currently snoozed.');
      return;
    }

    for (const id of snoozedRoleMembers) delete state.snoozedUntil[id];
    saveState(state);

    let notified = 0;
    for (const id of snoozedRoleMembers) {
      try {
        const user = await interaction.client.users.fetch(id);
        await user.send("Your snooze has been cleared — you're back in the sign-up rotation.");
        notified++;
      } catch (err) {
        console.error(`Could not notify ${id} about cleared snooze:`, err.message);
      }
    }

    await interaction.editReply(
      `Cleared snooze for ${snoozedRoleMembers.length} member${snoozedRoleMembers.length === 1 ? '' : 's'} (notified ${notified}).`,
    );
  },
};
