import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // setupFiles run before the test file's imports, so the pool is built
    // against the test database.
    setupFiles: ['./tests/setup.js'],
    // Integration tests share one database; run files sequentially so their
    // truncations do not race.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
