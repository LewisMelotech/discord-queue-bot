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

// "9am", "8.30am", "8:30 am" (12-hour), or "08:30" (24-hour).
const TIME_RE = /^\s*(?:(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)|(\d{1,2}):(\d{2}))\s*$/i;

/** Normalizes a time of day ("9am", "08:30") to "HH:MM", or null if it isn't one. */
function normalizeTime(input) {
  const match = TIME_RE.exec(input);
  if (!match) return null;
  const [, h12, m12, meridiem, h24, m24] = match;
  let hour;
  let minute;
  if (meridiem) {
    hour = parseInt(h12, 10);
    minute = m12 ? parseInt(m12, 10) : 0;
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0);
  } else {
    hour = parseInt(h24, 10);
    minute = parseInt(m24, 10);
    if (hour > 23) return null;
  }
  if (minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The UK date each slot falls on, as "YYYY-MM-DD" (or null), for event
 * reminders. Works from the raw template labels, before withResolvedDates:
 * the next occurrence of the label's day-of-week word, pushed out by
 * {{next+N}} weeks if there's a placeholder — the same date
 * withResolvedDates fills in. A label with no day word is null.
 */
function slotDates(slots, now = new Date()) {
  return slots.map((label) => {
    const dayIndex = findDayIndex(label);
    if (dayIndex === null) return null;
    const offset = new RegExp(PLACEHOLDER_RE.source).exec(label)?.[1];
    const date = nextUkOccurrence(dayIndex, now);
    date.setUTCDate(date.getUTCDate() + (offset ? parseInt(offset, 10) : 0) * 7);
    return date.toISOString().slice(0, 10);
  });
}

/** Epoch ms of an "HH:MM" UK time on a "YYYY-MM-DD" date. */
function ukDateTimeToEpoch(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return ukLocalToEpoch(year, month, day, hour, minute);
}

/** Epoch ms of the UK midnight that ends a "YYYY-MM-DD" date. */
function ukEndOfDay(date) {
  const [year, month, day] = date.split('-').map(Number);
  return ukLocalToEpoch(year, month, day + 1, 0, 0);
}

/** "2026-10-24" -> "Sat 24 Oct". */
function formatDay(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(',', '');
}

module.exports = { withResolvedDates, slotDates, normalizeTime, ukDateTimeToEpoch, ukEndOfDay, formatDay };
