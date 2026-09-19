import { pool } from '../../src/db/pool.js';

/**
 * Truncates application tables between test runs.
 *
 * Refuses to run unless the connection clearly targets a test database, so a
 * misconfigured TEST_DATABASE_URL can never wipe development data.
 */
export async function resetDatabase() {
  const { rows } = await pool.query('SELECT current_database() AS name');
  const databaseName = rows[0].name;

  if (!/test/i.test(databaseName)) {
    throw new Error(
      `Refusing to truncate "${databaseName}": it is not a test database. ` +
        'Point TEST_DATABASE_URL at an isolated test database.',
    );
  }

  await pool.query(
    'TRUNCATE booking_events, bookings, resource_slots, resources, users, "session" RESTART IDENTITY CASCADE',
  );
}
