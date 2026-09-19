import express from 'express';
import helmet from 'helmet';

import { isProduction } from './config/env.js';
import { sessionMiddleware } from './config/session.js';
import { attachUser } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { requestId } from './middleware/requestId.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express application.
 *
 * Deliberately does not listen on a port: server.js owns process startup, and
 * tests import this factory directly.
 *
 * @returns {import('express').Express}
 */
export function createApp() {
  const app = express();

  // Trusted only in production, where a known reverse proxy terminates TLS.
  // Trusting forwarded headers in development would let any client spoof them.
  if (isProduction) {
    app.set('trust proxy', 1);
  }

  // Request correlation must precede logging so every log line carries the ID.
  app.use(requestId);
  app.use(httpLogger);

  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  // Health checks run before the session layer: readiness must not depend on
  // the session store being queryable.
  app.use('/api/health', healthRouter);

  app.use(sessionMiddleware);
  app.use(attachUser);

  app.use('/api/auth', authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
