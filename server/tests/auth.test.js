import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { closePool, pool } from '../src/db/pool.js';
import { resetDatabase } from './helpers/db.js';

const app = createApp();

/**
 * Drives one browser-like client: keeps the session cookie and the CSRF token
 * together, exactly as the React client will.
 */
function createClient() {
  let cookie = null;
  let csrfToken = null;

  async function bootstrapCsrf() {
    const response = await request(app).get('/api/auth/csrf');
    const setCookie = response.headers['set-cookie'];
    if (setCookie) cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
    csrfToken = response.body.data.csrfToken;
    return csrfToken;
  }

  function applyCookie(req) {
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function captureCookie(response) {
    const setCookie = response.headers['set-cookie'];
    if (setCookie) cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');
    return response;
  }

  return {
    bootstrapCsrf,
    get: (path) => applyCookie(request(app).get(path)),
    post: (path, body) =>
      applyCookie(request(app).post(path))
        .set('x-csrf-token', csrfToken ?? '')
        .send(body),
    postWithoutCsrf: (path, body) => applyCookie(request(app).post(path)).send(body),
    captureCookie,
    get csrfToken() {
      return csrfToken;
    },
  };
}

const STUDENT = {
  name: 'Test Student',
  email: 'student.auth@campus.local',
  password: 'correct horse battery staple',
};

beforeAll(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closePool();
});

describe('authentication', () => {
  it('bootstraps a CSRF token', async () => {
    const client = createClient();
    const token = await client.bootstrapCsrf();

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);
  });

  it('registers a student account', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client.post('/api/auth/register', STUDENT);

    expect(response.status).toBe(201);
    expect(response.body.data.email).toBe(STUDENT.email);
  });

  it('never creates an admin from public registration', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client.post('/api/auth/register', {
      name: 'Sneaky User',
      email: 'sneaky@campus.local',
      password: 'correct horse battery staple',
      role: 'ADMIN',
      isAdmin: true,
    });

    expect(response.status).toBe(201);

    const { rows } = await pool.query('SELECT role FROM users WHERE email = $1', [
      'sneaky@campus.local',
    ]);
    expect(rows[0].role).toBe('STUDENT');
  });

  it('rejects registration without a CSRF token', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client.postWithoutCsrf('/api/auth/register', {
      name: 'No Token',
      email: 'no.token@campus.local',
      password: 'correct horse battery staple',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects a wrong password with a generic error and no session', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client.post('/api/auth/login', {
      email: STUDENT.email,
      password: 'not the right password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    // The message must not distinguish unknown email from wrong password.
    expect(response.body.error.message).toBe('Email or password is incorrect.');
  });

  it('signs in, restores identity on a later request, and signs out', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const login = client.captureCookie(
      await client.post('/api/auth/login', {
        email: STUDENT.email,
        password: STUDENT.password,
      }),
    );

    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('STUDENT');
    // The rotated token must be returned so the client can refresh it.
    expect(login.body.data.csrfToken).toBeDefined();
    expect(login.body.data.user.passwordHash).toBeUndefined();

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(STUDENT.email);

    // Re-bootstrap the token: login rotated it.
    const freshToken = login.body.data.csrfToken;
    const logout = client.captureCookie(
      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', login.headers['set-cookie'].map((c) => c.split(';')[0]).join('; '))
        .set('x-csrf-token', freshToken)
        .send({}),
    );

    expect(logout.status).toBe(200);
  });

  it('rotates the session id on login', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const before = await client.get('/api/auth/csrf');
    const beforeCookie = before.headers['set-cookie']?.[0]?.split(';')[0];

    const login = await client.post('/api/auth/login', {
      email: STUDENT.email,
      password: STUDENT.password,
    });

    const afterCookie = login.headers['set-cookie']?.[0]?.split(';')[0];

    expect(login.status).toBe(200);
    expect(afterCookie).toBeDefined();
    expect(afterCookie).not.toBe(beforeCookie);
  });

  it('returns 401 for a protected endpoint without a session', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 after logging out', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const login = client.captureCookie(
      await client.post('/api/auth/login', {
        email: STUDENT.email,
        password: STUDENT.password,
      }),
    );

    const cookie = login.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('x-csrf-token', login.body.data.csrfToken)
      .send({});

    const after = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(after.status).toBe(401);
  });

  it('rejects a mismatched Origin header', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client
      .post('/api/auth/login', { email: STUDENT.email, password: STUDENT.password })
      .set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_ORIGIN_MISMATCH');
  });

  it('validates registration input', async () => {
    const client = createClient();
    await client.bootstrapCsrf();

    const response = await client.post('/api/auth/register', {
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });
});
