/**
 * Initial application schema.
 *
 * Two structural rules carry the product's correctness:
 *   1. A slot is uniquely identified by (resource_id, booking_date, slot_index).
 *   2. At most one CONFIRMED booking may exist per slot, enforced by a partial
 *      unique index so cancelled history can coexist on the same slot.
 */

export const shorthands = undefined;

export function up(pgm) {
  // gen_random_uuid() lives in pgcrypto before PostgreSQL 13; create the
  // extension so the migration is portable across supported majors.
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    // Stored already normalised (trimmed, lower-cased) by the application.
    email: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: 'STUDENT' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('users', 'users_role_check', {
    check: "role IN ('STUDENT', 'ADMIN')",
  });
  pgm.addConstraint('users', 'users_email_unique', { unique: ['email'] });
  pgm.addConstraint('users', 'users_email_normalised_check', {
    check: 'email = lower(btrim(email))',
  });
  pgm.addConstraint('users', 'users_name_not_blank_check', {
    check: 'btrim(name) <> \'\'',
  });

  pgm.createTable('resources', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    category: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    location: { type: 'text', notNull: true },
    capacity: { type: 'integer', notNull: true },
    rules: { type: 'text', notNull: true, default: '' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('resources', 'resources_capacity_positive_check', {
    check: 'capacity > 0',
  });
  pgm.addConstraint('resources', 'resources_name_not_blank_check', {
    check: 'btrim(name) <> \'\'',
  });

  // Supports the catalogue's category/location filtering and active listing.
  pgm.createIndex('resources', ['is_active', 'category']);
  pgm.createIndex('resources', ['is_active', 'location']);

  pgm.createTable('resource_slots', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    resource_id: {
      type: 'uuid',
      notNull: true,
      references: 'resources',
      onDelete: 'RESTRICT',
    },
    booking_date: { type: 'date', notNull: true },
    slot_index: { type: 'smallint', notNull: true },
    is_open: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Canonical hour indexes: 0 = 09:00-10:00 IST ... 7 = 16:00-17:00 IST.
  pgm.addConstraint('resource_slots', 'resource_slots_index_range_check', {
    check: 'slot_index BETWEEN 0 AND 7',
  });

  // Structural rule 1: one row per resource, date and canonical hour.
  pgm.addConstraint('resource_slots', 'resource_slots_canonical_unique', {
    unique: ['resource_id', 'booking_date', 'slot_index'],
  });

  // Availability lookups filter by resource and date.
  pgm.createIndex('resource_slots', ['resource_id', 'booking_date']);

  pgm.createTable('bookings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'RESTRICT' },
    slot_id: {
      type: 'uuid',
      notNull: true,
      references: 'resource_slots',
      onDelete: 'RESTRICT',
    },
    purpose: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'CONFIRMED' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    cancelled_at: { type: 'timestamptz' },
    cancelled_by: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
    cancellation_reason: { type: 'text' },
  });

  pgm.addConstraint('bookings', 'bookings_status_check', {
    check: "status IN ('CONFIRMED', 'CANCELLED')",
  });

  // Purpose is trimmed text of 10-300 characters.
  pgm.addConstraint('bookings', 'bookings_purpose_length_check', {
    check: 'char_length(btrim(purpose)) BETWEEN 10 AND 300',
  });

  // Cancellation columns must be consistent with the status.
  pgm.addConstraint('bookings', 'bookings_cancellation_consistency_check', {
    check: `(
      status = 'CONFIRMED'
      AND cancelled_at IS NULL
      AND cancelled_by IS NULL
      AND cancellation_reason IS NULL
    ) OR (
      status = 'CANCELLED'
      AND cancelled_at IS NOT NULL
      AND cancelled_by IS NOT NULL
    )`,
  });

  /**
   * Structural rule 2: the double-booking defence.
   *
   * Partial, so a slot may accumulate cancelled bookings and still be rebooked.
   * A plain unique constraint on slot_id would wrongly block rebooking.
   */
  pgm.createIndex('bookings', 'slot_id', {
    name: 'one_confirmed_booking_per_slot',
    unique: true,
    where: "status = 'CONFIRMED'",
  });

  // Booking history for the signed-in user, newest first.
  pgm.createIndex('bookings', ['user_id', { name: 'created_at', sort: 'DESC' }]);

  pgm.createTable('booking_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    booking_id: {
      type: 'uuid',
      notNull: true,
      references: 'bookings',
      onDelete: 'RESTRICT',
    },
    actor_user_id: { type: 'uuid', references: 'users', onDelete: 'RESTRICT' },
    event_type: { type: 'text', notNull: true },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    details: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
  });

  pgm.addConstraint('booking_events', 'booking_events_type_check', {
    check: "event_type IN ('CREATED', 'CANCELLED')",
  });

  pgm.createIndex('booking_events', ['booking_id', 'occurred_at']);
}

export function down(pgm) {
  pgm.dropTable('booking_events');
  pgm.dropTable('bookings');
  pgm.dropTable('resource_slots');
  pgm.dropTable('resources');
  pgm.dropTable('users');
  pgm.dropExtension('pgcrypto', { ifExists: true });
}
