import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';

// Proves the Express app is importable and testable without binding a port.
describe('health endpoints', () => {
  const app = createApp();

  it('GET /api/health/live returns a healthy payload', async () => {
    const response = await request(app).get('/api/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
  });

  it('returns a JSON 404 for unknown /api routes', async () => {
    const response = await request(app).get('/api/nope');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('assigns a request id to every response', async () => {
    const response = await request(app).get('/api/health/live');

    expect(response.headers['x-request-id']).toBeDefined();
  });
});
