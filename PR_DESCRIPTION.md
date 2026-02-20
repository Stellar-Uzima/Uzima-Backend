# Pull Request Description

## Overview
This pull request addresses issues #160, #171, #173, and #177 by implementing vital enhancements for system reliability, collaboration capabilities, scalable storage abstraction, and multi-channel notifications.

Closes #160
Closes #171
Closes #173
Closes #177

### Fixes and Implementations:

1. **Request Deduplication with Idempotency Keys (#171)**
    * Implemented `IdempotencyKey` model with a MongoDB TTL index ensuring automated 24-hour expiration.
    * Developed an `idempotencyMiddleware` interceptor for POST, PUT, and PATCH endpoints which detects duplicate requests globally.
    * Enforces duplicate request resolution by returning cached responses, preventing redundant mutation cycles.
    * Developed a redundant fail-safe cron task `startIdempotencyCleanupJob` to proactively sweep expired keys, providing a fallback for the database TTL index.

2. **Real-Time Collaboration with Operational Transform (#160)**
    * Engineered a real-time collaborative editing layer under `src/services/collabService.js` utilizing the robust `ot` Operational Transformation module.
    * Integrated WebSocket endpoint mechanisms in `src/wsServer.js` mapping connections to independent conversational structures per `record_id`.
    * Designed dynamic text operation transformation strategies avoiding concurrent data state conflicts.
    * Implemented visual cursor data broadcasting allowing multiple active editors to synchronize visual changes perfectly.
    * Developed HTTP `GET /api/records/:id/collaborators` endpoint retrieving active concurrent editor identities reliably.

3. **File Storage Abstraction Layer (Local/S3/Azure) (#173)**
    * Created `FileMetadata` model schema integrating unified tracking values over uploads with metrics handling `uploadedBy`, `mimeType`, and `storageType`.
    * Implemented adapter structure enforcing a consistent `StorageService` interface allowing cross-platform uploads (`LocalStorage`, `S3Storage`, and `AzureStorage`).
    * Configured environment variable adaptability via `StorageFactory` abstracting backends correctly depending on configuration values.
    * Ensured consistent presigned URL generation routines for securely gating file accesses and reducing unauthenticated exposure patterns.

4. **Notification Center with Multi-Channel Support (#177)**
    * Created an updated `Notification` model schema enabling broad type coverage mapped strictly per user by `userId`.
    * Designed multi-channel capabilities under `src/services/notificationService.js` handling email, SMS (via Twilio), in-app push (via Socket.io), alongside fallback mechanisms to adhere directly with individual `User` preferences without redundancy.
    * Protected outbound volume enforcing global spam limits preventing over 10 dispatches an hour seamlessly using rate limitation.
    * Appended fully compliant `/api/notifications/` endpoints capable of marking individual items as read explicitly.
    * Linked dynamic `PUT /api/notifications/preferences` directly toggling cross-channel opt-outs reliably.

## Checks
* Ensured GitHub Actions and CI workflow execution readiness.
* Ran automated linting passes to conform with stylistic syntax targets successfully.
* Maintained backward-compatibility API routing standards without breaking established implementations.
