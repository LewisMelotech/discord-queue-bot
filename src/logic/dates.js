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

module.exports = { withResolvedDates };
