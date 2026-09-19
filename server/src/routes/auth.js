import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { clearCookieOptions, SESSION_COOKIE_NAME } from '../config/session.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtection, ensureCsrfToken, rotateCsrfToken } from '../middleware/csrf.js';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/authService.js';

export const authRouter = Router();

/**
 * Limits credential guessing. One backend instance is assumed for the
 * workshop; a shared store is required before running several replicas.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  },
});

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    email: z.email('Enter a valid email address').max(254),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
  })
  // Unknown keys are stripped, so a submitted `role` never reaches the service.
  .strip();

const loginSchema = z
  .object({
    email: z.email('Enter a valid email address').max(254),
    password: z.string().min(1, 'Enter your password').max(128),
  })
  .strip();

/**
 * GET /api/auth/csrf
 *
 * Bootstraps the session-bound token the browser echoes on every write.
 */
authRouter.get('/csrf', (req, res) => {
  res.status(200).json({ data: { csrfToken: ensureCsrfToken(req) } });
});

/**
 * POST /api/auth/register
 *
 * Always creates a STUDENT. The schema strips any role the client submits.
 */
authRouter.post(
  '/register',
  authLimiter,
  csrfProtection,
  validate('body', registerSchema),
  async (req, res, next) => {
    try {
      const user = await authService.register(req.body);
      // Registration does not sign the user in; they log in explicitly.
      res.status(201).json({ data: { id: user.id, email: user.email } });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/login
 *
 * Regenerates the session ID and rotates the CSRF token on success.
 */
authRouter.post(
  '/login',
  authLimiter,
  csrfProtection,
  validate('body', loginSchema),
  async (req, res, next) => {
    try {
      const user = await authService.verifyCredentials(req.body);

      // Regenerating defeats session fixation: the pre-login identifier is
      // discarded and a new one issued.
      req.session.regenerate((regenerateError) => {
        if (regenerateError) return next(regenerateError);

        req.session.userId = user.id;
        const csrfToken = rotateCsrfToken(req);

        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          res.status(200).json({ data: { user, csrfToken } });
        });
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/auth/me
 *
 * Safe fields only, read from trusted server state.
 */
authRouter.get('/me', requireAuth, (req, res) => {
  const { id, name, email, role } = req.user;
  res.status(200).json({ data: { user: { id, name, email, role } } });
});

/**
 * POST /api/auth/logout
 *
 * Destroys the server-side session and clears the cookie using the same name
 * and options it was set with.
 */
authRouter.post('/logout', requireAuth, csrfProtection, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie(SESSION_COOKIE_NAME, clearCookieOptions);
    res.status(200).json({ data: { signedOut: true } });
  });
});
