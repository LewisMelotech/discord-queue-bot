/** Best-effort post to the configured log channel; a missing config or a send failure is a silent no-op. */
async function postToLogChannel(client, state, message) {
  const logChannelId = state.config?.logChannelId;
  if (!logChannelId) return;
  try {
    const channel = await client.channels.fetch(logChannelId);
    await channel.send(message);
  } catch (err) {
    console.error('Failed to post to log channel:', err.message);
  }
}

module.exports = { postToLogChannel };
