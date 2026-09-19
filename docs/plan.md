# Implementation Plan (Prompt A output) — Campus Resource Booking System

Produced by running **Prompt A** (`Campus_Resource_Booking_AI_Build_Guide.md` §9) against `docs/brief.md`, `docs/schema.md`, `docs/api-contract.md`, and `docs/acceptance-checks.md`.

This is a **plan only**. No implementation code accompanies this document.

## 1. File structure

Per Guide §7, unmodified:

```
client/src/pages
client/src/components      (ResourceCard, SlotPicker, BookingForm, StatusMessage, navigation)
client/src/api             (fetch wrapper, response parsing, CSRF handling)
client/src/context         (current user / session state)
client/src/styles

server/src/routes
server/src/controllers
server/src/services
server/src/repositories
server/src/middleware      (auth, permissions, validation, CSRF, errors)
server/src/db
server/migrations
server/scripts
server/tests

docs
infra
```

## 2. Data relationships

`users (1) —— (many) bookings`
`resources (1) —— (many) resource_slots`
`resource_slots (1) —— (0..many) bookings` (at most one `CONFIRMED` at a time, enforced by the partial unique index)
`bookings (1) —— (many) booking_events`
`users (1) —— (many) booking_events` (as `actor_user_id` — a student or an admin can be the actor)

Compound identity: a slot is uniquely identified by `(resource_id, booking_date, slot_index)`. A booking's temporal state (upcoming/in-progress/past) is **derived**, never stored, from `status` plus the slot's computed `startsAt`/`endsAt`.

## 3. API contracts

Adopted as-is from `docs/api-contract.md` — 20 routes total (see conflict #1 below regarding the Guide's own "19" count vs. its 20-row table).

## 4. Transaction strategy

Booking creation (per Guide §4 "Safe booking transaction"):

1. Authenticate and validate the request before entering the business operation.
2. Borrow one client from the pool; `BEGIN`.
3. Lock the resource row, then the slot row, in that order; revalidate `is_active`/`is_open`/start-time under those locks.
4. Insert `CONFIRMED` booking using the session user ID.
5. Insert its `CREATED` event, same transaction.
6. `COMMIT` → 201.
7. On violation of `one_confirmed_booking_per_slot` → rollback → 409 `SLOT_ALREADY_BOOKED`.
8. On any other failure → rollback, log safely, appropriate error; release client in `finally`.

Same resource-then-slot lock order applies to cancellation, slot closure, and resource deactivation. No transaction is held open across user input or a third-party call. Availability shown in the client is a snapshot — the backend and database re-enforce every rule regardless of what the UI displayed.

## 5. Authentication flow

- Server-side sessions in PostgreSQL (`express-session` + `connect-pg-simple`); session ID in an HttpOnly, host-only, SameSite=Lax cookie, Secure in HTTPS.
- Passwords hashed with Argon2id.
- Session ID and CSRF token both rotate on successful login; both are invalidated on logout.
- Synchronizer CSRF token delivered via `GET /api/auth/csrf`, sent back in a custom header on every state-changing request, including register and login.
- Allowed `Origin` validated on mutations.
- Role is read from server-side session/user data only — never trusted from client input, including on `POST /api/auth/register`, which must ignore or reject any client-supplied `role`.

## 6. Staged implementation plan

Maps to `BUILD_PHASES.md` phases 1–10 (already authored separately as the execution companion to this Guide):

1. Scaffold client + server, health endpoints, Vite `/api` proxy.
2. Provision PostgreSQL (dev + test databases), non-superuser runtime account, env contract.
3. Migrations for all 6 tables plus the two structural constraints; repeatable seed data.
4. Auth endpoints (csrf, register, login, me, logout) with session/CSRF rotation.
5. Resource catalogue + admin resource/slot endpoints with role enforcement.
6. Booking transaction, cancellation, event history, concurrency defence.
7. React screens wired to the real API, one journey at a time.
8. Automated + manual verification against all 23 acceptance checks.
9. Deployment: static frontend, private Postgres, reverse-proxied API, one HTTPS origin.
10. Handover: README, docs, milestones, demo rehearsal.

---

# Reconciliation against the four specification documents

## Conflicts / inconsistencies found

### Conflict 1 — Endpoint count mismatch (19 vs 20)

`Campus_Resource_Booking_AI_Build_Guide.md` §8 Step 1 tells the author to write "docs/api-contract.md with the endpoints," and this Phase 0 task explicitly targets **19 endpoints**. However, the Guide's own §5 table enumerates **20 distinct routes** — the 20th being `GET /api/admin/bookings/:id/events` ("Admin — Read booking event history"), which sits directly below `GET /api/admin/bookings` in the same table with no indication it is a sub-row or non-canonical.

**Resolution taken:** `docs/api-contract.md` documents all 20 routes found in Guide §5, numbered 1–20, and flags the discrepancy inline rather than silently dropping a documented endpoint to force the count to 19, or silently expanding the task's stated scope without noting it. **This conflict is not resolved by this plan — it is a decision for the requester**: either the task's "19" is a miscount and 20 is correct (routes are exhaustively specified in the Guide and dropping one would break acceptance-check coverage for admin booking event history), or one of the 20 listed routes was intended to be removed/merged and the Guide's table itself has a documentation error.

### Conflict 2 — No explicit endpoint for GET-ting a single admin resource by ID

Guide §5 lists `GET /api/admin/resources` (list, including inactive) and `PATCH /api/admin/resources/:id` (edit), but no `GET /api/admin/resources/:id` for reading one resource's full admin-view detail (e.g., before populating an edit form). The Guide does not flag this as intentional. **Not invented in the contract** — `docs/api-contract.md` only documents what the Guide states. Recorded here as a possible gap for the requester to confirm: the admin UI may need to reuse `GET /api/resources/:id` (which per the Guide only returns *active* resources), which would be insufficient for editing an inactive one.

### Conflict 3 — "19 endpoints" language reused in `BUILD_PHASES.md`

The previously created `BUILD_PHASES.md` (Phase 0 section) also states "19 endpoints," inheriting the same count referenced in this task. Since Conflict 1 is unresolved, `BUILD_PHASES.md`'s Phase 0 checklist item ("19 API endpoints are documented") will not literally match the 20 rows in `docs/api-contract.md` until the count question above is resolved by the requester.

## Items confirmed as consistent (no conflict)

- Fixed canonical slots (resource + date + slot_index 0–7): consistent across brief, schema, and API contract.
- Server-side sessions (PostgreSQL-backed, HttpOnly cookie, CSRF rotation on login): consistent across brief and API contract; schema's `sessions` table notes match the security requirements.
- Role permissions (STUDENT vs ADMIN, no client-supplied role): consistent across brief, API contract (register endpoint), and acceptance checks (#1, #5).
- Database-level conflict protection (`one_confirmed_booking_per_slot` partial unique index): consistent across schema and acceptance checks (#8, #11, #12); the transaction strategy in this plan correctly maps the named-index violation to 409 `SLOT_ALREADY_BOOKED` per the API contract's error envelope example.
- All 9 mandatory verbatim policies from the task are present, unmodified, in `docs/brief.md` §6.
- All 6 tables from Guide §4 are present in `docs/schema.md` with their stated constraints (UUID PKs, FKs, NOT NULL/CHECK, the two named uniqueness rules, IST timestamp derivation).
- All 23 acceptance checks from Guide §10 are present in `docs/acceptance-checks.md`, unmodified.

## Open contradictions requiring a decision before Phase 1

1. **Endpoint count:** confirm whether `docs/api-contract.md` should contain 19 or 20 endpoints, and if 19, which of the 20 Guide-table rows is to be excluded or merged.
2. **Admin single-resource read:** confirm whether a `GET /api/admin/resources/:id` endpoint is needed, or whether the admin UI is expected to fetch full (including inactive) resource detail through some other documented route.

No other ambiguities or missing requirements were found. No assumptions were made to silently resolve the above — they are recorded for explicit resolution.
