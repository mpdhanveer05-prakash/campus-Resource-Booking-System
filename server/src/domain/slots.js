/**
 * Canonical campus slot arithmetic.
 *
 * Every bookable interval is a (booking_date, slot_index) pair in the single
 * campus timezone. All derivation happens here so no other module invents its
 * own time handling.
 */

export const CAMPUS_TIMEZONE = 'Asia/Kolkata';

/** First bookable hour, 24h clock, campus local time. */
export const FIRST_SLOT_HOUR = 9;

/** Slot indexes 0..7 map to 09:00-10:00 .. 16:00-17:00. */
export const SLOT_COUNT = 8;
export const MIN_SLOT_INDEX = 0;
export const MAX_SLOT_INDEX = SLOT_COUNT - 1;

/** Students may book today through 13 days ahead: a 14-date window. */
export const BOOKING_WINDOW_DAYS = 14;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a Date as the YYYY-MM-DD calendar date in the campus timezone.
 *
 * Uses en-CA because it renders ISO-ordered dates.
 *
 * @param {Date} instant
 * @returns {string}
 */
export function toCampusDateString(instant) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The current campus calendar date, derived on the server.
 *
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export function currentCampusDate(now = new Date()) {
  return toCampusDateString(now);
}

/**
 * Validates the shape of a calendar date string without timezone conversion.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Adds whole days to a YYYY-MM-DD string, staying in calendar arithmetic.
 *
 * @param {string} dateString
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Inclusive list of calendar dates between two YYYY-MM-DD strings.
 *
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {string[]}
 */
export function dateRange(fromDate, toDate) {
  const dates = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return dates;
}

/**
 * The last calendar date students may book, inclusive.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function bookingWindowEnd(now = new Date()) {
  return addDays(currentCampusDate(now), BOOKING_WINDOW_DAYS - 1);
}

/**
 * Whether a calendar date falls inside the booking window.
 *
 * @param {string} dateString
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isWithinBookingWindow(dateString, now = new Date()) {
  return dateString >= currentCampusDate(now) && dateString <= bookingWindowEnd(now);
}

/**
 * Campus-local wall-clock label for a slot index, e.g. "09:00-10:00".
 *
 * @param {number} slotIndex
 * @returns {string}
 */
export function slotLabel(slotIndex) {
  const startHour = FIRST_SLOT_HOUR + slotIndex;
  const pad = (hour) => String(hour).padStart(2, '0');
  return `${pad(startHour)}:00-${pad(startHour + 1)}:00`;
}
