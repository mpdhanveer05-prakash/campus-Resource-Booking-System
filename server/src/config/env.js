import { z } from 'zod';

/**
 * Environment contract for the Phase 1 backend.
 *
 * Validation runs at startup. If a required variable is missing or malformed the
 * process exits instead of continuing with invalid configuration.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(4000),

  // Runtime database connection. Server-only secret; never exposed to the browser.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Exact browser origin allowed to make state-changing requests.
  APP_ORIGIN: z.url('APP_ORIGIN must be a valid URL'),

  // Signs the session cookie. Server-only secret.
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  // Migration and test connections are optional at runtime; scripts validate
  // their own requirements.
  MIGRATION_DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_STUDENT_PASSWORD: z.string().optional(),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

/**
 * Parses and validates process.env.
 *
 * @param {NodeJS.ProcessEnv} source
 * @returns {z.infer<typeof envSchema>}
 */
export function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    // Written to stderr directly: the logger itself depends on validated config.
    process.stderr.write(
      `Invalid environment configuration:\n${issues}\n` +
        'Copy .env.example to .env and provide the required values.\n',
    );
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
