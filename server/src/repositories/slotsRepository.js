import { pool } from '../db/pool.js';

/**
 * Canonical slot timestamp derivation, expressed once.
 *
 * Index 0 is 09:00-10:00 in Asia/Kolkata; index 7 is 16:00-17:00. The database
 * converts the campus wall-clock time to an absolute instant, so no other layer
 * performs timezone arithmetic.
 */
const SLOT_TIMES = `
  (s.booking_date + TIME '09:00' + s.slot_index * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS "startsAt",
  (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS "endsAt"
`;

/**
 * Availability for one resource on one campus date.
 *
 * Each slot reports whether it is open, already booked and whether its start
 * has passed, all evaluated against server time.
 */
export async function listForResourceAndDate(resourceId, bookingDate) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.slot_index AS "slotIndex",
       to_char(s.booking_date, 'YYYY-MM-DD') AS "bookingDate",
       s.is_open AS "isOpen",
       ${SLOT_TIMES},
       EXISTS (
         SELECT 1 FROM bookings b
         WHERE b.slot_id = s.id AND b.status = 'CONFIRMED'
       ) AS "isBooked",
       (
         (s.booking_date + TIME '09:00' + s.slot_index * INTERVAL '1 hour')
           AT TIME ZONE 'Asia/Kolkata'
       ) <= now() AS "hasStarted"
     FROM resource_slots s
     WHERE s.resource_id = $1 AND s.booking_date = $2::date
     ORDER BY s.slot_index`,
    [resourceId, bookingDate],
  );

  return rows;
}

/**
 * Publishes canonical slots for a date range.
 *
 * The caller supplies only the range; indexes 0-7 are constructed here. Rows
 * that already exist are left untouched, so a closed slot is never reopened.
 *
 * @returns {Promise<number>} number of slots newly created
 */
export async function generate(resourceId, dates, indexes) {
  const { rowCount } = await pool.query(
    `INSERT INTO resource_slots (resource_id, booking_date, slot_index)
     SELECT $1, d.booking_date, s.slot_index
     FROM unnest($2::date[]) AS d(booking_date)
     CROSS JOIN unnest($3::smallint[]) AS s(slot_index)
     ON CONFLICT (resource_id, booking_date, slot_index) DO NOTHING`,
    [resourceId, dates, indexes],
  );

  return rowCount;
}

/** Reads one slot with its derived timestamps and resource state. */
export async function findById(slotId) {
  const { rows } = await pool.query(
    `SELECT
       s.id,
       s.resource_id AS "resourceId",
       s.slot_index AS "slotIndex",
       to_char(s.booking_date, 'YYYY-MM-DD') AS "bookingDate",
       s.is_open AS "isOpen",
       r.is_active AS "resourceIsActive",
       r.name AS "resourceName",
       ${SLOT_TIMES}
     FROM resource_slots s
     JOIN resources r ON r.id = s.resource_id
     WHERE s.id = $1`,
    [slotId],
  );

  return rows[0] ?? null;
}

/**
 * Opens or closes a slot.
 *
 * Closure is rejected upstream when a confirmed booking has not yet ended;
 * this function performs the write only.
 */
export async function setOpenState(slotId, isOpen) {
  const { rows } = await pool.query(
    `UPDATE resource_slots SET is_open = $2 WHERE id = $1
     RETURNING id, is_open AS "isOpen", slot_index AS "slotIndex",
               to_char(booking_date, 'YYYY-MM-DD') AS "bookingDate"`,
    [slotId, isOpen],
  );

  return rows[0] ?? null;
}
