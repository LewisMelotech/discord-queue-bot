const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, MessageFlags } = require('discord.js');
const config = require('./config');
const stateStore = require('./state');
const { handleSlotChoice, handlePass, handleSnooze, reopenVacatedSlots, DROP_OUT_EMOJI } = require('./logic/poll');

// GuildMembers is a privileged intent — enable it for this bot in the
// Discord Developer Portal under Bot > Privileged Gateway Intents.
// GuildMessages/GuildMessageReactions are needed to see the drop-out (❌)
// reaction on results messages; neither is privileged.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

let state = stateStore.load();
function saveState(next) {
  state = next;
  stateStore.save(state);
}

const commandsData = [...client.commands.values()].map((c) => c.data.toJSON());

async function registerCommands(guild) {
  try {
    await guild.commands.set(commandsData);
    console.log(`Registered ${commandsData.length} commands in ${guild.name}.`);
  } catch (err) {
    console.error(`Failed to register commands in ${guild.name}:`, err.message);
  }
}

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await Promise.all(client.guilds.cache.map(registerCommands));
});

// Registers commands automatically if the bot is added to a new server
// while already running, without needing a restart.
client.on('guildCreate', registerCommands);

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, state, saveState);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      await command.autocomplete(interaction, state);
      return;
    }

    if (interaction.isButton()) {
      const [namespace, action, a, b] = interaction.customId.split(':');
      if (namespace !== 'poll') return;

      if (!state.round) {
        await interaction.update({ content: 'This round has already ended.', components: [] });
        return;
      }

      const roundId = action === 'slot' ? b : a;
      if (roundId !== state.round.id) {
        await interaction.update({ content: 'This round has ended — this button is no longer active.', components: [] });
        return;
      }

      if (state.round.pendingUserId !== interaction.user.id) {
        await interaction.reply({ content: "It's not your turn right now.", flags: MessageFlags.Ephemeral });
        return;
      }

      if (action === 'slot') {
        const slotIndex = parseInt(a, 10);
        const label = state.round.slots[slotIndex] ?? `Slot ${slotIndex + 1}`;
        await interaction.update({ content: `You're in for **${label}**. Thanks!`, components: [] });
        await handleSlotChoice(client, state, saveState, interaction.user.id, slotIndex);
      } else if (action === 'pass') {
        await interaction.update({ content: "Don't worry, we will try again soon.", components: [] });
        await handlePass(client, state, saveState, interaction.user.id);
      } else if (action === 'snooze') {
        await interaction.update({
          content: "Got it — you won't be asked again for a month. An admin can clear this early with /clear-snooze.",
          components: [],
        });
        await handleSnooze(client, state, saveState, interaction.user.id);
      }
    }
  } catch (err) {
    console.error('Error handling interaction:', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong handling that.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.emoji.name !== DROP_OUT_EMOJI) return;
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    if (!state.lastRound || reaction.message.id !== state.lastRound.resultsMessageId) return;

    if (state.round) {
      await reaction.message.channel
        .send(`<@${user.id}> a round is already in progress — an admin will need to adjust this manually.`)
        .catch(() => {});
      return;
    }

    await reopenVacatedSlots(client, state, saveState, user.id);
  } catch (err) {
    console.error('Error handling drop-out reaction:', err);
  }
});

client.login(config.token).catch((err) => {
  console.error('Failed to log in:', err.message);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down.`);
    client.destroy();
    process.exit(0);
  });
}
