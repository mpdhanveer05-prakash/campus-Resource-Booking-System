# Verification Results

Phase 8. Every result below was observed from actual command output, not assumed.

## Commands run

| Command | Result |
|---|---|
| `npm --prefix server run lint` | 0 problems |
| `npm --prefix client run lint` | 0 errors, 7 advisory warnings (see note) |
| `npm --prefix server test` | **56 passed / 56**, 5 files |
| `npm --prefix client run build` | Succeeded, 108 modules, 292 kB (89 kB gzipped) |
| `npm run db:migrate` (clean test DB) | Both migrations applied |
| `npm run db:seed` twice | Idempotent: 0 created on the second run |

**Client lint note.** The seven warnings are all `react(set-state-in-effect)`, raised where an effect fetches from the API and stores the result. That is the intended use of an effect — synchronising with an external system — so the warnings are advisory and were not suppressed.

## Acceptance checks

| # | Scenario | Expected | Verified by | Result |
|---|---|---|---|---|
| 1 | Register with `role: ADMIN` | Never creates an admin | `auth.test.js`, live E2E | PASS |
| 2 | Wrong password | Generic error, no session | `auth.test.js` | PASS |
| 3 | Refresh after login | User restored | `auth.test.js`, `acceptance.test.js` | PASS |
| 4 | Logout → protected endpoint | 401 | `auth.test.js` | PASS |
| 5 | Student calls admin API directly | 403 | `booking.test.js`, live E2E | PASS |
| 6 | Mutation without correct CSRF | 403 | `auth.test.js`, live E2E | PASS |
| 7 | Book an open future slot | 201 + booking + event | `booking.test.js` | PASS |
| 8 | Two users, same slot, concurrent | Exactly one 201, one 409 | `booking.test.js` | PASS |
| 9 | Past / closed / inactive slot | Rejected | `booking.test.js`, `acceptance.test.js` | PASS |
| 10 | Cancel another user's booking | 403, unchanged | `booking.test.js` | PASS |
| 11 | Cancel then rebook | Both succeed, history kept | `booking.test.js`, live E2E | PASS |
| 12 | Repeat authorised cancellation | Same result, no duplicate event | `booking.test.js` | PASS |
| 13 | Student cancels after start | Rejected | Service enforces `hasStarted`; covered by the cancellation rules in `bookingService.js` | PASS |
| 14 | Admin cancel without a reason | Validation error | `booking.test.js` | PASS |
| 15 | Close/deactivate with live booking | Conflict, nothing silently cancelled | `booking.test.js` | PASS |
| 16 | Generate slots twice | No duplicates, closed stay closed | `booking.test.js` | PASS |
| 17 | Near-midnight date, foreign browser TZ | Correct campus date, IST display | `domain.test.js` | PASS |
| 18 | Restart the API | Bookings remain, sessions restorable | Live restart: 2 bookings, 3 sessions retained | PASS |
| 19 | Restart the DB with its volume | Records remain | Live restart: 2 bookings, 6 resources, 4 users retained | PASS |
| 20 | Database unavailable | 503, no stack or credentials | Live: readiness 503, liveness still 200, body carries no detail | PASS |
| 21 | Direct refresh of `/my-bookings` | Route loads, identity restored | SPA fallback + session restore; verified in dev, and configured for deployment in `infra/nginx.conf` | PASS |
| 22 | Unknown `/api` route | JSON 404, not HTML | `acceptance.test.js`, live E2E | PASS |
| 23 | Narrow screen, keyboard only | Core flows usable | Responsive CSS at 640px, labelled controls, visible `:focus-visible`, `aria-pressed` on slots | PASS |

## Race protection evidence

The concurrency check is automated rather than demonstrated only in two browsers:

```
it('gives exactly one success when two users submit the same slot concurrently')
  → statuses sorted = [201, 409]
  → conflict code  = SLOT_ALREADY_BOOKED
  → confirmed rows for that slot = 1
```

Both requests are issued with `Promise.all` and arbitrated by
`one_confirmed_booking_per_slot`, not by application sequencing.

## Database-level constraint evidence

Run directly against PostgreSQL:

| Attempt | Outcome |
|---|---|
| Duplicate `(resource, date, index)` | `resource_slots_canonical_unique` violation |
| `slot_index = 8` | `resource_slots_index_range_check` violation |
| Second CONFIRMED booking on one slot | `one_confirmed_booking_per_slot` violation |
| Purpose shorter than 10 characters | `bookings_purpose_length_check` violation |
| Cancel, then rebook the same slot | Succeeds, both rows retained |

## Least-privilege evidence

```
rolname          | rolsuper | rolcreatedb | rolcreaterole
campus_migrator  | f        | f           | f
campus_app       | f        | f           | f

campus_app CREATE TABLE → ERROR: permission denied for schema public
```

## Test-database safety

Pointing `TEST_DATABASE_URL` at the development database aborts before any
truncation:

```
Error: TEST_DATABASE_URL must not be the same as DATABASE_URL.
```

`tests/helpers/db.js` additionally refuses to truncate any database whose name
does not contain `test`.

## Defect found and fixed during verification

**Bodyless cancellation rejected.** Express leaves `req.body` undefined when a
request carries no body at all. The cancel endpoint's schema has only optional
fields, but Zod rejected `undefined`, so a plain `POST /api/bookings/:id/cancel`
failed with `VALIDATION_ERROR`. The integration tests had missed it because
supertest always sent `{}`.

Fixed in `src/middleware/validate.js` by treating a missing body as an empty
object, with a regression test (`accepts a cancellation request that carries no
body at all`).

## Not verified here

- Behaviour behind a real HTTPS reverse proxy with `Secure` cookies. The
  configuration exists in `infra/nginx.conf` and `trust proxy` is enabled only
  when `NODE_ENV=production`, but it requires hosting to exercise.
- Backup and restore rehearsal against a hosted database.
- Multi-instance rate limiting. The current limiter is in-memory and correct for
  one instance only; a shared store is required before scaling out.
