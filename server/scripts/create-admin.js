/**
 * Creates the initial administrator.
 *
 * Deliberately a controlled command rather than a seed: production must never
 * run demo seeds, and the password must not be a published default.
 *
 * Usage: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/create-admin.js
 */
import argon2 from 'argon2';
import pg from 'pg';

const { Pool } = pg;

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME ?? 'Campus Administrator';

if (!email || !password) {
  process.stderr.write('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.\n');
  process.exit(1);
}

if (password.length < 12) {
  process.stderr.write('SEED_ADMIN_PASSWORD must be at least 12 characters.\n');
  process.exit(1);
}

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  process.stderr.write('Missing MIGRATION_DATABASE_URL or DATABASE_URL.\n');
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  const existing = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);

  if (existing.rowCount > 0) {
    // Never silently reset an existing account's password.
    process.stdout.write(
      `An account already exists for ${email} with role ${existing.rows[0].role}. No change made.\n`,
    );
    await pool.end();
    process.exit(0);
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')",
    [name, email, passwordHash],
  );

  process.stdout.write(`Administrator created for ${email}.\n`);
  await pool.end();
  process.exit(0);
} catch (error) {
  process.stderr.write(`Failed to create administrator: ${error.message}\n`);
  await pool.end();
  process.exit(1);
}
