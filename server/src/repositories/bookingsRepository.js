import { pool } from '../db/pool.js';

/**
 * Name of the partial unique index that enforces one confirmed booking per
 * slot. Only a violation of this specific constraint means "already booked";
 * every other database error must keep its own meaning.
 */
export const CONFIRMED_BOOKING_INDEX = 'one_confirmed_booking_per_slot';

const BOOKING_SELECT = `
  b.id,
  b.status,
  b.purpose,
  b.created_at AS "createdAt",
  b.cancelled_at AS "cancelledAt",
  b.cancellation_reason AS "cancellationReason",
  b.user_id AS "userId",
  b.slot_id AS "slotId",
  s.slot_index AS "slotIndex",
  to_char(s.booking_date, 'YYYY-MM-DD') AS "bookingDate",
  (s.booking_date + TIME '09:00' + s.slot_index * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS "startsAt",
  (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS "endsAt",
  r.id AS "resourceId",
  r.name AS "resourceName",
  r.location AS "resourceLocation",
  r.category AS "resourceCategory"
`;

const BOOKING_JOINS = `
  FROM bookings b
  JOIN resource_slots s ON s.id = b.slot_id
  JOIN resources r ON r.id = s.resource_id
`;

/**
 * Locks the resource row, then its slot row, in that order.
 *
 * Every operation that mutates bookings uses this same order so concurrent
 * requests cannot deadlock against each other.
 *
 * @param {import('pg').PoolClient} client A client inside an open transaction.
 */
export async function lockResourceThenSlot(client, slotId) {
  const { rows } = await client.query(
    `SELECT s.resource_id FROM resource_slots s WHERE s.id = $1`,
    [slotId],
  );

  if (rows.length === 0) return null;

  await client.query('SELECT id FROM resources WHERE id = $1 FOR UPDATE', [rows[0].resource_id]);

  const { rows: slotRows } = await client.query(
    `SELECT
       s.id,
       s.resource_id AS "resourceId",
       s.slot_index AS "slotIndex",
       to_char(s.booking_date, 'YYYY-MM-DD') AS "bookingDate",
       s.is_open AS "isOpen",
       r.is_active AS "resourceIsActive",
       (
         (s.booking_date + TIME '09:00' + s.slot_index * INTERVAL '1 hour')
           AT TIME ZONE 'Asia/Kolkata'
       ) <= now() AS "hasStarted",
       (
         (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
           AT TIME ZONE 'Asia/Kolkata'
       ) <= now() AS "hasEnded"
     FROM resource_slots s
     JOIN resources r ON r.id = s.resource_id
     WHERE s.id = $1
     FOR UPDATE OF s`,
    [slotId],
  );

  return slotRows[0] ?? null;
}

/** Inserts a confirmed booking inside the caller's transaction. */
export async function insertConfirmed(client, { userId, slotId, purpose }) {
  const { rows } = await client.query(
    `INSERT INTO bookings (user_id, slot_id, purpose, status)
     VALUES ($1, $2, $3, 'CONFIRMED')
     RETURNING id, status, purpose, created_at AS "createdAt", slot_id AS "slotId"`,
    [userId, slotId, purpose.trim()],
  );

  return rows[0];
}

/** Records an audit event inside the caller's transaction. */
export async function insertEvent(client, { bookingId, actorUserId, eventType, details = {} }) {
  await client.query(
    `INSERT INTO booking_events (booking_id, actor_user_id, event_type, details)
     VALUES ($1, $2, $3, $4)`,
    [bookingId, actorUserId, eventType, JSON.stringify(details)],
  );
}

/** Reads a booking with its slot and resource context, for authorisation. */
export async function findByIdForUpdate(client, bookingId) {
  const { rows } = await client.query(
    `SELECT ${BOOKING_SELECT},
       (
         (s.booking_date + TIME '09:00' + s.slot_index * INTERVAL '1 hour')
           AT TIME ZONE 'Asia/Kolkata'
       ) <= now() AS "hasStarted",
       (
         (s.booking_date + TIME '09:00' + (s.slot_index + 1) * INTERVAL '1 hour')
           AT TIME ZONE 'Asia/Kolkata'
       ) <= now() AS "hasEnded"
     ${BOOKING_JOINS}
     WHERE b.id = $1
     FOR UPDATE OF b`,
    [bookingId],
  );

  return rows[0] ?? null;
}

/** Marks a booking cancelled inside the caller's transaction. */
export async function markCancelled(client, { bookingId, cancelledBy, reason }) {
  const { rows } = await client.query(
    `UPDATE bookings
     SET status = 'CANCELLED',
         cancelled_at = now(),
         cancelled_by = $2,
         cancellation_reason = $3
     WHERE id = $1
     RETURNING id, status, cancelled_at AS "cancelledAt",
               cancellation_reason AS "cancellationReason"`,
    [bookingId, cancelledBy, reason ?? null],
  );

  return rows[0];
}

/** Booking history for one user, newest first. */
export async function listForUser(userId, { page, pageSize }) {
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    pool.query(
      `SELECT ${BOOKING_SELECT} ${BOOKING_JOINS}
       WHERE b.user_id = $1
       ORDER BY s.booking_date DESC, s.slot_index DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
    pool.query('SELECT count(*)::int AS count FROM bookings WHERE user_id = $1', [userId]),
  ]);

  return { items: items.rows, total: total.rows[0].count };
}

/** Filtered booking list across all users. Admin only. */
export async function listAll({ status, resourceId, date, page, pageSize }) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`b.status = $${values.length}`);
  }

  if (resourceId) {
    values.push(resourceId);
    conditions.push(`r.id = $${values.length}`);
  }

  if (date) {
    values.push(date);
    conditions.push(`s.booking_date = $${values.length}::date`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    pool.query(
      `SELECT ${BOOKING_SELECT}, u.name AS "userName", u.email AS "userEmail"
       ${BOOKING_JOINS}
       JOIN users u ON u.id = b.user_id
       ${where}
       ORDER BY s.booking_date DESC, s.slot_index DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    pool.query(`SELECT count(*)::int AS count ${BOOKING_JOINS} ${where}`, values),
  ]);

  return { items: items.rows, total: total.rows[0].count };
}

/** Event history for one booking. */
export async function listEvents(bookingId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.event_type AS "eventType", e.occurred_at AS "occurredAt",
            e.details, u.name AS "actorName", u.email AS "actorEmail"
     FROM booking_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.booking_id = $1
     ORDER BY e.occurred_at`,
    [bookingId],
  );

  return rows;
}

export async function exists(bookingId) {
  const { rows } = await pool.query('SELECT 1 FROM bookings WHERE id = $1', [bookingId]);
  return rows.length > 0;
}
