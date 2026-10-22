
export type RetentionAction = 'delete' | 'anonymize';

export interface RetentionPolicy {
  dataClass: string;
  ageThresholdDaysEnv: string;
  defaultAgeThresholdDays: number;
  action: RetentionAction;
}

export const RETENTION_POLICIES: readonly RetentionPolicy[] = [
  {
    dataClass: 'user_status_logs',
    ageThresholdDaysEnv: 'STATUS_LOG_RETENTION_DAYS',
    defaultAgeThresholdDays: 90,
    action: 'delete',
  },
  {
    dataClass: 'auth_event_logs',
    ageThresholdDaysEnv: 'AUTH_EVENT_RETENTION_DAYS',
    defaultAgeThresholdDays: 180,
    action: 'delete',
  },
] as const;
