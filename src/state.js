const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function defaultState() {
  return {
    // Set via /setup.
    config: {
      storytellerRoleId: null,
      defaultResultsChannelId: null,
    },
    // Ordered array of user IDs. Index 0 is next up.
    queue: [],
    // Saved poll templates, keyed by lowercased name.
    templates: {},
    // Current poll round, or null if none is active.
    round: null,
    // The most recently completed round's results, kept around so a ❌
    // reaction on that message can reopen a slot. Cleared once a new round
    // (fresh or reopened) starts.
    lastRound: null,
    // userId -> epoch ms until which they're skipped by every round,
    // regardless of any other action. Cleared automatically once it's
    // passed, or in bulk via /clear-snooze.
    snoozedUntil: {},
  };
}

/*
 * template shape (state.templates[name.toLowerCase()]):
 * {
 *   name: string,    // display title, e.g. "Weekend Storytelling"
 *   slots: string[], // slot labels in order, e.g. ["Friday", "Saturday AM", ...]
 * }
 *
 * round shape:
 * {
 *   id: string,               // unique id, invalidates stale button clicks after a restart/new round
 *   channelId: string,        // where the ping + final results get posted
 *   title: string,            // copied from the template at start time
 *   slots: string[],          // copied from the template at start time
 *   filled: [{ slotIndex: number, userId: string }], // a userId can appear more than once
 *   askedThisRound: string[],      // userIds contacted at least once this round
 *   ineligibleThisRound: string[], // userIds who passed or couldn't be reached — never asked again this round
 *   pendingUserId: string | null,  // who we're currently waiting on
 *   startedAt: number,
 * }
 *
 * lastRound shape:
 * {
 *   title: string,
 *   slots: string[],
 *   filled: [{ slotIndex: number, userId: string }],
 *   channelId: string,
 *   resultsMessageId: string,
 * }
 */

function load() {
  if (!fs.existsSync(STATE_FILE)) {
    return defaultState();
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (err) {
    console.error('Failed to read state.json, starting fresh:', err);
    return defaultState();
  }
}

function save(state) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

module.exports = { load, save };
