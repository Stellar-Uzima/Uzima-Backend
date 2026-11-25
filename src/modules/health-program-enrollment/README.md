# Health program enrollment

Enrollment starts as `pending`. Health program staff (`ADMIN` or `HEALER`)
can mark a user `eligible` or `ineligible`; users cannot grant themselves
eligibility. Users can enroll from `eligible` and withdraw from `enrolled`.
Staff may move `eligible` to `ineligible`, and must re-evaluate a withdrawn
user by moving them back to `eligible` before they can enroll again.

Valid transitions:

| Current state | Next state |
| --- | --- |
| `pending` | `eligible`, `ineligible` |
| `ineligible` | `eligible` |
| `eligible` | `ineligible`, `enrolled` |
| `enrolled` | `ineligible` (staff), `withdrawn` |
| `withdrawn` | `eligible` |

Authenticated users can read and update their own enrollment at
`/health-program-enrollments/me` and read their own history at
`/health-program-enrollments/me/history`. `ADMIN` and `HEALER` callers can
read, update, and view history for any user using
`/health-program-enrollments/:userId`.

Each successful transition updates the current state and appends its actor,
previous state, next state, optional reason, and timestamp to the history
within one database transaction.
