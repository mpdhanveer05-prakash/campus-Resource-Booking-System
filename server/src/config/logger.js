import pino from 'pino';

import { env, isProduction } from './env.js';

/**
 * Application logger.
 *
 * Redaction keeps session cookies, passwords, tokens and authorization headers
 * out of the logs, per the guide's security requirements.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'password_hash',
      'sessionSecret',
      'csrfToken',
      '*.password',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
  transport: isProduction
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
