# API Contract — Campus Resource Booking System

Source: `Campus_Resource_Booking_AI_Build_Guide.md` §5. This document defines the contract only — no endpoint is implemented in this phase.

## Conventions

- All protected endpoints authenticate the session on the server.
- List endpoints validate pagination and return bounded results.
- Slot generation accepts a validated `fromDate`/`toDate` within the booking window and constructs indexes 0–7 itself. It does not accept arbitrary times. Existing slots remain unchanged, including closed slots. Changing a slot to open is a separate explicit admin action.

### Success envelope

```json
{
  "data": {
    "id": "booking-uuid",
    "status": "CONFIRMED",
    "slotId": "slot-uuid"
  }
}
```

### Error envelope

```json
{
  "error": {
    "code": "SLOT_ALREADY_BOOKED",
    "message": "This slot was just booked. Please choose another slot."
  },
  "requestId": "request-id"
}
```

### HTTP status codes

| Code | Meaning |
|---|---|
| 200/201 | Success |
| 400 | Malformed/invalid input |
| 401 | No valid login |
| 403 | Permission/CSRF failure |
| 404 | Missing resource |
| 409 | State conflict |
| 429 | Rate limit |

Never send stack traces, SQL strings containing sensitive data, or password hashes to the browser.

## Endpoints (19)

| # | Method and route | Access | Purpose |
|---|---|---|---|
| 1 | `GET /api/health/live` | Public | Process liveness; no sensitive configuration |
| 2 | `GET /api/health/ready` | Public | Database readiness; 503 on failure without database details |
| 3 | `GET /api/auth/csrf` | Public with session | Obtain the session-bound CSRF token |
| 4 | `POST /api/auth/register` | Public with CSRF | Create a STUDENT account; then require login |
| 5 | `POST /api/auth/login` | Public with CSRF | Verify credentials, rotate session ID, establish login |
| 6 | `GET /api/auth/me` | Signed in | Return safe current-user fields |
| 7 | `POST /api/auth/logout` | Signed in with CSRF | Destroy session and clear cookie |
| 8 | `GET /api/resources` | Signed in | Search/filter active resources |
| 9 | `GET /api/resources/:id` | Signed in | Read one active resource |
| 10 | `GET /api/resources/:id/slots?date=YYYY-MM-DD` | Signed in | Availability with canonical start/end timestamps |
| 11 | `POST /api/bookings` | Signed in with CSRF | Book a slot using `{ slotId, purpose }` |
| 12 | `GET /api/bookings/mine` | Signed in | Only current user's booking history |
| 13 | `POST /api/bookings/:id/cancel` | Owner or admin with CSRF | Cancel under the defined policy |
| 14 | `GET /api/admin/resources` | Admin | Include inactive resources |
| 15 | `POST /api/admin/resources` | Admin with CSRF | Create a resource |
| 16 | `PATCH /api/admin/resources/:id` | Admin with CSRF | Edit or deactivate under the defined policy |
| 17 | `POST /api/admin/resources/:id/slots/generate` | Admin with CSRF | Idempotently publish canonical slots in an allowed date range |
| 18 | `PATCH /api/admin/slots/:id` | Admin with CSRF | Set isOpen; reject closure with an outstanding confirmed booking |
| 19 | `GET /api/admin/bookings` | Admin | Filter all bookings |

Note: the Guide lists a 20th row, `GET /api/admin/bookings/:id/events` (Admin — read booking event history), immediately after row 19 in its table. Counted strictly against the Guide's own claim of "19 endpoints" in §8 Step 1, the table in §5 actually enumerates **20** distinct routes. This discrepancy is recorded as a conflict in the reconciliation notes below rather than silently resolved.

| — | `GET /api/admin/bookings/:id/events` | Admin | Read booking event history |

## Per-endpoint detail

### 1. `GET /api/health/live`
- **Auth:** none.
- **Request:** none.
- **Response:** liveness confirmation. Must not leak configuration.
- **Status codes:** 200.

### 2. `GET /api/health/ready`
- **Auth:** none.
- **Request:** none.
- **Response:** readiness confirmation (checks DB connectivity).
- **Status codes:** 200 (ready), 503 (not ready, no DB details in the body).

### 3. `GET /api/auth/csrf`
- **Auth:** public, but session-bound.
- **Request:** none.
- **Response:** `{ data: { csrfToken } }`.
- **Status codes:** 200.

### 4. `POST /api/auth/register`
- **Auth:** public; requires CSRF header.
- **Request body:** `{ name, email, password }`. Must **not** accept a `role` field, or must ignore/reject it — public registration always creates STUDENT.
- **Response:** confirmation that the account was created; caller must then log in separately (no auto-login implied by the Guide).
- **Status codes:** 201 (created), 400 (validation), 403 (CSRF/Origin failure), 409 (email already in use).

### 5. `POST /api/auth/login`
- **Auth:** public; requires CSRF header.
- **Request body:** `{ email, password }`.
- **Behaviour:** verify credentials, **rotate session ID on success**, establish the session cookie.
- **Response:** `{ data: { user: { id, name, email, role } } }` — never a password hash.
- **Status codes:** 200, 400 (validation), 401 (bad credentials — generic message), 403 (CSRF/Origin failure), 429 (rate limited).

### 6. `GET /api/auth/me`
- **Auth:** signed in.
- **Request:** none.
- **Response:** `{ data: { id, name, email, role } }` — safe fields only.
- **Status codes:** 200, 401 (no session).

### 7. `POST /api/auth/logout`
- **Auth:** signed in; requires CSRF header.
- **Request:** none.
- **Behaviour:** destroy session server-side, clear the cookie using its exact name and options.
- **Status codes:** 200/204, 401 (no session), 403 (CSRF failure).

### 8. `GET /api/resources`
- **Auth:** signed in.
- **Request query:** search text, category filter, location filter, pagination params.
- **Response:** `{ data: { items: [...], page, pageSize, total } }` — bounded, active resources only.
- **Status codes:** 200, 400 (invalid pagination/filter params), 401.

### 9. `GET /api/resources/:id`
- **Auth:** signed in.
- **Response:** one active resource's detail.
- **Status codes:** 200, 401, 404 (not found or inactive).

### 10. `GET /api/resources/:id/slots?date=YYYY-MM-DD`
- **Auth:** signed in.
- **Request query:** `date` (validated `YYYY-MM-DD`, within the allowed booking window).
- **Response:** list of slots for that resource/date with `slotIndex`, `isOpen`, computed availability state, and canonical `startsAt`/`endsAt` timestamps (server-derived, Asia/Kolkata).
- **Status codes:** 200, 400 (invalid/out-of-window date), 401, 404 (resource not found).

### 11. `POST /api/bookings`
- **Auth:** signed in; requires CSRF header.
- **Request body:** `{ slotId, purpose }`. `purpose` trimmed, 10–300 characters. User ID is taken from the session, never the body.
- **Response:** `{ data: { id, status: "CONFIRMED", slotId } }`.
- **Status codes:** 201, 400 (validation), 401, 403 (CSRF), 404 (slot not found), 409 (`SLOT_ALREADY_BOOKED`, closed/inactive/past slot).

### 12. `GET /api/bookings/mine`
- **Auth:** signed in.
- **Request query:** optional filters (upcoming/past/cancelled).
- **Response:** only the current authenticated user's bookings.
- **Status codes:** 200, 401.

### 13. `POST /api/bookings/:id/cancel`
- **Auth:** owner or admin; requires CSRF header.
- **Request body:** admin cancellation requires `{ reason }` (required, validated); student cancellation requires no reason.
- **Behaviour:** student may cancel only their own booking, before the slot starts. Admin may cancel before the slot ends, and must supply a reason. Repeating an authorised cancellation returns the existing cancelled result without a new event.
- **Status codes:** 200, 400 (missing admin reason), 401, 403 (not owner/not admin, or CSRF), 404 (booking not found), 409 (already past the allowed cancellation window).

### 14. `GET /api/admin/resources`
- **Auth:** admin only.
- **Response:** all resources, **including inactive** ones, bounded/paginated.
- **Status codes:** 200, 401, 403 (non-admin).

### 15. `POST /api/admin/resources`
- **Auth:** admin only; requires CSRF header.
- **Request body:** name, category, description, location, capacity (positive), rules.
- **Status codes:** 201, 400 (validation), 401, 403.

### 16. `PATCH /api/admin/resources/:id`
- **Auth:** admin only; requires CSRF header.
- **Request body:** partial update, including `isActive`.
- **Behaviour:** deactivating a resource with a confirmed booking that has not ended is rejected.
- **Status codes:** 200, 400, 401, 403, 404, 409 (outstanding confirmed booking).

### 17. `POST /api/admin/resources/:id/slots/generate`
- **Auth:** admin only; requires CSRF header.
- **Request body:** `{ fromDate, toDate }`, validated within the allowed booking window.
- **Behaviour:** idempotently publishes canonical slots (indexes 0–7) for each date in range. Server constructs indexes itself — no client-supplied times. Existing slots (including closed ones) are left unchanged.
- **Status codes:** 200/201, 400 (invalid/out-of-window dates), 401, 403, 404 (resource not found).

### 18. `PATCH /api/admin/slots/:id`
- **Auth:** admin only; requires CSRF header.
- **Request body:** `{ isOpen }`.
- **Behaviour:** rejects closing a slot that has an outstanding confirmed booking which has not ended.
- **Status codes:** 200, 400, 401, 403, 404, 409 (outstanding confirmed booking).

### 19. `GET /api/admin/bookings`
- **Auth:** admin only.
- **Request query:** filters (by resource, date, status, user), pagination.
- **Response:** bounded, filtered booking list across all users.
- **Status codes:** 200, 401, 403.

### 20. `GET /api/admin/bookings/:id/events`
- **Auth:** admin only.
- **Response:** the full event history (CREATED, CANCELLED, etc.) for one booking.
- **Status codes:** 200, 401, 403, 404.

## Security requirements applying to all state-changing endpoints

- Session-bound synchronizer CSRF token required via a custom header, including on register/login.
- Allowed `Origin` validated on browser mutations.
- Session ID and CSRF token rotate together after login.
