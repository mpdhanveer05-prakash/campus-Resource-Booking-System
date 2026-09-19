import pinoHttp from 'pino-http';

import { logger } from '../config/logger.js';

/**
 * HTTP request logging bound to the shared pino instance.
 *
 * Reuses the request ID assigned by the requestId middleware so application logs
 * and HTTP logs correlate.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Health probes would otherwise dominate the log at info level.
  autoLogging: {
    ignore: (req) => req.url === '/api/health/live',
  },
});
