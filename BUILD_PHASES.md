# Campus Resource Booking System — Build Workflow

**Companion to:** `Campus_Resource_Booking_AI_Build_Guide.md` (the specification).
**This file is:** the execution plan. Call this file at the start of any build session and say which phase to work on.

---

## How to use this file

1. Work **one phase at a time, top to bottom**. Never start a phase while the previous phase's Exit Gate is red.
2. Every phase has: **Goal → Tasks → Commands → Exit Gate → Commit tag**.
3. An Exit Gate is passed only with **observed evidence** (command output, HTTP response, SQL row, screenshot). An assistant claiming success is not evidence.
4. After each phase: `git status` (check no secrets / `node_modules` / DB volumes staged) → `git diff` → commit with the phase tag.
5. If a phase fails, fix it inside that phase. Do not carry a broken gate forward.

**Reference map**

| Need | Where |
|---|---|
| Business rules & policies | Guide §1 |
| Table design | Guide §4 |
| Endpoint list | Guide §5 |
| Auth / CSRF rules | Guide §6 |
| Folder responsibilities | Guide §7 |
| AI prompts A–H | Guide §9 |
| 23 acceptance checks | Guide §10 |
| Symptom → evidence table | Guide §12 |

---

## The moto of the application (keep this in view in every phase)

> **One resource, one canonical hour, one confirmed booking — enforced by the database, not the browser.**

Five non-negotiables that every phase must protect:

1. **The server owns truth.** Current time, slot times, user identity and role are derived server-side. The browser never asserts them.
2. **Slots are canonical, not arbitrary.** A bookable interval is `resource + date + slot_index (0–7)`. No free-form start/end times are ever accepted.
3. **The database is the last line of defence.** UI checks are convenience; the partial unique index is what actually prevents a double booking.
4. **History is never destroyed.** Cancellation retains the record and its events. Nothing is hard-deleted in a way that erases booking history.
5. **Secrets stay server-side.** DB URL, session secret and password hashes never reach the client or the logs.

**Scope fence — v1 does NOT include:** email/SMS, payments, file uploads, QR check-in, recurring or multi-slot bookings, approval workflows, waitlists, SSO, or any runtime AI/model feature. If a task drifts into these, stop and re-scope.

---

## Phase map

| Phase | Name | Output | Tag |
|---|---|---|---|
| 0 | Specification | `docs/` context files + approved plan | — |
| 1 | Scaffold & configuration | Running client + API skeleton | `01-scaffold` |
| 2 | Database & environment | Reachable dev DB, env contract | — |
| 3 | Migrations & seed | Real schema + constraints + fixture data | `02-schema` |
| 4 | Authentication & sessions | Register / login / me / logout + CSRF | `03-auth` |
| 5 | Catalogue & admin resources | Resource & slot APIs + role enforcement | — |
| 6 | Booking transactions | Booking, cancellation, events, 409 race safety | `04-booking-api` |
| 7 | React interface | Full UI against the real API | `05-react-flow` |
| 8 | Verification | Tests, lint, prod build, acceptance checks | — |
| 9 | Deployment | Live HTTPS app, private DB | `06-deployed` |
| 10 | Handover & workshop prep | README, milestones, demo script | — |

---

# Phase 0 — Specification

**Goal:** Freeze the contract before any code exists, so the assistant has stable context.

### Tasks
- [ ] Create `docs/brief.md` — scope, two roles, booking policies from Guide §1.
- [ ] Create `docs/schema.md` — the 6 tables and constraints from Guide §4.
- [ ] Create `docs/api-contract.md` — the 19 endpoints, envelopes and status codes from Guide §5.
- [ ] Create `docs/acceptance-checks.md` — the 23 checks from Guide §10.
- [ ] Run **Prompt A** (Guide §9) — plan only, **no implementation code**.
- [ ] Read the returned plan and reconcile it against the four docs. Record any conflicts it flags.

### Policies that must appear verbatim in `docs/brief.md`
- Timezone **Asia/Kolkata**, displayed beside every date and time.
- Slots `09:00–10:00` … `16:00–17:00`, indexes **0–7**.
- Students book **today → 13 days ahead**, only if the slot has not started.
- Purpose: trimmed text **10–300 characters**, rendered as text, never HTML.
- Booking confirms immediately — **no pending state**.
- Persisted statuses: **CONFIRMED** and **CANCELLED** only. Upcoming / in-progress / past are computed.
- Student cancels own booking **before start**; admin cancels **before end** and **must give a reason**.
- Repeating an authorised cancellation returns the existing result — **no second event**.
- Closing a slot or deactivating a resource with an unfinished CONFIRMED booking is **rejected**.

### Exit Gate
The plan matches: fixed canonical slots · server-side sessions · role permissions · database-level conflict protection. No open contradictions.

---

# Phase 1 — Scaffold & configuration

**Goal:** Two processes that start cleanly and talk to each other. No features.

### Tasks
- [ ] Scaffold the repository structure.
- [ ] Run **Prompt B** for: Express app split from its listen entry, environment validation, pg pool, request IDs, structured logs (pino), central error handler.
- [ ] Add `GET /api/health/live` and `GET /api/health/ready`.
- [ ] Configure Vite to proxy `/api` → `http://localhost:4000`.
- [ ] Add scripts: `dev`, `start`, `lint`, `test` (migration/seed scripts arrive in Phase 3).
- [ ] Add `.gitignore` — ignore `.env`, `node_modules`, build output, logs, test artifacts; explicitly allow `.env.example`.
- [ ] Add backend lint configuration.
- [ ] Record the tested Node version; commit **both** lockfiles.

### Commands
```bash
mkdir campus-resource-booking && cd campus-resource-booking
git init
npm create vite@latest client -- --template react
cd client && npm install && npm install --save-exact react-router && cd ..
mkdir server && cd server && npm init -y
npm install --save-exact express@5 pg express-session connect-pg-simple argon2 zod helmet express-rate-limit dotenv pino pino-http
npm install --save-dev --save-exact nodemon node-pg-migrate vitest supertest
cd ..
```

### Guardrails
- Never use `--force` to silence an engine incompatibility — resolve it deliberately.
- Subsequent installs use `npm ci`, not `npm install`.
- Use **relative `/api` URLs** in React from day one. Do not hardcode `localhost:4000`.

### Exit Gate
The Vite dev server starts **and** `curl http://localhost:4000/api/health/live` returns a healthy JSON response.

### Commit
`git tag 01-scaffold`

---

# Phase 2 — Database & environment

**Goal:** A reachable, correctly-permissioned PostgreSQL with a documented environment contract.

### Tasks
- [ ] Choose **one**: native PostgreSQL 17 **or** Compose. Not both.
- [ ] Create **separate** development and test databases.
- [ ] Create a **non-superuser** runtime account. A separate migration account owns the schema; the runtime account gets only operational privileges.
- [ ] If Compose: bind the DB to `127.0.0.1` only, use a **named volume**, add a DB health check, pin the exact image tag.
- [ ] Write `.env.example` with descriptions and placeholders only — **no real values**.
- [ ] Confirm no `VITE_` variable contains a secret.

### Environment contract

| Variable | Meaning |
|---|---|
| `PORT` | 4000 locally |
| `NODE_ENV` | `development` locally, `production` deployed |
| `DATABASE_URL` | Runtime connection — server-only secret |
| `MIGRATION_DATABASE_URL` | Migration account — migration jobs only |
| `TEST_DATABASE_URL` | Isolated integration-test database |
| `SESSION_SECRET` | Long random value — server-only secret |
| `APP_ORIGIN` | `http://localhost:5173` locally; exact HTTPS origin deployed |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Local seed inputs — never public defaults |

### Commands (Compose path)
```bash
docker compose -f infra/compose.dev.yml up -d db
docker compose -f infra/compose.dev.yml ps
```

### Exit Gate
`GET /api/health/ready` returns **200** — proving the API actually reached the development database.

---

# Phase 3 — Migrations & seed

**Goal:** The real schema, carrying the two structural rules the whole product rests on.

### Tasks
- [ ] Run **Prompt C** for versioned migrations: `users`, `resources`, `resource_slots`, `bookings`, `booking_events`, and the session table matching the **installed** `connect-pg-simple` schema.
- [ ] UUID primary keys, foreign keys, NOT NULL and CHECK constraints, indexes for user booking history and resource/date availability.
- [ ] Define `db:migrate` and `db:seed` scripts that load environment variables safely.
- [ ] Write a repeatable seed: 2 students, 1 admin, 6 fictional resources, canonical slots for the next 14 campus dates.
- [ ] Make destructive reset a **separate, explicit, development-only** command.

### The two rules that must exist in migrations
```sql
-- 1. Canonical slot identity
UNIQUE (resource_id, booking_date, slot_index)   -- slot_index CHECK BETWEEN 0 AND 7

-- 2. Double-booking defence (partial, so cancelled rows can coexist)
CREATE UNIQUE INDEX one_confirmed_booking_per_slot
ON bookings (slot_id)
WHERE status = 'CONFIRMED';
```

### Timestamp derivation (central, server-side)
```sql
SELECT
  (booking_date + TIME '09:00' + slot_index * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS starts_at,
  (booking_date + TIME '09:00' + (slot_index + 1) * INTERVAL '1 hour')
    AT TIME ZONE 'Asia/Kolkata' AS ends_at
FROM resource_slots;
```
Keep `booking_date` as a PostgreSQL `DATE` returned as `YYYY-MM-DD`. Keep created / cancelled / event times as `TIMESTAMPTZ`.

### Commands
```bash
cd server
npm run db:migrate
npm run db:seed
npm run db:seed   # must be idempotent — no duplicates, no reopened slots, no password resets
```

### Exit Gate
On a **clean** database: migrate and seed succeed; a manual duplicate `(resource, date, index)` insert is rejected; a second CONFIRMED booking on one slot is rejected; running the seed twice changes nothing.

### Commit
`git tag 02-schema`

---

# Phase 4 — Authentication & sessions

**Goal:** Identity that survives refresh and cannot be escalated.

### Tasks
- [ ] Run **Prompt D**.
- [ ] Implement `GET /api/auth/csrf`, `POST /register`, `POST /login`, `GET /me`, `POST /logout`.
- [ ] Argon2id password hashing per current library guidance.
- [ ] PostgreSQL-backed sessions (`connect-pg-simple`) — never Express `MemoryStore`.
- [ ] Cookie: **HttpOnly, host-only, SameSite=Lax, finite expiry, Secure in HTTPS**.
- [ ] **Regenerate the session ID and rotate the CSRF token on login**; destroy the session on logout using the explicit cookie name and matching options.
- [ ] Session-bound synchronizer CSRF token via a custom header on all state-changing requests — **including register and login**. Validate the allowed `Origin`.
- [ ] Rate-limit authentication attempts; cap request body size; validate all input with Zod.
- [ ] Role middleware reads the role from **trusted server data**, never from the request body.

### Guardrails
- Public registration must **reject or ignore** any `role` or privilege field. There is no role selector.
- Never return password hashes or session tokens in any payload.
- Keep cookies, passwords and tokens out of logs.
- No bearer token in `localStorage`.

### Exit Gate (test with two separate browser profiles)
Refresh restores identity · logout then a protected call → **401** · register with `role: "ADMIN"` → still a STUDENT · authenticated write without CSRF → **403** · wrong password → generic error, no session.

### Commit
`git tag 03-auth`

---

# Phase 5 — Catalogue & admin resources

**Goal:** Read paths and admin mutations, with permission enforced on the server.

### Tasks
- [ ] `GET /api/resources` — search, category/location filters, **bounded** pagination, active only.
- [ ] `GET /api/resources/:id` — one active resource.
- [ ] `GET /api/resources/:id/slots?date=YYYY-MM-DD` — availability with canonical `startsAt` / `endsAt`.
- [ ] `GET /api/admin/resources` — includes inactive.
- [ ] `POST /api/admin/resources`, `PATCH /api/admin/resources/:id`.
- [ ] `POST /api/admin/resources/:id/slots/generate` — validate `fromDate` / `toDate` inside the booking window; **the server constructs indexes 0–7 itself**.
- [ ] `PATCH /api/admin/slots/:id` — set `isOpen`.
- [ ] `GET /api/admin/bookings`, `GET /api/admin/bookings/:id/events`.

### Guardrails
- Slot generation is **idempotent**: existing slots are untouched, **closed slots stay closed**. Reopening is a separate explicit action.
- Reject closing a slot or deactivating a resource that has a CONFIRMED booking which has not ended — **no silent cancellation**.
- Every list endpoint validates pagination and returns bounded results.

### Exit Gate
A logged-in student can read resources but receives **403** on every admin mutation — verified by calling the endpoint **directly**, not just by hiding the button.

---

# Phase 6 — Booking transactions

**Goal:** The core correctness of the product. This is the phase that earns the design.

### Tasks
- [ ] Run **Prompt E**.
- [ ] `POST /api/bookings` with `{ slotId, purpose }`.
- [ ] `GET /api/bookings/mine` — current user only.
- [ ] `POST /api/bookings/:id/cancel` — owner or admin.
- [ ] Booking event history written inside the same transaction.
- [ ] Integration tests with **two independently authenticated users** against real PostgreSQL.

### The transaction (exact order)
1. Authenticate and validate **before** entering the business operation.
2. Borrow **one** client from the pool; `BEGIN`.
3. Lock the **resource** row, then the **slot** row — in that order. Revalidate `is_active`, `is_open` and the slot start time **under those locks**.
4. Insert a `CONFIRMED` booking using the **session** user ID — never a body `userId`.
5. Insert its `CREATED` event in the same transaction.
6. `COMMIT` → **201**.
7. On violation of `one_confirmed_booking_per_slot` specifically → rollback → **409 `SLOT_ALREADY_BOOKED`**.
8. On any other failure → rollback, log a safe diagnostic, return an appropriate error. Release the client in `finally`.

### Guardrails
- All statements use the **same borrowed client** — never a mix of `pool.query` calls.
- Do **not** map every SQL error to a booking conflict. Match the named index.
- Use the **same resource → slot → booking lock order** for cancellation, slot closure and deactivation.
- Never hold a transaction open while waiting for user input or a third-party call.

### Exit Gate
Two simultaneous requests for one slot → exactly **one 201 and one 409**, exactly **one** CONFIRMED row · cancel-then-rebook succeeds with the cancelled record retained · repeat cancellation returns the same result with **no duplicate event** · a student cancelling another user's booking → 403 · admin cancellation without a reason → validation error.

### Commit
`git tag 04-booking-api`

---

# Phase 7 — React interface

**Goal:** Real screens against the real API. **No mock data anywhere.**

### Tasks
- [ ] Run **Prompt F**. Build **one user journey at a time** and verify each before moving on.
- [ ] One shared `fetch` helper: credentials, JSON parsing, error shape, CSRF header.
- [ ] Auth context and route guards (a navigation aid only — the backend is the real protection).
- [ ] Order: login/register → resource list → resource detail and slot picking → My bookings → admin tabs.
- [ ] Components: `ResourceCard`, `SlotPicker`, `BookingForm`, `StatusMessage`, navigation.
- [ ] Slot states rendered distinctly: **available / booked / closed / past**.
- [ ] Refresh the CSRF token after login rotates the session.

### UX requirements
- Field errors, request progress, empty states, permission errors, and the booking-conflict message.
- Timestamps formatted in **Asia/Kolkata**, with the timezone shown.
- Prevent a **stale response** from overwriting a newer date or filter selection.
- Refresh availability after a conflict **and** after any successful mutation.
- On a **timeout**, say the outcome is uncertain and offer a My-bookings / availability refresh — never declare the booking failed.
- Disable duplicate submits for usability, while keeping server and database protection.
- Labels, keyboard focus order, responsive mobile layout, and a not-found page.

### Exit Gate
Register → log in → book → refresh → view My bookings → cancel, all against the real database. **Zero** silent fallback to mock data or `localStorage` bookings. Data survives an API restart.

### Commit
`git tag 05-react-flow`

---

# Phase 8 — Verification

**Goal:** Evidence, not confidence.

### Tasks
- [ ] Run **Prompt G**.
- [ ] Unit tests plus database integration tests against `TEST_DATABASE_URL`.
- [ ] **Fail fast** if `TEST_DATABASE_URL` points at the development or production database. Never run destructive setup against a shared DB.
- [ ] Automate the **concurrency** and **permission** checks — mocks cannot demonstrate database constraints.
- [ ] Manual browser pass over Guide §10.
- [ ] Review parameterised SQL, named-error mapping, transaction client usage, rollback paths, cookie configuration, and secret/log exposure.

### Must-pass acceptance checks

| Scenario | Expected |
|---|---|
| Register with `role: ADMIN` | Never creates an admin |
| Wrong password | Generic error, no session |
| Refresh after login | User restored |
| Logout → protected endpoint | 401 |
| Student calls an admin API directly | 403 |
| Mutation without correct CSRF | 403 |
| Book an open future slot | 201 + booking + event |
| Two users, same slot, concurrent | Exactly one 201, one 409 |
| Past / closed / inactive slot | Rejected |
| Cancel another user's booking | 403, unchanged |
| Cancel then rebook | Both succeed, history kept |
| Repeat an authorised cancellation | Same result, no duplicate event |
| Student cancels after start | Rejected |
| Admin cancel without a reason | Validation error |
| Close or deactivate with a live booking | Conflict, nothing silently cancelled |
| Generate slots twice | No duplicates, closed stay closed |
| Near-midnight date, foreign browser TZ | Correct campus date, IST display |
| Restart the API | Bookings remain, sessions restorable |
| Restart the DB with its volume | Records remain |
| Database unavailable | 503, no stack or credentials leaked |
| Direct refresh of `/my-bookings` | Route loads, identity restored |
| Unknown `/api` route | JSON 404, not HTML |
| Narrow screen, keyboard only | Core flows usable |

### Exit Gate
Critical checks pass · lint succeeds · `npm run build` in `client` succeeds. **Record the exact commands run and their output.** State explicitly which checks were not run.

---

# Phase 9 — Deployment

**Goal:** One HTTPS origin, three separable services, a private database.

### Sequence
1. [ ] Choose hosting for: static frontend, API service, PostgreSQL.
2. [ ] Run **Prompt H**.
3. [ ] Clean installs (`npm ci`), server checks, client production build → package `client/dist`. **Never run the Vite dev server as production.**
4. [ ] Provision persistent PostgreSQL with restricted network access, separate migration and runtime credentials, and the provider's TLS requirements met.
5. [ ] Back up any existing database, then run migrations **once as a release job** — replicas must not race to migrate or auto-create tables.
6. [ ] Start the API: runtime secrets, `NODE_ENV=production`, correct `APP_ORIGIN`, `trust proxy` configured **only** for the known topology.
7. [ ] Serve assets through the public HTTPS proxy. Forward `/api` to Express. Apply **SPA fallback to frontend routes only** — unknown `/api` routes must return **JSON 404**, not `index.html`.
8. [ ] Verify over HTTPS: readiness, cookies, CSRF, role permissions, booking conflict, cancellation, page refresh, persistence.
9. [ ] Create the initial admin via a controlled command with a **private** password. Never publish demo credentials on a public app.
10. [ ] Configure structured logs, retention, backups, and rehearse a **restore**. Keep prior artifacts for rollback.

### Guardrail
Rolling back the frontend does **not** undo a migration. Database changes need their own compatibility and rollback plan.

### Exit Gate
A student and an admin complete their full flows over HTTPS, data persists across a restart, and the database has **no public access**. Verified on the deployed URL, separately from localhost.

### Commit
`git tag 06-deployed`

---

# Phase 10 — Handover & workshop prep

### Tasks
- [ ] Confirm all six tags exist: `01-scaffold`, `02-schema`, `03-auth`, `04-booking-api`, `05-react-flow`, `06-deployed`.
- [ ] Keep three artifacts: a **clean starter**, the **completed version**, and a **short recording**.
- [ ] Rehearse the demo: one booking traced through **UI → Network panel → API log → SQL row**, then the two-browser conflict case.
- [ ] Prepare the student extension: *add a required attendee count for room bookings* — migration + API validation against room capacity + React form field + an over-capacity rejection test. (Clarify that it still reserves the whole room.)

### Handover package
README · the four `docs/` files · source · migrations · seed instructions · **both** lockfiles · `.env.example` · test commands **and results** · architecture diagram · deployment configuration · known limitations.

**Never in the handover:** real credentials, `node_modules`, database volumes.

---

## Troubleshooting — symptom to first evidence

| Symptom | Look here first |
|---|---|
| An API request returns HTML | Proxy path or SPA fallback swallowed the API route |
| Login works but refresh logs out | Cookie flags, session persistence, proxy config, session/CSRF rotation |
| 403 on every write | CSRF bootstrap, header name, current token, configured Origin |
| Availability looks wrong | Campus date conversion, slot generation, query parameters |
| A double booking succeeds | Missing migration or index, or wrong booking status values |
| Cannot rebook after cancelling | Unconditional unique constraint instead of the partial index, or a failed cancellation transaction |
| DB works locally, not from the API container | Container hostname — `localhost` means *that* container |
| Records vanish after restart | Wrong database or missing persistent volume |
| A student reaches admin data | Missing server-side permission middleware — hidden React buttons are not protection |

---

## Session starter

> Read `BUILD_PHASES.md`. We are on **Phase N**. Confirm the previous phase's Exit Gate, then execute Phase N's tasks using the referenced prompt from `Campus_Resource_Booking_AI_Build_Guide.md` §9. Report the exact commands run and their output, and state anything you did not verify.
