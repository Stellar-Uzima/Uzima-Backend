# Notification Template Versioning

This document describes how user-facing notification templates are versioned, how
revisions become effective, and how already-queued notifications behave when a
template changes.

## Model

Every revision of a template is stored as an immutable row in
`notification_template_versions`. A revision is identified by the pair
(`templateKey`, `version`), where:

- `templateKey` is the stable logical name of the template (e.g. `welcome-email`).
- `version` is a monotonically increasing integer starting at 1, scoped to the
  template key. The pair is enforced unique by a database constraint.

Each revision also carries:
- `subject`, `body`, and optional `defaults`.
- `effectiveAt` -- the timestamp at which this revision becomes the canonical
  version for newly queued notifications.
- `status` -- one of `draft`, `active`, or `archived`.
- `changeNote` and `authorId` -- review traceability metadata.

## Lifecycle

1. **Draft** -- a new revision is created via `POST /notification-templates/:key/versions`.
   The service assigns the next version number and stores the revision with
   status `draft`. Drafts are never resolved for new notifications.
2. **Publish** -- `POST /notification-templates/:key/versions/:version/publish`
   sets the revision to `active` and archives any previously active revision for
   the same key.
3. **Effective** -- a published revision is only resolved for notifications
   queued at or after its `effectiveAt` timestamp. This allows reviewers to
   schedule content changes in advance.

## Resolution for new notifications

When a notification is enqueued, the caller invokes:

```ts
await templateService.resolveActive(templateKey);
```

This returns the highest-version active revision whose `effectiveAt` is on or
before the current time. The resolved `version` MUST be persisted on the queued
notification row alongside the `templateKey`.

The controller exposes this via `GET /notification-templates/:key/versions/latest`.

## Behavior for existing queued notifications

Already-queued notifications are **version-pinned**. When a notification is
enqueued, the resolved `version` is stored on the queued row. Rendering is done
through:

```ts
await templateService.renderQueuedNotification({ templateKey, version, variables });
```

which loads the exact revision by `(templateKey, version)`. Consequences:

- `*No retroactive changes.**` Publishing a new version or archiving an old one
  does not alter the content of notifications already in the queue.
- **Deterministic rendering.** Replaying or retrying a queued notification
  produces identical output as long as the pinned version row exists.
- **Immutability.** Revision rows are never edited in place; content changes always
  create a new version.

## Operational notes

- Revision rows must not be deleted while queued notifications may still reference
  them. Archive instead of deleting.
- To inspect the history of a template, use `GET /notification-templates/:key/versions`.
- To inspect a specific revision, use `GET /notification-templates/:key/versions/:version`.
