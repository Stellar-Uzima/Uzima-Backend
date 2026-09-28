Implement Graceful Shutdown Handling
Repo Avatar
Stellar-Uzima/Uzima-Backend
Description
Ensure the application shuts down cleanly without dropping in-flight work or causing inconsistent state.

Acceptance Criteria
Active HTTP and queue work are drained gracefully before exit.
Shutdown events are logged with clear status markers.
Timed shutdowns fail safely without corrupting persistent state.

Add Database Query Logging for Troubleshooting
Repo Avatar
Stellar-Uzima/Uzima-Backend
Description
Capture slow or repeated queries to improve application diagnosis and performance tuning.

Acceptance Criteria
Query logs include execution time and the related service or endpoint.
Slow queries are flagged according to configured thresholds.
Logging can be disabled or reduced in production without breaking diagnostics.
Logging can be disabled or reduced in production without breaking diagnostics.