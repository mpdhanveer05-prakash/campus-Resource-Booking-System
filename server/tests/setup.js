/**
 * Test bootstrap.
 *
 * Forces the pool at DATABASE_URL to be the isolated test database before any
 * application module is imported, and fails fast if the two are the same.
 */
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to run integration tests.');
}

if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
