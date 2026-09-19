import { randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';

/** Header the browser must echo the session-bound token in. */
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Returns the session's CSRF token, creating one on first use.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function ensureCsrfToken(req) {
  if (typeof req.session.csrfToken !== 'string') {
    req.session.csrfToken = randomBytes(32).toString('base64url');
  }
  return req.session.csrfToken;
}

/**
 * Issues a fresh token, discarding the previous one.
 *
 * Called after login regenerates the session so the token rotates with it.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function rotateCsrfToken(req) {
  req.session.csrfToken = randomBytes(32).toString('base64url');
  return req.session.csrfToken;
}

/**
 * Constant-time comparison that tolerates differing lengths.
 */
function tokensMatch(expected, received) {
  const expectedBuffer = Buffer.from(String(expected));
  const receivedBuffer = Buffer.from(String(received));

  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * Synchroniser CSRF protection for state-changing requests.
 *
 * Validates the Origin header and a session-bound token supplied in a custom
 * header. Applies to register and login as well as authenticated writes.
 * SameSite=Lax is an additional defence, not the only one.
 */
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Origin is sent by browsers on every cross-site state-changing request and
  // on same-origin fetch/XHR. Reject anything that is present but unexpected.
  const origin = req.get('origin');

  if (origin !== undefined && origin !== env.APP_ORIGIN) {
    return next(new AppError(403, 'CSRF_ORIGIN_MISMATCH', 'Request origin is not allowed.'));
  }

  const expected = req.session?.csrfToken;
  const received = req.get(CSRF_HEADER);

  if (typeof expected !== 'string' || typeof received !== 'string' || !tokensMatch(expected, received)) {
    return next(new AppError(403, 'CSRF_TOKEN_INVALID', 'Missing or invalid CSRF token.'));
  }

  return next();
}
