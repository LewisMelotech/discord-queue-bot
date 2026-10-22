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
      logChannelId: null,
      // Whether to DM whoever's in a slot on the morning of its day, and
      // at what "HH:MM" UK time (null = 09:00). Off until turned on with
      // /reminders-setup.
      remindersEnabled: false,
      reminderTime: null,
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
    // passed, or in bulk via /queue-snooze-clear.
    snoozedUntil: {},
    // One entry per slot on a known day, not yet over, that someone's in.
    // Kept apart from round/lastRound so reminders still go out after the
    // next round starts. Dropped once that day is over.
    upcomingEvents: [],
  };
}

/*
 * template shape (state.templates[name.toLowerCase()]):
 * {
 *   name: string,        // display title, e.g. "Weekend Storytelling"
 *   slots: string[],     // slot labels in order, e.g. ["Friday", "Saturday AM", ...]
 *   intro: string | null, // custom DM greeting; null means use the auto-generated default
 * }
 *
 * round shape:
 * {
 *   id: string,               // unique id, invalidates stale button clicks after a restart/new round
 *   eventGroupId: string,     // ties upcomingEvents to this round; kept when a drop-out reopens it (new id)
 *   channelId: string,        // where the ping + final results get posted
 *   title: string,            // copied from the template at start time
 *   slots: string[],          // copied from the template at start time
 *   slotDates: (string | null)[], // "YYYY-MM-DD" UK day each slot falls on, null if unknown (see dates.slotDates)
 *   intro: string,            // resolved DM greeting (template's custom one, or the default) — fixed for the round
 *   filled: [{ slotIndex: number, userId: string }], // a userId can appear more than once
 *   askedThisRound: string[],      // userIds contacted at least once this round
 *   ineligibleThisRound: string[], // userIds who passed or couldn't be reached — never asked again this round
 *   pendingUserId: string | null,  // who we're currently waiting on
 *   pendingSince: number | null,   // epoch ms they were asked — past 24h, checkForTimeouts skips+snoozes them
 *   resultsMessageId: string | null, // the live results message, posted at round start and edited as slots fill
 *   startedAt: number,
 * }
 *
 * lastRound shape:
 * {
 *   title: string,
 *   slots: string[],
 *   intro: string,
 *   filled: [{ slotIndex: number, userId: string }],
 *   channelId: string,
 *   resultsMessageId: string,
 *   eventGroupId: string,
 *   slotDates: (string | null)[],
 * }
 *
 * upcomingEvents entry shape:
 * {
 *   groupId: string,     // the round's eventGroupId
 *   slotIndex: number,
 *   title: string,
 *   slotLabel: string,
 *   date: string,        // "YYYY-MM-DD", UK
 *   attendees: { [userId]: { addedAt: number, reminded: boolean } },
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
