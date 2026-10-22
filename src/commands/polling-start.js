const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const { startRound } = require('../logic/poll');
const { withResolvedDates, slotDates } = require('../logic/dates');
const { findTemplate, autocompleteTemplateName } = require('../logic/templates');
const { reminderTime } = require('../logic/reminders');

/** Tells the admin which slots will get a morning-of reminder, so one with no day is caught up front. */
function reminderSummary(state, slots, dates) {
  const time = reminderTime(state);
  if (!time) return null;
  const undated = slots.filter((_, i) => !dates[i]);
  if (undated.length === slots.length) {
    return 'No slot name has a day of the week in it, so no event reminders will go out.';
  }
  const lines = [`Whoever's in each slot gets a reminder DM at ${time} UK on the day.`];
  if (undated.length) lines.push(`No day of the week, so no reminder: ${undated.join(', ')}`);
  return lines.join('\n');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('polling-start')
    .setDescription('Start a new sign-up round using a saved template.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt.setName('template').setDescription('Which template to run').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription("Override this run's title (e.g. \"Halloween Storytelling\"). Doesn't change the saved template.")
        .setRequired(false),
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('Channel for the results announcement (defaults to the configured results channel).')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),

  autocomplete: autocompleteTemplateName,

  async execute(interaction, state, saveState) {
    if (state.round) {
      await interaction.reply({
        content: 'A round is already in progress — wait for it to finish before starting another.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const templateName = interaction.options.getString('template');
    const template = findTemplate(state, templateName);
    if (!template) {
      await interaction.reply({
        content: `No template named "${templateName}". Create one with /template-create first.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const titleOverride = interaction.options.getString('title')?.trim();
    if (interaction.options.getString('title') !== null && !titleOverride) {
      await interaction.reply({ content: 'Title cannot be blank.', flags: MessageFlags.Ephemeral });
      return;
    }
    const now = new Date();
    const runTemplate = {
      ...template,
      name: titleOverride || template.name,
      slots: withResolvedDates(template.slots, now),
      slotDates: slotDates(template.slots, now),
    };

    const channel = interaction.options.getChannel('channel') || null;
    const channelId = channel?.id || state.config.defaultResultsChannelId;
    if (!channelId) {
      await interaction.reply({
        content: 'No channel specified and no default results channel configured. Pass a channel option, or set one with /setup.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await startRound(interaction.client, state, saveState, channelId, runTemplate);
      const summary = reminderSummary(state, runTemplate.slots, runTemplate.slotDates);
      const status = state.round?.pendingUserId
        ? `Started **${runTemplate.name}**. DMing <@${state.round.pendingUserId}> first.`
        : 'Started the round, but it already concluded — check the results channel.';
      await interaction.editReply(summary ? `${status}\n\n${summary}` : status);
    } catch (err) {
      await interaction.editReply(`Couldn't start: ${err.message}`);
    }
  },
};
