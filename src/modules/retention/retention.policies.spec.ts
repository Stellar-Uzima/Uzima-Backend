import { RETENTION_POLICIES, RetentionAction } from './retention.policies';

describe('RETENTION_POLICIES', () => {
  it('defines a policy for user status logs', () => {
    expect(RETENTION_POLICIES).toContainEqual({
      dataClass: 'user_status_logs',
      ageThresholdDaysEnv: 'STATUS_LOG_RETENTION_DAYS',
      defaultAgeThresholdDays: 90,
      action: 'delete',
    });
  });

  it('defines a policy for authentication event logs', () => {
    expect(RETENTION_POLICIES).toContainEqual({
      dataClass: 'auth_event_logs',
      ageThresholdDaysEnv: 'AUTH_EVENT_RETENTION_DAYS',
      defaultAgeThresholdDays: 180,
      action: 'delete',
    });
  });

  it('uses positive default retention periods', () => {
    for (const policy of RETENTION_POLICIES) {
      expect(policy.defaultAgeThresholdDays).toBeGreaterThan(0);
    }
  });

  it('uses unique data classes and environment variable names', () => {
    const dataClasses = RETENTION_POLICIES.map((policy) => policy.dataClass);
    const envNames = RETENTION_POLICIES.map((policy) => policy.ageThresholdDaysEnv);

    expect(new Set(dataClasses).size).toBe(dataClasses.length);
    expect(new Set(envNames).size).toBe(envNames.length);
  });

  it('uses supported retention actions', () => {
    const supportedActions: RetentionAction[] = ['delete', 'anonymize'];

    for (const policy of RETENTION_POLICIES) {
      expect(supportedActions).toContain(policy.action);
    }
  });
});
