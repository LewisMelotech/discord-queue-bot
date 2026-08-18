const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the queue role, results channel, and log channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption((opt) =>
      opt.setName('role').setDescription('Role whose members make up the sign-up queue').setRequired(true),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription("Default channel for round pings and results (can still be overridden per /polling-start)")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName('logs')
        .setDescription('Channel to post a line each time someone is DMed (optional, off by default)')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');
    const logs = interaction.options.getChannel('logs');

    state.config.storytellerRoleId = role.id;
    if (channel) state.config.defaultResultsChannelId = channel.id;
    if (logs) state.config.logChannelId = logs.id;
    saveState(state);

    const lines = [`Queue role set to **${role.name}**.`];
    lines.push(
      channel
        ? `Default results channel set to <#${channel.id}>.`
        : state.config.defaultResultsChannelId
          ? `Default results channel remains <#${state.config.defaultResultsChannelId}>.`
          : 'No default results channel set — pass one with /polling-start channel: each time, or run /setup again with channel:.',
    );
    lines.push(
      logs
        ? `Log channel set to <#${logs.id}>.`
        : state.config.logChannelId
          ? `Log channel remains <#${state.config.logChannelId}>.`
          : 'No log channel set — who\'s being messaged stays visible only in ephemeral replies. Run /setup again with logs: to enable it.',
    );

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
