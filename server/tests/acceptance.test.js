import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closePool, pool } from '../src/db/pool.js';
import { addDays, currentCampusDate } from '../src/domain/slots.js';
import { app, createClient, signedInAdmin, signedInStudent } from './helpers/client.js';
import { resetDatabase } from './helpers/db.js';
import request from 'supertest';

let admin;
let student;
let resourceId;

const DATE = addDays(currentCampusDate(), 5);

beforeAll(async () => {
  await resetDatabase();

  admin = await signedInAdmin('acc.admin@campus.local');
  student = await signedInStudent('acc.student@campus.local');

  const created = await admin.post('/api/admin/resources', {
    name: 'Acceptance Lab',
    category: 'Laboratory',
    location: 'Block C',
    capacity: 2,
  });
  resourceId = created.body.data.id;

  await admin.post(`/api/admin/resources/${resourceId}/slots/generate`, {
    fromDate: DATE,
    toDate: DATE,
  });
});

afterAll(async () => {
  await closePool();
});

async function slotId(index) {
  const response = await student.get(`/api/resources/${resourceId}/slots?date=${DATE}`);
  return response.body.data.slots.find((slot) => slot.slotIndex === index).id;
}

describe('slot eligibility', () => {
  it('refuses to book a slot in the past', async () => {
    // Insert a slot for yesterday directly: slot generation refuses past dates.
    const pastDate = addDays(currentCampusDate(), -1);
    const { rows } = await pool.query(
      `INSERT INTO resource_slots (resource_id, booking_date, slot_index)
       VALUES ($1, $2::date, 0) RETURNING id`,
      [resourceId, pastDate],
    );

    const response = await student.post('/api/bookings', {
      slotId: rows[0].id,
      purpose: 'Trying to book a slot that has already passed',
    });

    expect(response.status).toBe(409);
    expect(['SLOT_IN_PAST']).toContain(response.body.error.code);

    const { rows: bookings } = await pool.query(
      'SELECT count(*)::int AS c FROM bookings WHERE slot_id = $1',
      [rows[0].id],
    );
    expect(bookings[0].c).toBe(0);
  });

  it('refuses to book a slot on an inactive resource', async () => {
    const created = await admin.post('/api/admin/resources', {
      name: 'Retired Projector',
      category: 'Equipment',
      location: 'Store',
      capacity: 1,
    });
    const retiredId = created.body.data.id;

    await admin.post(`/api/admin/resources/${retiredId}/slots/generate`, {
      fromDate: DATE,
      toDate: DATE,
    });

    const slots = await student.get(`/api/resources/${retiredId}/slots?date=${DATE}`);
    const targetSlot = slots.body.data.slots[0].id;

    await admin.patch(`/api/admin/resources/${retiredId}`, { isActive: false });

    const response = await student.post('/api/bookings', {
      slotId: targetSlot,
      purpose: 'Booking a resource that has been deactivated',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RESOURCE_INACTIVE');
  });

  it('hides inactive resources from the student catalogue', async () => {
    const response = await student.get('/api/resources?page=1&pageSize=50');
    const names = response.body.data.items.map((item) => item.name);

    expect(names).not.toContain('Retired Projector');

    // The admin listing still includes it.
    const adminList = await admin.get('/api/admin/resources?page=1&pageSize=50');
    expect(adminList.body.data.items.map((item) => item.name)).toContain('Retired Projector');
  });
});

describe('session persistence', () => {
  it('restores a session from the database on a new app instance', async () => {
    const client = createClient();
    await client.register({
      name: 'Persistent User',
      email: 'persist@campus.local',
      password: 'correct horse battery staple',
    });
    const login = await client.login('persist@campus.local', 'correct horse battery staple');
    const cookie = login.headers['set-cookie'].map((entry) => entry.split(';')[0]).join('; ');

    // The session lives in PostgreSQL, so a fresh app object still resolves it.
    // This is what survives an API restart.
    const { createApp } = await import('../src/app.js');
    const restarted = createApp();

    const response = await request(restarted).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe('persist@campus.local');
  });

  it('stores sessions in the database rather than memory', async () => {
    const { rows } = await pool.query('SELECT count(*)::int AS c FROM "session"');
    expect(rows[0].c).toBeGreaterThan(0);
  });
});

describe('error safety', () => {
  it('returns a JSON 404 for an unknown /api route, never HTML', async () => {
    const response = await request(app).get('/api/definitely-not-a-route');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.text).not.toMatch(/<html/i);
  });

  it('never leaks a stack trace, SQL or credentials in an error body', async () => {
    // An invalid uuid reaches validation, not the database.
    const response = await student.get('/api/resources/not-a-uuid');

    expect(response.status).toBe(400);
    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/at Object|node_modules|SELECT |password/i);
  });

  it('never returns a password hash from any auth endpoint', async () => {
    const me = await student.get('/api/auth/me');

    expect(JSON.stringify(me.body)).not.toMatch(/\$argon2|passwordHash|password_hash/);
  });

  it('rejects an oversized request body', async () => {
    const response = await student.post('/api/bookings', {
      slotId: '00000000-0000-0000-0000-000000000000',
      purpose: 'x'.repeat(50_000),
    });

    // Either the body limit or validation rejects it; neither may be a 500.
    expect([400, 413]).toContain(response.status);
  });
});

describe('pagination bounds', () => {
  it('caps the page size a client may request', async () => {
    const response = await student.get('/api/resources?page=1&pageSize=5000');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a non-numeric page', async () => {
    const response = await student.get('/api/resources?page=abc');

    expect(response.status).toBe(400);
  });
});

describe('slot generation bounds', () => {
  it('refuses a range outside the booking window', async () => {
    const farFuture = addDays(currentCampusDate(), 40);

    const response = await admin.post(`/api/admin/resources/${resourceId}/slots/generate`, {
      fromDate: farFuture,
      toDate: farFuture,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('DATE_OUT_OF_WINDOW');
  });

  it('refuses a reversed range', async () => {
    const response = await admin.post(`/api/admin/resources/${resourceId}/slots/generate`, {
      fromDate: addDays(currentCampusDate(), 5),
      toDate: addDays(currentCampusDate(), 2),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_DATE_RANGE');
  });

  it('creates exactly eight canonical slots per date', async () => {
    const targetDate = addDays(currentCampusDate(), 9);

    const result = await admin.post(`/api/admin/resources/${resourceId}/slots/generate`, {
      fromDate: targetDate,
      toDate: targetDate,
    });

    expect(result.body.data.slotsCreated).toBe(8);

    const { rows } = await pool.query(
      'SELECT slot_index FROM resource_slots WHERE resource_id = $1 AND booking_date = $2::date ORDER BY slot_index',
      [resourceId, targetDate],
    );
    expect(rows.map((row) => row.slot_index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('cross-user access', () => {
  it('does not expose another user\'s bookings through /mine', async () => {
    const other = await signedInStudent('other.student@campus.local');

    const target = await slotId(1);
    await student.post('/api/bookings', {
      slotId: target,
      purpose: 'A booking that belongs to the first student',
    });

    const response = await other.get('/api/bookings/mine');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(0);
  });

  it('refuses a student access to booking event history', async () => {
    const response = await student.get(
      '/api/admin/bookings/00000000-0000-0000-0000-000000000000/events',
    );

    expect(response.status).toBe(403);
  });
});
