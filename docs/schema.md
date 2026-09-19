# Database Schema — Campus Resource Booking System

Source: `Campus_Resource_Booking_AI_Build_Guide.md` §4.

This document describes the schema design. It is **not** a SQL implementation script — SQL/migrations are produced in a later build phase.

## Conventions

- Use **UUID primary keys** for all application records.
- Foreign keys connect: slots → resources, bookings → slots and users, events → bookings and actors.
- Use **NOT NULL** and **CHECK** constraints for required fields and allowed values.
- Add indexes for user booking history and resource/date availability lookups.
- Keep the calendar date as a PostgreSQL `DATE`, returned to clients as a `YYYY-MM-DD` string.
- Derive absolute start/end timestamps centrally (server-side), not from client input.
- Return `startsAt`/`endsAt` as ISO timestamps with an offset or `Z`; format them in Asia/Kolkata in the UI.
- Keep creation, cancellation, and event timestamps as `TIMESTAMPTZ`.

## Tables

### `users`

| Field | Notes |
|---|---|
| id | UUID primary key |
| name | required |
| email | normalised, **unique constraint** |
| password_hash | required; never exposed to clients |
| role | STUDENT or ADMIN |
| created_at | timestamp |

### `resources`

| Field | Notes |
|---|---|
| id | UUID primary key |
| name | required |
| category | required |
| description | required |
| location | required |
| capacity | **positive** (CHECK constraint) |
| rules | free text |
| is_active | boolean; deactivated resources excluded from student-facing catalogue |
| created_at | timestamp |

### `resource_slots`

| Field | Notes |
|---|---|
| id | UUID primary key |
| resource_id | foreign key → resources |
| booking_date | DATE |
| slot_index | integer, **restricted to 0–7** (CHECK constraint) |
| is_open | boolean |
| — | **UNIQUE** constraint on `(resource_id, booking_date, slot_index)` — this is the canonical-slot-identity rule |

### `bookings`

| Field | Notes |
|---|---|
| id | UUID primary key |
| user_id | foreign key → users |
| slot_id | foreign key → resource_slots |
| purpose | trimmed text, 10–300 characters |
| status | `CONFIRMED` or `CANCELLED` only |
| created_at | TIMESTAMPTZ |
| cancelled_at | TIMESTAMPTZ, nullable |
| cancelled_by | foreign key → users, nullable |
| cancellation_reason | text, nullable (required when admin-cancelled) |
| — | **Partial UNIQUE index** on `slot_id` `WHERE status = 'CONFIRMED'` — named `one_confirmed_booking_per_slot`. This is the double-booking defence: it permits historical cancelled bookings on a slot while enforcing a maximum of one confirmed booking per slot at any time. A plain unique constraint on `slot_id` would incorrectly block rebooking after cancellation. |

### `booking_events`

| Field | Notes |
|---|---|
| id | UUID primary key |
| booking_id | foreign key → bookings |
| actor_user_id | foreign key → users (who performed the action) |
| event_type | e.g. CREATED, CANCELLED |
| occurred_at | TIMESTAMPTZ |
| details | free text/JSON |

### `sessions`

Session store table: session ID, serialised session, expiry. Schema must match the **installed session-store library's documented schema** (`connect-pg-simple`), not a custom design.

- This is infrastructure data — **never expose it through an application endpoint.**
- Create it through a migration that matches the installed library's requirements.
- Avoid silently creating this table at runtime in production.

## Why the date + slot-index representation

The slot representation makes every bookable interval canonical:

- Index `0` = 09:00–10:00 IST; index `7` = 16:00–17:00 IST.
- The compound uniqueness constraint `(resource_id, booking_date, slot_index)` means two different IDs cannot represent the same resource/date/index.
- Users cannot invent partly overlapping intervals — no arbitrary start/end times exist in the schema.

## Reference: timestamp derivation query

```sql
SELECT
  (booking_date + TIME '09:00' + slot_index * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS starts_at,
  (booking_date + TIME '09:00' + (slot_index + 1) * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS ends_at
FROM resource_slots;
```

## Reference: the essential conflict constraint

```sql
CREATE UNIQUE INDEX one_confirmed_booking_per_slot
ON bookings (slot_id)
WHERE status = 'CONFIRMED';
```

PostgreSQL partial indexes reference: https://www.postgresql.org/docs/current/indexes-partial.html
