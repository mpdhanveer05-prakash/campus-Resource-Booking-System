import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closePool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, 'API listening');
});

/** Hard limit before abandoning a graceful shutdown. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

let shuttingDown = false;

/**
 * Stops accepting connections, lets in-flight requests finish, then releases
 * the database pool.
 */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down');

  // Never hang forever: a stuck connection must not block a deploy.
  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out; exiting');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close(async (closeError) => {
    if (closeError) {
      logger.error({ err: closeError }, 'Error closing HTTP server');
    }

    try {
      await closePool();
      logger.info('Shutdown complete');
    } catch (poolError) {
      logger.error({ err: poolError }, 'Error closing database pool');
    }

    clearTimeout(forceExit);
    process.exit(closeError ? 1 : 0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

// An uncaught exception leaves the process in an unknown state; log it and let
// the supervisor restart a clean one.
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});
