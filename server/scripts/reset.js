/**
 * Destructive development reset.
 *
 * Deliberately separate from the seed: truncates every application table.
 * Refuses to run when NODE_ENV is production, and requires explicit
 * confirmation so it cannot be triggered by habit.
 *
 * Usage: npm run db:reset -- --confirm
 */
import pg from 'pg';

const { Pool } = pg;

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to reset: NODE_ENV is production.\n');
  process.exit(1);
}

if (!process.argv.includes('--confirm')) {
  process.stderr.write(
    'Refusing to reset without confirmation.\n' +
      'This deletes all bookings, resources, accounts and sessions.\n' +
      'Re-run with: npm run db:reset -- --confirm\n',
  );
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write('Missing MIGRATION_DATABASE_URL or DATABASE_URL.\n');
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  // RESTART IDENTITY is harmless for UUID keys and keeps the statement generic.
  await pool.query(
    'TRUNCATE booking_events, bookings, resource_slots, resources, users, "session" RESTART IDENTITY CASCADE',
  );
  process.stdout.write('Development data reset. Run npm run db:seed to repopulate.\n');
  await pool.end();
  process.exit(0);
} catch (error) {
  process.stderr.write(`Reset failed: ${error.message}\n`);
  await pool.end();
  process.exit(1);
}
