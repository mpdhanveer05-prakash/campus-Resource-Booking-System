/**
 * Repeatable development seed.
 *
 * Safe to run more than once: accounts, resources and slots are inserted only
 * when absent. Existing passwords are never reset, closed slots are never
 * reopened and no rows are deleted. Destructive reset lives in reset.js.
 */
import argon2 from 'argon2';
import pg from 'pg';

import { MIN_SLOT_INDEX, SLOT_COUNT, addDays, currentCampusDate } from '../src/domain/slots.js';

const { Pool } = pg;

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed: NODE_ENV is production.\n');
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write('Missing MIGRATION_DATABASE_URL or DATABASE_URL.\n');
  process.exit(1);
}

const seedAdminEmail = process.env.SEED_ADMIN_EMAIL;
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!seedAdminEmail || !seedAdminPassword) {
  process.stderr.write(
    'Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD.\n' +
      'Provide them in your local environment; they have no public defaults.\n',
  );
  process.exit(1);
}

// Student demo credentials stay local-only, like the admin password.
const studentPassword = process.env.SEED_STUDENT_PASSWORD ?? seedAdminPassword;

const RESOURCES = [
  {
    name: 'Study Room A',
    category: 'Study Room',
    location: 'Central Library, Floor 2',
    capacity: 6,
    description: 'Group study room with a whiteboard and power outlets.',
    rules: 'Leave the whiteboard clean. No food inside the room.',
  },
  {
    name: 'Study Room B',
    category: 'Study Room',
    location: 'Central Library, Floor 2',
    capacity: 4,
    description: 'Quiet discussion room suitable for small groups.',
    rules: 'Keep conversation at a low volume.',
  },
  {
    name: 'Projector Unit 1',
    category: 'Equipment',
    location: 'Academic Block C, Store',
    capacity: 1,
    description: 'Portable projector with HDMI and VGA cables.',
    rules: 'Collect and return at the store desk within the booked hour.',
  },
  {
    name: 'Projector Unit 2',
    category: 'Equipment',
    location: 'Academic Block C, Store',
    capacity: 1,
    description: 'Portable projector with a spare lamp and remote.',
    rules: 'Report faults immediately to the store desk.',
  },
  {
    name: 'Lab Workstation 7',
    category: 'Laboratory',
    location: 'Computing Lab 2',
    capacity: 1,
    description: 'Workstation with the simulation toolchain preinstalled.',
    rules: 'Save work to your own account. Local files are cleared nightly.',
  },
  {
    name: 'Badminton Court 1',
    category: 'Sports',
    location: 'Indoor Sports Complex',
    capacity: 4,
    description: 'Indoor court with lighting. Nets are provided.',
    rules: 'Non-marking shoes required. Bring your own racquets.',
  },
];

const STUDENTS = [
  { name: 'Aarti Menon', email: 'aarti.menon@campus.local' },
  { name: 'Rahul Verma', email: 'rahul.verma@campus.local' },
];

const pool = new Pool({ connectionString });

/**
 * Inserts a user when the email is absent. Never updates an existing password.
 *
 * @returns {Promise<'created'|'skipped'>}
 */
async function upsertUser(client, { name, email, password, role }) {
  const normalisedEmail = email.trim().toLowerCase();
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalisedEmail]);

  if (existing.rowCount > 0) {
    return 'skipped';
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await client.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    [name, normalisedEmail, passwordHash, role],
  );

  return 'created';
}

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let usersCreated = 0;
    let usersSkipped = 0;

    const adminResult = await upsertUser(client, {
      name: 'Campus Administrator',
      email: seedAdminEmail,
      password: seedAdminPassword,
      role: 'ADMIN',
    });
    adminResult === 'created' ? (usersCreated += 1) : (usersSkipped += 1);

    for (const student of STUDENTS) {
      const result = await upsertUser(client, {
        ...student,
        password: studentPassword,
        role: 'STUDENT',
      });
      result === 'created' ? (usersCreated += 1) : (usersSkipped += 1);
    }

    // Resources are identified by name for idempotency.
    let resourcesCreated = 0;

    for (const resource of RESOURCES) {
      const inserted = await client.query(
        `INSERT INTO resources (name, category, description, location, capacity, rules)
         SELECT $1, $2, $3, $4, $5, $6
         WHERE NOT EXISTS (SELECT 1 FROM resources WHERE name = $1)
         RETURNING id`,
        [
          resource.name,
          resource.category,
          resource.description,
          resource.location,
          resource.capacity,
          resource.rules,
        ],
      );
      resourcesCreated += inserted.rowCount;
    }

    // Publish canonical slots for the next 14 campus dates.
    const startDate = currentCampusDate();
    const dates = Array.from({ length: 14 }, (_, offset) => addDays(startDate, offset));
    const indexes = Array.from({ length: SLOT_COUNT }, (_, i) => MIN_SLOT_INDEX + i);

    // ON CONFLICT DO NOTHING keeps existing rows untouched, so a previously
    // closed slot is never reopened by re-running the seed.
    const slotResult = await client.query(
      `INSERT INTO resource_slots (resource_id, booking_date, slot_index)
       SELECT r.id, d.booking_date, s.slot_index
       FROM resources r
       CROSS JOIN unnest($1::date[]) AS d(booking_date)
       CROSS JOIN unnest($2::smallint[]) AS s(slot_index)
       ON CONFLICT (resource_id, booking_date, slot_index) DO NOTHING`,
      [dates, indexes],
    );

    await client.query('COMMIT');

    process.stdout.write(
      `Seed complete.\n` +
        `  users:     ${usersCreated} created, ${usersSkipped} already present\n` +
        `  resources: ${resourcesCreated} created, ${RESOURCES.length - resourcesCreated} already present\n` +
        `  slots:     ${slotResult.rowCount} created for ${dates.length} dates\n`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

try {
  await run();
  process.exit(0);
} catch (error) {
  process.stderr.write(`Seed failed: ${error.message}\n`);
  process.exit(1);
}
