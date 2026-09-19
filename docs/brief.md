# Project Brief — Campus Resource Booking System

Source: `Campus_Resource_Booking_AI_Build_Guide.md` §1.

## 1. Product summary

Students reserve an entire campus resource for a fixed one-hour slot. Examples: a study room, projector, laboratory workstation, or badminton court. Administrators maintain resources, publish or close slots, inspect bookings, and cancel a booking with a reason.

Each individually bookable item is a **separate resource**. Three projectors mean three resource records. A room's capacity describes how many people fit inside; it does **not** allow several independent bookings of the same room in one slot.

## 2. Roles

Two roles exist in version one:

- **STUDENT** — public registration always creates this role.
- **ADMIN** — created only through a controlled seed command, never through a role selector in a public form.

## 3. Required features

| Module | Required behaviour |
|---|---|
| Accounts | Register, log in, log out, restore session on refresh, show the current user |
| Resource catalogue | Search, category/location filters, pagination, active resources only |
| Resource details | Description, location, capacity, rules, date selection |
| Availability | Published slots with available, booked, closed, and past states |
| Booking | Select a slot, enter a purpose, confirm, receive a booking reference |
| My bookings | Upcoming, past, and cancelled views; permitted cancellation |
| Admin resources | Create, edit, deactivate, and generate/close slots |
| Admin bookings | Filter bookings, inspect details, cancel with a reason, view event history |
| Usability | Responsive layout, labels, keyboard access, loading/empty/error states |
| Delivery | Migrations, fictional seed data, tests, logs, health endpoints, deployment instructions |

## 4. Screens

`/login`, `/register`, `/resources`, `/resources/:id`, `/my-bookings`, `/admin`.

- Use tabs inside the admin screen for: resources, slots, bookings.
- Add a not-found page.
- Route guards improve navigation; **backend permission checks provide the actual protection.**

## 5. Explicitly deferred (out of scope for v1)

Email/SMS, payments, file uploads, QR check-in, recurring or multi-slot reservations, approval workflows, waitlists, SSO, and any runtime AI/model feature. These may become extensions after the core works.

Public registration alone does not prove college membership; institutional verification or SSO is needed before treating the app as an official campus system.

## 6. Mandatory policies (verbatim)

The following nine policies are the binding contract for this build and must not be reworded, shortened, or reinterpreted in any later phase:

- Timezone **Asia/Kolkata**, displayed beside every date and time.
- Slots `09:00–10:00` … `16:00–17:00`, indexes **0–7**.
- Students book **today → 13 days ahead**, only if the slot has not started.
- Purpose: trimmed text **10–300 characters**, rendered as text, never HTML.
- Booking confirms immediately — **no pending state**.
- Persisted statuses: **CONFIRMED** and **CANCELLED** only. Upcoming / in-progress / past are computed.
- Student cancels own booking **before start**; admin cancels **before end** and **must give a reason**.
- Repeating an authorised cancellation returns the existing result — **no second event**.
- Closing a slot or deactivating a resource with an unfinished CONFIRMED booking is **rejected**.

## 7. Booking policies — expanded (Guide §1 detail)

- **Timezone:** one campus timezone, **Asia/Kolkata**. Display it beside dates and times.
- **Fixed slots:** 09:00–10:00 through 16:00–17:00, identified by slot indexes **0–7**.
- **Booking window:** students can book published slots from today through **13 days ahead**, provided the slot has not started.
- **Server-derived time:** the backend derives current time and slot times. It never accepts a client claim that a slot is in the future.
- **Canonical reservation unit:** every booking reserves one resource and one slot. No arbitrary start/end times are accepted from the browser.
- **Purpose field:** trimmed text of **10–300 characters**. Rendered as text, not HTML.
- **Immediate confirmation:** booking is confirmed immediately when all rules pass. There is no pending approval state.
- **Cancellation rights:**
  - Students cancel only their own bookings, before the slot starts.
  - Admins may cancel a booking before it ends and **must give a reason**.
- **Idempotent cancellation:** cancellation retains the record. Repeating an authorised cancellation returns the existing cancelled result without another cancellation event.
- **Persisted statuses:** only `CONFIRMED` and `CANCELLED` are persisted. Upcoming, in-progress, and past are calculated from status and slot times.
- **Closure/deactivation guard:** closing a slot or deactivating a resource with a confirmed booking that has not ended is rejected. An admin must cancel affected bookings first.
- **History preservation:** do not remove resources, slots, or accounts in a way that destroys booking history.
