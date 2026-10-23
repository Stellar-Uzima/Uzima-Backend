/**
 * Error budget & alerting thresholds (#1325).
 * On-call runbooks in docs/runbooks reference these severities when
 * responding to sustained or severe service degradation.
 *
 * Service-level monitoring targets (#150):
 * - Measurement window: rolling windows defined per rule via `windowMinutes`.
 * - Endpoint scope: `endpointScope` lists the API workflows the rule applies to.
 *   An empty array means the rule applies to all key API workflows.
 * - Error/latency thresholds: `errorRateThreshold` (fraction of requests) and
 *   `latencyP95ThresholdMs` (p95 latency in milliseconds, optional).
 * - Dashboards and alerts consume this config; targets are reviewed after
 *   each incident and updated here.
 */
export interface ErrorBudgetRule {
  name: string;
  errorRateThreshold: number; // fraction of requests, e.g. 0.02 = 2%
  latencyP95ThresholdMs?: number; // optional p95 latency threshold in ms
  windowMinutes: number; // rolling measurement window
  endpointScope: string[]; // API workflows covered; empty = all key workflows
  severity: 'warning' | 'critical';
}

export const errorBudgetConfig: ErrorBudgetRule[] = [
  {
    name: 'sustained-error-rate',
    errorRateThreshold: 0.02,
    latencyP95ThresholdMs: 1000,
    windowMinutes: 15,
    endpointScope: [],
    severity: 'warning',
  },
  {
    name: 'severe-error-rate',
    errorRateThreshold: 0.1,
    latencyP95ThresholdMs: 3000,
    windowMinutes: 5,
    endpointScope: [],
    severity: 'critical',
  },
];
