/**
 * Migration runner.
 *
 * Runs as the schema-owning migration account, never the runtime account.
 * Set DB_TARGET=test to migrate the isolated integration-test database.
 */
import { runner } from 'node-pg-migrate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const target = process.env.DB_TARGET === 'test' ? 'test' : 'development';

const connectionString = target === 'test'
  ? process.env.TEST_DATABASE_URL
  : (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);

if (!connectionString) {
  process.stderr.write(
    `Missing connection string for the ${target} database.\n` +
      'Set MIGRATION_DATABASE_URL (or TEST_DATABASE_URL when DB_TARGET=test).\n',
  );
  process.exit(1);
}

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

try {
  const applied = await runner({
    databaseUrl: connectionString,
    dir: migrationsDir,
    direction,
    migrationsTable: 'pgmigrations',
    // Down migrations are destructive; only ever step back one at a time.
    count: direction === 'down' ? 1 : undefined,
    verbose: true,
  });

  const names = applied.map((migration) => migration.name);
  process.stdout.write(
    names.length > 0
      ? `Applied ${direction} migrations on ${target}: ${names.join(', ')}\n`
      : `No pending migrations for ${target}.\n`,
  );
  process.exit(0);
} catch (error) {
  process.stderr.write(`Migration failed: ${error.message}\n`);
  process.exit(1);
}
