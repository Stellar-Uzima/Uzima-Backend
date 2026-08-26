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
