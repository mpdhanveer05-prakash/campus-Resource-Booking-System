import { isProduction } from '../config/env.js';

/**
 * Application error carrying an HTTP status and a stable machine-readable code.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Terminal handler for unmatched routes.
 *
 * Unknown /api routes must produce JSON 404s, never frontend HTML.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
    requestId: req.id,
  });
}

/**
 * Central error handler.
 *
 * Emits the guide's error envelope and never leaks stack traces, SQL text or
 * credentials to the browser.
 */
// The fourth parameter is required: Express identifies error handlers by arity.
export function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
    ? err.status
    : 500;

  const code = typeof err?.code === 'string' && err.code !== '' ? err.code : 'INTERNAL_ERROR';

  // Full detail goes to the logs; the client receives a safe message only.
  req.log?.error({ err, code, status }, 'Request failed');

  const message = status >= 500 && isProduction
    ? 'An unexpected error occurred.'
    : (err?.message ?? 'An unexpected error occurred.');

  if (res.headersSent) {
    return _next(err);
  }

  const payload = {
    error: { code, message },
    requestId: req.id,
  };

  // Field-level validation feedback, when the error carries it.
  if (Array.isArray(err?.details)) {
    payload.error.details = err.details;
  }

  res.status(status).json(payload);
}
