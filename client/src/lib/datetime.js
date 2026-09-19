/**
 * Campus-timezone formatting.
 *
 * Every timestamp the API returns is an absolute instant; the UI always renders
 * it in the single campus timezone so a student in another timezone still sees
 * campus hours.
 */
export const CAMPUS_TIMEZONE = 'Asia/Kolkata'
export const TIMEZONE_LABEL = 'IST'

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAMPUS_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAMPUS_TIMEZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatTime(isoString) {
  return timeFormatter.format(new Date(isoString))
}

export function formatDate(isoString) {
  return dateFormatter.format(new Date(isoString))
}

/** e.g. "Mon, 5 Oct 2026, 09:00-10:00 IST" */
export function formatSlotRange(startsAt, endsAt) {
  return `${dateFormatter.format(new Date(startsAt))}, ${formatTime(startsAt)}-${formatTime(endsAt)} ${TIMEZONE_LABEL}`
}

/**
 * Formats a YYYY-MM-DD calendar date without timezone conversion.
 *
 * Parsing the string directly avoids the browser's local timezone shifting the
 * date across midnight.
 */
export function formatCalendarDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day, 12)))
}

/** Today's campus date as YYYY-MM-DD, derived in the campus timezone. */
export function campusToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The 14 campus dates students may book. */
export function bookingWindowDates() {
  const start = campusToday()
  return Array.from({ length: 14 }, (_, offset) => addDays(start, offset))
}
