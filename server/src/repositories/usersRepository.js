import { pool } from '../db/pool.js';

/** Columns that are safe to expose to the application layer. */
const SAFE_COLUMNS = 'id, name, email, role, created_at AS "createdAt"';

/**
 * Normalises an email for storage and lookup.
 *
 * @param {string} email
 * @returns {string}
 */
export function normaliseEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * @param {string} id
 * @returns {Promise<{id: string, name: string, email: string, role: string}|null>}
 */
export async function findById(id) {
  const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Returns the user including the password hash, for credential verification.
 *
 * Callers must never pass the hash outward.
 */
export async function findByEmailWithHash(email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, password_hash AS "passwordHash" FROM users WHERE email = $1`,
    [normaliseEmail(email)],
  );
  return rows[0] ?? null;
}

/**
 * Creates a user. The role is supplied by the server, never by the browser.
 */
export async function create({ name, email, passwordHash, role }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SAFE_COLUMNS}`,
    [name.trim(), normaliseEmail(email), passwordHash, role],
  );
  return rows[0];
}

/**
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function emailExists(email) {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [normaliseEmail(email)]);
  return rows.length > 0;
}
