import request from 'supertest';

import { createApp } from '../../src/app.js';
import { pool } from '../../src/db/pool.js';

export const app = createApp();

/**
 * A browser-like API client: carries the session cookie and the session-bound
 * CSRF token together, refreshing the token when login rotates it.
 */
export function createClient() {
  let cookie = null;
  let csrfToken = null;

  function withCookie(req) {
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function capture(response) {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
    }
    return response;
  }

  const client = {
    async bootstrap() {
      const response = capture(await request(app).get('/api/auth/csrf'));
      csrfToken = response.body.data.csrfToken;
      return csrfToken;
    },

    async register(user) {
      await client.bootstrap();
      return capture(
        await withCookie(request(app).post('/api/auth/register'))
          .set('x-csrf-token', csrfToken)
          .send(user),
      );
    },

    async login(email, password) {
      await client.bootstrap();
      const response = capture(
        await withCookie(request(app).post('/api/auth/login'))
          .set('x-csrf-token', csrfToken)
          .send({ email, password }),
      );
      // Login rotates the token; adopt the new one.
      if (response.body?.data?.csrfToken) csrfToken = response.body.data.csrfToken;
      return response;
    },

    get: (path) => withCookie(request(app).get(path)),

    post: (path, body) =>
      withCookie(request(app).post(path)).set('x-csrf-token', csrfToken ?? '').send(body ?? {}),

    patch: (path, body) =>
      withCookie(request(app).patch(path)).set('x-csrf-token', csrfToken ?? '').send(body ?? {}),

    postWithoutCsrf: (path, body) => withCookie(request(app).post(path)).send(body ?? {}),

    /** Sends no body at all, so req.body is undefined server-side. */
    postNoBody: (path) =>
      withCookie(request(app).post(path)).set('x-csrf-token', csrfToken ?? ''),
  };

  return client;
}

const PASSWORD = 'correct horse battery staple';

/** Registers and signs in a student, returning a ready client. */
export async function signedInStudent(email, name = 'Test Student') {
  const client = createClient();
  await client.register({ name, email, password: PASSWORD });
  await client.login(email, PASSWORD);
  return client;
}

/** Creates an admin directly (public registration cannot), then signs in. */
export async function signedInAdmin(email, name = 'Test Admin') {
  const client = createClient();
  await client.register({ name, email, password: PASSWORD });
  await pool.query('UPDATE users SET role = $2 WHERE email = $1', [email.toLowerCase(), 'ADMIN']);
  await client.login(email, PASSWORD);
  return client;
}

export { PASSWORD };
