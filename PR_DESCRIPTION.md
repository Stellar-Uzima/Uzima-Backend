# Pull Request Description

## Overview
This pull request addresses issues #160, #171, and #173 by implementing vital enhancements for system reliability, collaboration capabilities, and scalable storage abstraction.

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

## Checks
* Ensured GitHub Actions and CI workflow execution readiness.
* Ran automated linting passes to conform with stylistic syntax targets successfully.
* Maintained backward-compatibility API routing standards without breaking established implementations.
