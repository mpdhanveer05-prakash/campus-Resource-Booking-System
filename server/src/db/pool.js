import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool.
 *
 * Phase 1 only establishes the pool and a readiness probe. Query helpers and
 * transaction-aware repositories arrive in later phases.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Idle clients can fail independently of any request; log rather than crash.
pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected PostgreSQL pool error');
});

/**
 * Lightweight readiness probe used by GET /api/health/ready.
 *
 * @returns {Promise<boolean>} true when the database answered.
 */
export async function checkDatabaseConnection() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
