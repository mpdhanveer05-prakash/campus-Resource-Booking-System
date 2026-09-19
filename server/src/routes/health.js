import { Router } from 'express';

import { checkDatabaseConnection } from '../db/pool.js';

export const healthRouter = Router();

/**
 * GET /api/health/live
 *
 * Process liveness only. Performs no dependency checks and exposes no
 * configuration.
 */
healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
});

/**
 * GET /api/health/ready
 *
 * Reports whether the API can serve traffic, which requires a reachable
 * database. Failure detail is logged, never returned to the caller.
 */
healthRouter.get('/ready', async (req, res) => {
  try {
    await checkDatabaseConnection();
    res.status(200).json({ data: { status: 'ready', database: 'up' } });
  } catch (error) {
    req.log?.error({ err: error }, 'Readiness check failed');
    res.status(503).json({
      error: {
        code: 'NOT_READY',
        message: 'Service is not ready.',
      },
      requestId: req.id,
    });
  }
});
