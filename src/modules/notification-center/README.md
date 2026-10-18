# Notification architecture

`NotificationCenterModule` is the application's single notification system.
It owns the `/notifications` API, in-app inbox, channel routing, preferences,
delivery logs, and retry processing. Email, push, and SMS requests all enter
through `NotificationCenterService.sendNotification()` and are dispatched by
`ChannelRouterService` according to the user's preferences.

`src/modules/notifications/notifications.module.ts` is the public module facade
registered by `AppModule`. The files under `src/notifications/` retain historical
import paths only; their module and service re-export the canonical facade and
provider so older feature modules use the same Nest injection token and runtime
pipeline. `PushModule` is an infrastructure adapter imported only by the center;
it is not a separate application-level notification system.

## Provider resilience and metrics

The channel router tracks consecutive provider failures independently for
email, push, and SMS. `NOTIFICATION_CIRCUIT_FAILURE_THRESHOLD` (default `5`)
opens a channel circuit; `NOTIFICATION_CIRCUIT_RESET_MS` (default `30000`)
sets the cooldown. Once the cooldown expires, one delivery at a time is allowed
as a recovery probe. Other sends continue through the existing retry queue.
The in-app notification is persisted before channel dispatch, so provider
outages do not fail the originating API request.

Prometheus exposes `notification_deliveries_total{channel,outcome}` with
outcomes `success`, `failure`, and `circuit_open`,
`notification_delivery_retries_total{channel}`, and
`notification_provider_circuit_state{channel}` (`1` means open). Labels use
only fixed channel names and outcomes; user identifiers and message data are
never metric labels. A five-minute failure ratio can be graphed with:

```promql
sum by (channel) (rate(notification_deliveries_total{outcome="failure"}[5m]))
/
clamp_min(sum by (channel) (rate(notification_deliveries_total[5m])), 0.001)
```
