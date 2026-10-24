# Notification digests

Selected notifications are grouped into a scheduled digest per user.

## Preferences
Each user's saved preferences decide the digest:
- `digest_frequency`: `off` (default), `daily` or `weekly`
- `digest_categories`: which notification categories are included

## Schedule and windows
- Daily digests run at 07:00 UTC and cover the previous full UTC day.
- Weekly digests run Mondays at 07:00 UTC and cover the previous Monday-Sunday week.

## Idempotency
Every digest has a unique key `(user_id, frequency, window_start)`. A re-run or a second app instance finds the existing digest and does nothing. A notification belongs to at most one digest (`notifications.digest_id`).

## Delivery records (`notification_digests`)
| Column | Meaning |
| --- | --- |
| `status` | `pending`, `sent`, `failed` or `skipped` (nothing to send) |
| `attempts` | Delivery attempts for this window (max 3) |
| `last_error` | Error from the last failed attempt (truncated) |
| `sent_at`, `item_count` | When it was sent and how many notifications it held |

Failed digests, and ones stuck in `pending` for over 15 minutes, are retried on the next run until attempts run out.

## Limitation
Email delivery is at-least-once: if the process dies after the provider accepted the message but before the row is marked `sent`, a retry can send it again.