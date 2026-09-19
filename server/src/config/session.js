import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';

import { pool } from '../db/pool.js';
import { env, isProduction } from './env.js';

const PgStore = connectPgSimple(session);

/** Explicit cookie name; reused when clearing the cookie on logout. */
export const SESSION_COOKIE_NAME = 'crbs.sid';

/** Eight hours: long enough for a campus day, short enough to expire. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Server-side session middleware backed by PostgreSQL.
 *
 * Only the session identifier travels to the browser, in an HttpOnly cookie.
 * The table is created by migration, never at runtime.
 */
export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: env.SESSION_SECRET,
  store: new PgStore({
    pool,
    tableName: 'session',
    // The migration owns the schema; the store must not create it.
    createTableIfMissing: false,
    pruneSessionInterval: 60,
  }),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: isProduction,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // Host-only: omitting `domain` prevents the cookie reaching subdomains.
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
    path: '/',
  },
});

/**
 * Options used when clearing the cookie. Must match the set options, minus
 * maxAge, or the browser keeps the old cookie.
 */
export const clearCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
};
