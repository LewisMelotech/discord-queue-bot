const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { findTemplate, autocompleteTemplateName } = require('../logic/templates');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-view')
    .setDescription('View a saved poll template, or list all of them.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Template to view (omit to list all templates)')
        .setRequired(false)
        .setAutocomplete(true),
    ),

  autocomplete: autocompleteTemplateName,

  async execute(interaction, state) {
    const templates = Object.values(state.templates);
    if (templates.length === 0) {
      await interaction.reply({
        content: 'No templates yet. Create one with /template-create.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const name = interaction.options.getString('name');
    if (!name) {
      const lines = templates.map((t) => `**${t.name}** — ${t.slots.length} slot${t.slots.length === 1 ? '' : 's'}`);
      await interaction.reply({ content: `**Templates:**\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
      return;
    }

    const template = findTemplate(state, name);
    if (!template) {
      await interaction.reply({ content: `No template named "${name}".`, flags: MessageFlags.Ephemeral });
      return;
    }

    const slotLines = template.slots.map((s, i) => `${i + 1}. ${s}`);
    await interaction.reply({ content: `**${template.name}**\n${slotLines.join('\n')}`, flags: MessageFlags.Ephemeral });
  },
};
