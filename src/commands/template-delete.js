const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { findTemplate, autocompleteTemplateName } = require('../logic/templates');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('template-delete')
    .setDescription('Delete a saved poll template.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('name').setDescription('Which template to delete').setRequired(true).setAutocomplete(true),
    ),

  autocomplete: autocompleteTemplateName,

  async execute(interaction, state, saveState) {
    const name = interaction.options.getString('name');
    const template = findTemplate(state, name);
    if (!template) {
      await interaction.reply({ content: `No template named "${name}".`, flags: MessageFlags.Ephemeral });
      return;
    }

    delete state.templates[name.trim().toLowerCase()];
    saveState(state);

    await interaction.reply({ content: `Deleted template **${template.name}**.`, flags: MessageFlags.Ephemeral });
  },
};
