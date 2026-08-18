function findTemplate(state, name) {
  return state.templates[name.trim().toLowerCase()];
}

async function autocompleteTemplateName(interaction, state) {
  const focused = interaction.options.getFocused().toLowerCase();
  const choices = Object.values(state.templates)
    .map((t) => t.name)
    .filter((name) => name.toLowerCase().includes(focused))
    .slice(0, 25);
  await interaction.respond(choices.map((name) => ({ name, value: name })));
}

module.exports = { findTemplate, autocompleteTemplateName };
