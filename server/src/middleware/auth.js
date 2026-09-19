import { AppError } from './errorHandler.js';
import * as usersRepository from '../repositories/usersRepository.js';

/**
 * Loads the signed-in user from trusted server state.
 *
 * The role is always re-read from the database, never taken from the request,
 * so a stale or forged client value cannot escalate privileges.
 */
export async function attachUser(req, _res, next) {
  const userId = req.session?.userId;

  if (typeof userId !== 'string') {
    req.user = null;
    return next();
  }

  try {
    const user = await usersRepository.findById(userId);

    if (!user) {
      // The account disappeared under an active session; treat as signed out.
      req.session.destroy(() => {});
      req.user = null;
      return next();
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Rejects unauthenticated requests. */
export function requireAuth(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'You must be signed in.'));
  }
  return next();
}

/** Rejects requests from non-administrators. */
export function requireAdmin(req, _res, next) {
  if (!req.user) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'You must be signed in.'));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new AppError(403, 'FORBIDDEN', 'Administrator access is required.'));
  }

  return next();
}
