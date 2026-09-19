#!/bin/bash
# Creates the migration owner, the least-privilege runtime account and the
# isolated test database. Runs once, on first initialisation of the volume.
#
# Passwords come from the environment; nothing is hardcoded here.
set -euo pipefail

: "${APP_MIGRATION_PASSWORD:?APP_MIGRATION_PASSWORD is required}"
: "${APP_RUNTIME_PASSWORD:?APP_RUNTIME_PASSWORD is required}"

DEV_DB="${POSTGRES_DB:-campus_booking_dev}"
TEST_DB="${TEST_DB_NAME:-campus_booking_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$DEV_DB" <<SQL
-- Schema owner. Migrations run as this role.
CREATE ROLE campus_migrator LOGIN PASSWORD '${APP_MIGRATION_PASSWORD}';

-- Runtime account. Receives only the privileges normal operation needs.
CREATE ROLE campus_app LOGIN PASSWORD '${APP_RUNTIME_PASSWORD}';

-- The test database is owned by the migrator so integration tests can migrate.
CREATE DATABASE ${TEST_DB} OWNER campus_migrator;
SQL

# Grant per-database privileges in both the development and test databases.
for db in "$DEV_DB" "$TEST_DB"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
  ALTER DATABASE ${db} OWNER TO campus_migrator;

  REVOKE ALL ON SCHEMA public FROM PUBLIC;
  ALTER SCHEMA public OWNER TO campus_migrator;

  GRANT CONNECT ON DATABASE ${db} TO campus_app;
  GRANT USAGE ON SCHEMA public TO campus_app;

  -- Runtime may read and write rows, but never change the schema.
  ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campus_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE campus_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO campus_app;
SQL
done

echo "Roles campus_migrator / campus_app and database ${TEST_DB} created."
