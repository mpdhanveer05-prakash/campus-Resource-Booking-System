import express from 'express';
import helmet from 'helmet';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { httpLogger } from './middleware/httpLogger.js';
import { requestId } from './middleware/requestId.js';
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

  // Request correlation must precede logging so every log line carries the ID.
  app.use(requestId);
  app.use(httpLogger);

  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  app.use('/api/health', healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
