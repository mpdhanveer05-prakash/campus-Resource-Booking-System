import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closePool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'API listening');
});

/**
 * Stops accepting connections, then releases the database pool.
 */
async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');

  server.close(async (closeError) => {
    if (closeError) {
      logger.error({ err: closeError }, 'Error closing HTTP server');
    }

    try {
      await closePool();
    } catch (poolError) {
      logger.error({ err: poolError }, 'Error closing database pool');
    }

    process.exit(closeError ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
