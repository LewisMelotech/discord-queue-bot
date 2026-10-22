const UK_TIMEZONE = 'Europe/London';

const DAY_ALIASES = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function ukDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** The next occurrence of dayIndex (0=Sun..6=Sat) in UK local time, counting today if it matches. */
function nextUkOccurrence(dayIndex, now) {
  const { year, month, day } = ukDateParts(now);
  const todayUtcMidnight = new Date(Date.UTC(year, month - 1, day));
  const offset = (dayIndex - todayUtcMidnight.getUTCDay() + 7) % 7;
  const target = new Date(todayUtcMidnight);
  target.setUTCDate(target.getUTCDate() + offset);
  return target;
}

/** Epoch ms for a UK wall-clock time, accounting for whether that date falls in GMT or BST. */
function ukLocalToEpoch(year, month, day, hour, minute) {
  const offsetAt = (epoch) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: UK_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date(epoch));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - epoch;
  };
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(first);
}

function formatUkDate(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(date);
}

const PLACEHOLDER_RE = /\{\{\s*next(?:\+(\d+))?\s*\}\}/g;

/** First recognizable day-of-week word anywhere in the label, or null. */
function findDayIndex(label) {
  const words = label.match(/[A-Za-z]+/g) || [];
  for (const word of words) {
    const index = DAY_ALIASES[word.toLowerCase()];
    if (index !== undefined) return index;
  }
  return null;
}

/**
 * Resolves {{next}} / {{next+N}} placeholders in each slot label to a UK
 * date, e.g. "Sat {{next}}" -> "Sat 22 Aug" and "Sat {{next+1}}" -> "Sat 29
 * Aug" (one week further out). The day used is the first day-of-week word
 * found anywhere in the label ("Sat" above); every placeholder in that
 * label resolves against it. Labels with no placeholder are left exactly
 * as typed. A placeholder in a label with no recognizable day word is left
 * unresolved, since there's nothing to compute it from.
 */
function withResolvedDates(slots, now = new Date()) {
  return slots.map((label) => {
    const dayIndex = findDayIndex(label);
    if (dayIndex === null) return label;
    return label.replace(PLACEHOLDER_RE, (_, offset) => {
      const weeks = offset ? parseInt(offset, 10) : 0;
      const date = nextUkOccurrence(dayIndex, now);
      date.setUTCDate(date.getUTCDate() + weeks * 7);
      return formatUkDate(date);
    });
  });
}

// "7pm", "7.30pm", "7:30 pm" (12-hour), or "19:00" (24-hour). A bare number
// like "25" never counts, so dates in a label aren't mistaken for times.
const TIME_RE = /(?<![\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?![a-z])|(?<![\d:.])(\d{1,2}):(\d{2})(?![\d:])/gi;
const EXACT_TIME_RE = new RegExp(`^\\s*(?:${TIME_RE.source})\\s*$`, 'i');

function toClockTime(match) {
  const [, h12, m12, meridiem, h24, m24] = match;
  if (meridiem) {
    const hour = parseInt(h12, 10);
    const minute = m12 ? parseInt(m12, 10) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return { hour: (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0), minute };
  }
  const hour = parseInt(h24, 10);
  const minute = parseInt(m24, 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** First valid time of day anywhere in the text, or null. */
function findTime(text) {
  for (const match of text.matchAll(TIME_RE)) {
    const time = toClockTime(match);
    if (time) return time;
  }
  return null;
}

/** Normalizes a standalone time ("7pm", "19:00") to "HH:MM", or null if it isn't one. */
function normalizeTime(input) {
  const match = EXACT_TIME_RE.exec(input);
  const time = match && toClockTime(match);
  if (!time) return null;
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/**
 * When each slot actually starts, as epoch ms (or null if it can't be
 * worked out), for event reminders. Works from the raw template labels,
 * before withResolvedDates: the date is the next occurrence of the label's
 * day-of-week word, pushed out by {{next+N}} weeks if there's a placeholder
 * (the same date withResolvedDates fills in). The time is the first time
 * found in the label ("Sat {{next}} 19:00"), falling back to the template's
 * default time. A slot with no day word, or no time from either place, is
 * null — it just doesn't get reminders.
 */
function slotStartTimes(slots, defaultTime = null, now = new Date()) {
  return slots.map((label) => {
    const dayIndex = findDayIndex(label);
    if (dayIndex === null) return null;
    const time = findTime(label.replace(PLACEHOLDER_RE, ' ')) ?? (defaultTime ? findTime(defaultTime) : null);
    if (!time) return null;
    const offset = new RegExp(PLACEHOLDER_RE.source).exec(label)?.[1];
    const date = nextUkOccurrence(dayIndex, now);
    date.setUTCDate(date.getUTCDate() + (offset ? parseInt(offset, 10) : 0) * 7);
    return ukLocalToEpoch(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), time.hour, time.minute);
  });
}

module.exports = { withResolvedDates, slotStartTimes, normalizeTime };
