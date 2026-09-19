/**
 * Session store table for connect-pg-simple.
 *
 * Mirrors the schema shipped in the installed library's table.sql exactly, so
 * the store is never asked to create tables at runtime. This is infrastructure
 * data: no application endpoint exposes it.
 */

export const shorthands = undefined;

export function up(pgm) {
  pgm.sql(`
    CREATE TABLE "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    )
    WITH (OIDS=FALSE);

    ALTER TABLE "session"
      ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      NOT DEFERRABLE INITIALLY IMMEDIATE;

    CREATE INDEX "IDX_session_expire" ON "session" ("expire");
  `);
}

export function down(pgm) {
  pgm.sql('DROP TABLE IF EXISTS "session";');
}
