/**
 * Error budget & alerting thresholds (#1325).
 * On-call runbooks in docs/runbooks reference these severities when
 * responding to sustained or severe service degradation.
 *
 * Service-level monitoring targets (#150):
 * - Measurement window: rolling windows as defined per rule (windowMinutes).
 * - Endpoint scope: all public API workflows served by the API gateway
 * (requests matched by the `api` ingress route, excluding health checks).
 * - Error threshold: fraction of requests returning 5xx responses
 * (client 4xx responses are not counted against the budget).
 * - Latency threshold: p95 request latency per workflow must stay under
 * `latencyP95ThresholdMs` for the rule's window.
 * - Dashboards and alerts consume this file as the source of truth and
 * are reviewed after every incident postmortem.
 */
export interface ErrorBudgetRule {
  name: string;
  errorRateThreshold: number; // fraction of requests, e.g. 0.02 = 2%
  windowMinutes: number;
  severity: 'warning' | 'critical';
  latencyP95ThresholdMs: number;
  endpointScope: string;
}

export const errorBudgetConfig: ErrorBudgetRule[] = [
  {
    name: 'sustained-error-rate',
    errorRateThreshold: 0.02,
    windowMinutes: 15,
    severity: 'warning',
    latencyP95ThresholdMs: 800,
    endpointScope: 'api/*',
  },
  {
    name: 'severe-error-rate',
    errorRateThreshold: 0.1,
    windowMinutes: 5,
    severity: 'critical',
    latencyP95ThresholdMs: 2000,
    endpointScope: 'api/*',
  },
];
