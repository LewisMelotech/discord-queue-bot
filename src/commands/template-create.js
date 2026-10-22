const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { MAX_SLOTS } = require('../logic/poll');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-create')
    .setDescription('Create or update a poll template (a title plus named slots).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Template title, e.g. "Weekend Storytelling"').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('slots')
        .setDescription('Comma-separated slots, e.g. "Sat {{next}} AM, Sun {{next}}" ({{next+N}} = N weeks later)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('intro')
        .setDescription('Custom DM greeting (default: "Hello, I\'m the scheduler for <server>.")')
        .setRequired(false),
    ),

  async execute(interaction, state, saveState) {
    const name = interaction.options.getString('name').trim();
    const slots = interaction.options
      .getString('slots')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const intro = interaction.options.getString('intro')?.trim() || null;

    if (!name) {
      await interaction.reply({ content: 'Template name cannot be empty.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (slots.length === 0) {
      await interaction.reply({ content: 'Provide at least one slot name.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (slots.length > MAX_SLOTS) {
      await interaction.reply({
        content: `Too many slots — max ${MAX_SLOTS} per template.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const key = name.toLowerCase();
    const isUpdate = Boolean(state.templates[key]);
    state.templates[key] = { name, slots, intro };
    saveState(state);

    const lines = [`${isUpdate ? 'Updated' : 'Created'} template **${name}** with slots: ${slots.join(', ')}`];
    lines.push(
      intro
        ? `DM greeting: "${intro}"`
        : 'DM greeting: default ("Hello, I\'m the scheduler for <server>.") — pass intro: to customize.',
    );

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  },
};
