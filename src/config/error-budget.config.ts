/**
 * Error budget & alerting thresholds (#1325).
 * On-call runbooks in docs/runbooks reference these severities when
 * responding to sustained or severe service degradation.
 */
export interface ErrorBudgetRule {
  name: string;
  errorRateThreshold: number; // fraction of requests, e.g. 0.02 = 2%
  windowMinutes: number;
  severity: 'warning' | 'critical';
}

export const errorBudgetConfig: ErrorBudgetRule[] = [
  {
    name: 'sustained-error-rate',
    errorRateThreshold: 0.02,
    windowMinutes: 15,
    severity: 'warning',
  },
  {
    name: 'severe-error-rate',
    errorRateThreshold: 0.1,
    windowMinutes: 5,
    severity: 'critical',
  },
];
