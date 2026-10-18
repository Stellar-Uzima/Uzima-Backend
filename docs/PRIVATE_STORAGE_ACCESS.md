# Private object storage access

Task-proof objects are stored under a user- and task-scoped S3 key and must
remain private at the bucket level. Do not enable public bucket or object access.
The API uses server-side AWS credentials only; those credentials must never be
added to API DTOs or client configuration.

## Task-proof flow

1. An authenticated user requests `POST /tasks/completions/:taskId/proof-upload-url`.
   The response contains a presigned PUT URL that expires after 15 minutes.
2. The client uploads the image to that URL and submits the same URL as
   `proofUrl` in `POST /tasks/completions`.
3. The API checks that the signed URL's key belongs to the requesting user and
   task, then stores only the internal object key. Completion-list responses
   return `proofAvailable`, not that key or the signed upload URL.
4. To view a proof, the owner calls
   `GET /tasks/completions/:completionId/proof-download-url`. The API checks
   ownership and returns a download URL that expires after five minutes.
   Verification workers read the internal key directly and do not expose it.

Other workflows that deliver a download link, such as data exports, must use
short-lived presigned URLs appropriate to the workflow. Never return raw
provider keys or credentials in public API responses.
