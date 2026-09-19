# Acceptance Checks — Campus Resource Booking System

Source: `Campus_Resource_Booking_AI_Build_Guide.md` §10. 23 scenarios, verbatim from the Guide's table.

| # | Scenario | Expected result |
|---|---|---|
| 1 | Register with a role field set to ADMIN | Rejected input or enforced STUDENT role; never an admin account |
| 2 | Wrong password | Generic login error; no session established |
| 3 | Refresh after login | Current user restored from session |
| 4 | Log out then call a protected endpoint | 401 |
| 5 | Student calls an admin API directly | 403 |
| 6 | Authenticated mutation without correct CSRF | 403 |
| 7 | Book an open future slot | 201; booking and event stored |
| 8 | Two users submit the same slot concurrently | Exactly one 201 and one 409; one confirmed row |
| 9 | Book a past, closed or inactive resource slot | Rejected without a booking |
| 10 | Student cancels another user's booking | 403; original booking unchanged |
| 11 | Cancel before start then rebook | Cancellation retained; new confirmation succeeds |
| 12 | Repeat an authorised cancellation | Same cancelled result; no duplicate event |
| 13 | Student cancels after start | Rejected under the policy |
| 14 | Admin cancellation without a reason | Validation error |
| 15 | Close/deactivate while an outstanding booking exists | Conflict; no silent cancellation |
| 16 | Generate slots twice | No duplicate slots; previously closed slots remain closed |
| 17 | Select a date near midnight from another browser timezone | Correct campus date and displayed IST times |
| 18 | Restart API | Bookings remain; unexpired persisted sessions can be restored |
| 19 | Restart database with its volume intact | Records remain |
| 20 | Database unavailable | Safe error/readiness 503; no stack or credential disclosure |
| 21 | Direct refresh of /my-bookings on deployed site | Frontend route loads and restores identity |
| 22 | Unknown /api route | JSON 404, not frontend HTML |
| 23 | Narrow screen and keyboard-only navigation | Core form, slots and cancellation remain usable |

## Verification method (from the Guide)

Automate the concurrency and permission checks (#8, #5, #6, #10) against real PostgreSQL. Mock-only tests cannot demonstrate database constraints or transaction behaviour. A live two-browser demo illustrates the conflict; simultaneous integration requests provide stronger evidence of race protection.
