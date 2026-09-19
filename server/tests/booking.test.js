import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, pool } from '../src/db/pool.js';
import { currentCampusDate, addDays } from '../src/domain/slots.js';
import { resetDatabase } from './helpers/db.js';
import { signedInAdmin, signedInStudent } from './helpers/client.js';

let admin;
let studentA;
let studentB;
let resourceId;

/** A date comfortably inside the booking window. */
const TARGET_DATE = addDays(currentCampusDate(), 3);

/** A second date, so tests that need untouched slots do not collide. */
const SECOND_DATE = addDays(currentCampusDate(), 4);

beforeAll(async () => {
  await resetDatabase();

  admin = await signedInAdmin('admin@campus.local', 'Campus Admin');
  studentA = await signedInStudent('a@campus.local', 'Student A');
  studentB = await signedInStudent('b@campus.local', 'Student B');

  const created = await admin.post('/api/admin/resources', {
    name: 'Study Room A',
    category: 'Study Room',
    location: 'Library Floor 2',
    capacity: 6,
    description: 'Group study room.',
    rules: 'Keep it tidy.',
  });

  resourceId = created.body.data.id;

  await admin.post(`/api/admin/resources/${resourceId}/slots/generate`, {
    fromDate: TARGET_DATE,
    toDate: SECOND_DATE,
  });
});

afterAll(async () => {
  await closePool();
});

/** Reads an available slot id for the target date. */
async function availableSlotId(index = 0) {
  const response = await studentA.get(
    `/api/resources/${resourceId}/slots?date=${TARGET_DATE}`,
  );
  const slot = response.body.data.slots.find(
    (candidate) => candidate.slotIndex === index,
  );
  return slot.id;
}

/** Reads a slot id on the untouched second date. */
async function secondDateSlotId(index) {
  const response = await studentA.get(
    `/api/resources/${resourceId}/slots?date=${SECOND_DATE}`,
  );
  return response.body.data.slots.find((candidate) => candidate.slotIndex === index).id;
}

describe('catalogue and permissions', () => {
  it('lets a signed-in student read resources', async () => {
    const response = await studentA.get('/api/resources');

    expect(response.status).toBe(200);
    expect(response.body.data.items.length).toBeGreaterThan(0);
  });

  it('returns 401 for an unauthenticated catalogue request', async () => {
    const { createClient } = await import('./helpers/client.js');
    const anonymous = createClient();
    const response = await anonymous.get('/api/resources');

    expect(response.status).toBe(401);
  });

  it('returns 403 when a student calls an admin API directly', async () => {
    const list = await studentA.get('/api/admin/resources');
    expect(list.status).toBe(403);

    const create = await studentA.post('/api/admin/resources', {
      name: 'Rogue Resource',
      category: 'Lab',
      location: 'Nowhere',
      capacity: 1,
    });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');

    const { rows } = await pool.query('SELECT count(*)::int AS c FROM resources WHERE name = $1', [
      'Rogue Resource',
    ]);
    expect(rows[0].c).toBe(0);
  });

  it('exposes canonical IST timestamps for availability', async () => {
    const response = await studentA.get(
      `/api/resources/${resourceId}/slots?date=${TARGET_DATE}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.slots).toHaveLength(8);

    const first = response.body.data.slots[0];
    expect(first.slotIndex).toBe(0);
    // 09:00 IST is 03:30 UTC.
    expect(new Date(first.startsAt).toISOString()).toBe(`${TARGET_DATE}T03:30:00.000Z`);
    expect(new Date(first.endsAt).toISOString()).toBe(`${TARGET_DATE}T04:30:00.000Z`);
    expect(first.state).toBe('AVAILABLE');
  });

  it('rejects a date outside the booking window', async () => {
    const farFuture = addDays(currentCampusDate(), 30);
    const response = await studentA.get(
      `/api/resources/${resourceId}/slots?date=${farFuture}`,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DATE_OUT_OF_WINDOW');
  });

  it('generates slots idempotently and keeps closed slots closed', async () => {
    const slotId = await availableSlotId(7);

    const closed = await admin.patch(`/api/admin/slots/${slotId}`, { isOpen: false });
    expect(closed.status).toBe(200);
    expect(closed.body.data.isOpen).toBe(false);

    const regenerate = await admin.post(
      `/api/admin/resources/${resourceId}/slots/generate`,
      { fromDate: TARGET_DATE, toDate: TARGET_DATE },
    );

    expect(regenerate.status).toBe(200);
    expect(regenerate.body.data.slotsCreated).toBe(0);

    const { rows } = await pool.query('SELECT is_open FROM resource_slots WHERE id = $1', [slotId]);
    expect(rows[0].is_open).toBe(false);

    // Restore for later tests.
    await admin.patch(`/api/admin/slots/${slotId}`, { isOpen: true });
  });
});

describe('booking', () => {
  it('books an open future slot and records an event', async () => {
    const slotId = await availableSlotId(1);

    const response = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'Group revision session for the databases unit',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('CONFIRMED');

    const events = await admin.get(`/api/admin/bookings/${response.body.data.id}/events`);
    expect(events.status).toBe(200);
    expect(events.body.data.events).toHaveLength(1);
    expect(events.body.data.events[0].eventType).toBe('CREATED');
  });

  it('rejects a purpose shorter than 10 characters', async () => {
    const slotId = await availableSlotId(2);

    const response = await studentA.post('/api/bookings', { slotId, purpose: 'too short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignores a userId submitted in the request body', async () => {
    const slotId = await availableSlotId(3);

    const response = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'Booking that tries to impersonate another user',
      userId: '00000000-0000-0000-0000-000000000000',
    });

    expect(response.status).toBe(201);

    const { rows } = await pool.query(
      'SELECT u.email FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.id = $1',
      [response.body.data.id],
    );
    expect(rows[0].email).toBe('a@campus.local');
  });

  it('rejects booking a closed slot', async () => {
    const slotId = await availableSlotId(4);
    await admin.patch(`/api/admin/slots/${slotId}`, { isOpen: false });

    const response = await studentB.post('/api/bookings', {
      slotId,
      purpose: 'Trying to book a slot that is closed',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SLOT_CLOSED');

    await admin.patch(`/api/admin/slots/${slotId}`, { isOpen: true });
  });

  it('gives exactly one success when two users submit the same slot concurrently', async () => {
    const slotId = await availableSlotId(5);

    // Fire both without awaiting the first: the database must arbitrate.
    const [first, second] = await Promise.all([
      studentA.post('/api/bookings', { slotId, purpose: 'Student A wants this slot badly' }),
      studentB.post('/api/bookings', { slotId, purpose: 'Student B wants this slot badly' }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.error.code).toBe('SLOT_ALREADY_BOOKED');

    const { rows } = await pool.query(
      "SELECT count(*)::int AS c FROM bookings WHERE slot_id = $1 AND status = 'CONFIRMED'",
      [slotId],
    );
    expect(rows[0].c).toBe(1);
  });

  it('only returns the current user\'s bookings', async () => {
    const mine = await studentB.get('/api/bookings/mine');

    expect(mine.status).toBe(200);
    for (const booking of mine.body.data.items) {
      expect(booking.userId).toBeDefined();
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', ['b@campus.local']);
    for (const booking of mine.body.data.items) {
      expect(booking.userId).toBe(rows[0].id);
    }
  });
});

describe('cancellation', () => {
  it('refuses to cancel another user\'s booking', async () => {
    const slotId = await availableSlotId(6);
    const created = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'A booking that student B must not cancel',
    });

    const response = await studentB.post(`/api/bookings/${created.body.data.id}/cancel`);

    expect(response.status).toBe(403);

    const { rows } = await pool.query('SELECT status FROM bookings WHERE id = $1', [
      created.body.data.id,
    ]);
    expect(rows[0].status).toBe('CONFIRMED');
  });

  it('cancels then allows rebooking, preserving history', async () => {
    const slotId = await availableSlotId(0);

    const first = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'First booking that will be cancelled',
    });
    expect(first.status).toBe(201);

    const cancelled = await studentA.post(`/api/bookings/${first.body.data.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const second = await studentB.post('/api/bookings', {
      slotId,
      purpose: 'Rebooking the slot after it was released',
    });
    expect(second.status).toBe(201);

    // Both rows survive: history is retained.
    const { rows } = await pool.query(
      'SELECT status FROM bookings WHERE slot_id = $1 ORDER BY created_at',
      [slotId],
    );
    expect(rows.map((row) => row.status)).toEqual(['CANCELLED', 'CONFIRMED']);
  });

  it('repeating an authorised cancellation adds no second event', async () => {
    const slotId = await secondDateSlotId(1);
    const created = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'Booking cancelled twice in a row',
    });
    expect(created.status).toBe(201);

    const firstCancel = await studentA.post(`/api/bookings/${created.body.data.id}/cancel`);
    const secondCancel = await studentA.post(`/api/bookings/${created.body.data.id}/cancel`);

    expect(firstCancel.status).toBe(200);
    expect(secondCancel.status).toBe(200);
    expect(secondCancel.body.data.status).toBe('CANCELLED');
    expect(secondCancel.body.data.alreadyCancelled).toBe(true);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS c FROM booking_events WHERE booking_id = $1 AND event_type = 'CANCELLED'",
      [created.body.data.id],
    );
    expect(rows[0].c).toBe(1);
  });

  it('requires a reason when an admin cancels someone else\'s booking', async () => {
    const slotId = await secondDateSlotId(0);
    const created = await studentB.post('/api/bookings', {
      slotId,
      purpose: 'Booking that an admin will try to cancel',
    });
    expect(created.status).toBe(201);

    const withoutReason = await admin.post(`/api/bookings/${created.body.data.id}/cancel`);
    expect(withoutReason.status).toBe(400);
    expect(withoutReason.body.error.code).toBe('REASON_REQUIRED');

    const withReason = await admin.post(`/api/bookings/${created.body.data.id}/cancel`, {
      reason: 'Room required for a scheduled examination',
    });
    expect(withReason.status).toBe(200);
    expect(withReason.body.data.cancellationReason).toBe(
      'Room required for a scheduled examination',
    );
  });
});

describe('closure and deactivation guards', () => {
  it('refuses to close a slot that has a confirmed booking', async () => {
    const slotId = await secondDateSlotId(2);
    const booked = await studentA.post('/api/bookings', {
      slotId,
      purpose: 'Booking that blocks closing the slot',
    });
    expect(booked.status).toBe(201);

    const response = await admin.patch(`/api/admin/slots/${slotId}`, { isOpen: false });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SLOT_HAS_BOOKING');

    const { rows } = await pool.query('SELECT is_open FROM resource_slots WHERE id = $1', [slotId]);
    expect(rows[0].is_open).toBe(true);
  });

  it('refuses to deactivate a resource with an outstanding booking', async () => {
    const response = await admin.patch(`/api/admin/resources/${resourceId}`, { isActive: false });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RESOURCE_HAS_BOOKINGS');

    const { rows } = await pool.query('SELECT is_active FROM resources WHERE id = $1', [resourceId]);
    expect(rows[0].is_active).toBe(true);
  });
});
