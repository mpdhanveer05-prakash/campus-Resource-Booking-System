import argon2 from 'argon2';

import { AppError } from '../middleware/errorHandler.js';
import * as usersRepository from '../repositories/usersRepository.js';

/**
 * Argon2id parameters. Kept close to the library's current guidance; raising
 * the cost is a deliberate operational decision, not a per-call option.
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Registers a student account.
 *
 * The role is fixed here: public registration can never create an
 * administrator, regardless of what the request contained.
 */
export async function register({ name, email, password }) {
  if (await usersRepository.emailExists(email)) {
    // Deliberately explicit: the registration form needs to explain the clash,
    // and email addresses are not secrets in this application.
    throw new AppError(409, 'EMAIL_IN_USE', 'An account with that email already exists.');
  }

  const passwordHash = await argon2.hash(password, HASH_OPTIONS);

  return usersRepository.create({ name, email, passwordHash, role: 'STUDENT' });
}

/**
 * Verifies credentials.
 *
 * Returns the same generic failure whether the email is unknown or the password
 * is wrong, so the endpoint does not confirm which emails are registered.
 */
export async function verifyCredentials({ email, password }) {
  const user = await usersRepository.findByEmailWithHash(email);

  if (!user) {
    // Hash anyway so timing does not reveal whether the account exists.
    await argon2.hash(password, HASH_OPTIONS);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const passwordMatches = await argon2.verify(user.passwordHash, password);

  if (!passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
