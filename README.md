# Campus Resource Booking System

Students reserve a campus resource — a study room, projector, lab workstation or
badminton court — for a fixed one-hour slot. Administrators maintain resources,
publish or close slots, inspect bookings and cancel with a reason.

React + Vite · Express 5 · PostgreSQL 17 · server-side sessions.

> **One resource, one canonical hour, one confirmed booking — enforced by the
> database, not the browser.**

## Quick start

Requires Node.js 24 and Docker.

```bash
# 1. Database
cp infra/.env.example infra/.env          # set local passwords
docker compose -f infra/compose.dev.yml --env-file infra/.env up -d db

# 2. API
cd server
cp .env.example .env                      # set DATABASE_URL, SESSION_SECRET, seed admin
npm ci
npm run db:migrate
npm run db:seed
npm run dev                               # http://localhost:4000

# 3. Frontend, in a second terminal
cd client
npm ci
npm run dev                               # http://localhost:5173
```

Open the URL Vite prints. Sign in with the seeded admin, or register a student
account.

## How it works

Three tiers, one browser origin. Vite proxies `/api` to Express in development;
nginx does the same in deployment, which is what lets the host-only session
cookie travel with API requests without any CORS configuration.

### Two rules carry the correctness

**1. Slots are canonical.** A bookable interval is `resource + date + slot_index`
where the index is 0–7, mapping to 09:00–10:00 through 16:00–17:00 IST.

```sql
UNIQUE (resource_id, booking_date, slot_index)   -- slot_index CHECK 0..7
```

No arbitrary start or end time is ever accepted from a browser, so two records
cannot describe overlapping intervals.

**2. The database arbitrates conflicts.**

```sql
CREATE UNIQUE INDEX one_confirmed_booking_per_slot
ON bookings (slot_id) WHERE status = 'CONFIRMED';
```

Partial, so cancelled bookings accumulate as history and a released slot can be
rebooked. A plain unique constraint would block rebooking forever.

Booking runs in one transaction on one borrowed client: lock the resource row,
then the slot row, revalidate every rule under those locks, insert the booking
and its audit event, commit. If two requests still pass simultaneously, exactly
one commit survives and the other is mapped — by that index name specifically —
to `409 SLOT_ALREADY_BOOKED`.

### Security

- Server-side sessions stored in PostgreSQL; only the session id reaches the
  browser, in an HttpOnly, host-only, SameSite=Lax cookie, Secure in production.
- Session id and CSRF token both rotate on login; the session is destroyed on
  logout.
- Synchroniser CSRF token required on every state-changing request, including
  register and login, with exact Origin validation.
- Argon2id password hashing. Rate-limited authentication.
- Public registration always creates a STUDENT — schemas strip unknown keys, so
  a submitted `role` never reaches the service.
- Role is re-read from the database on every request. React route guards are a
  navigation aid; the backend is the protection.
- Parameterised SQL throughout. Runtime database account cannot alter the schema.

## Commands

### Server

| Command | Purpose |
|---|---|
| `npm run dev` | Start with reload |
| `npm start` | Start once |
| `npm run lint` | ESLint |
| `npm test` | Integration tests against the test database |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Idempotent development seed |
| `npm run db:create-admin` | Create the initial administrator |
| `npm run db:reset -- --confirm` | Destructive, development only |

`DB_TARGET=test npm run db:migrate` migrates the test database.

### Client

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with the `/api` proxy |
| `npm run build` | Production build into `dist` |
| `npm run lint` | oxlint |

## Layout

```
client/src/{pages,components,api,context,lib}
server/src/{routes,controllers,services,repositories,middleware,db,domain,config}
server/{migrations,scripts,tests}
infra/            compose files, database init, nginx TLS certificates
docs/             brief, schema, API contract, acceptance checks, verification, deployment
```

## Documentation

| Document | Contents |
|---|---|
| [docs/brief.md](docs/brief.md) | Scope, roles and every booking policy |
| [docs/schema.md](docs/schema.md) | Tables and constraints |
| [docs/api-contract.md](docs/api-contract.md) | All endpoints, envelopes, status codes |
| [docs/acceptance-checks.md](docs/acceptance-checks.md) | The 23 acceptance scenarios |
| [docs/verification.md](docs/verification.md) | What was run and what it produced |
| [docs/deployment.md](docs/deployment.md) | Release sequence, rollback, backups |
| [docs/environment.md](docs/environment.md) | Tested versions and dependency decisions |
| [BUILD_PHASES.md](BUILD_PHASES.md) | The phased build workflow |

## Testing

```bash
cd server && npm test
```

56 tests against real PostgreSQL in an isolated test database. Mock-only tests
cannot demonstrate database constraints, so the concurrency and permission checks
run against the real thing:

```
two users submit the same slot concurrently
  → [201, 409], conflict code SLOT_ALREADY_BOOKED, exactly 1 confirmed row
```

The harness refuses to truncate any database whose name does not contain `test`,
and aborts if `TEST_DATABASE_URL` equals `DATABASE_URL`.

## Deployment

See [docs/deployment.md](docs/deployment.md). In short: build `client/dist`, run
migrations once as a release job, start the API with runtime secrets, serve
everything through one HTTPS origin with `/api` proxied to Express.

**HTTPS is required.** Production session cookies are `Secure`, so over plain
HTTP no cookie is issued and login cannot work.

## Known limitations

- Rate limiting is in-memory, so it is per-instance. Multiple API replicas need a
  shared store or gateway-level control.
- Public registration does not prove campus membership. Institutional
  verification or SSO is needed before treating this as an official system.
- Deferred by design: email/SMS, payments, uploads, QR check-in, recurring or
  multi-slot bookings, approval workflows, waitlists, SSO.
