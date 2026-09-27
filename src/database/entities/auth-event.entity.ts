import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Authentication and account-security events worth recording for compliance.
 *
 * Kept deliberately separate from the general `audit_logs` table: these rows
 * form their own append-only security trail with their own retention window,
 * and are queryable without granting access to the full audit API.
 */
export enum AuthEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
}

/** Whether the attempted action succeeded. */
export enum AuthEventOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  DENIED = 'DENIED',
}

/**
 * Append-only record of a single authentication or account-security event.
 *
 * Written for successes *and* failures, including failures where no user could
 * be identified (the `userId` is then null and the supplied identifier is kept
 * in `metadata.identifier` so credential-stuffing patterns remain visible).
 */
@Entity('auth_event_logs')
@Index(['userId', 'createdAt'])
@Index(['eventType', 'createdAt'])
@Index(['outcome', 'createdAt'])
@Index(['createdAt'])
export class AuthEventLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The account the event relates to. Null for unidentified attempts. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Email captured at the time of the event, for operator-facing searches. */
  @Column({ type: 'varchar', length: 320, nullable: true })
  userEmail: string | null;

  @Column({ type: 'enum', enum: AuthEventType, name: 'event_type' })
  eventType: AuthEventType;

  @Column({ type: 'enum', enum: AuthEventOutcome, default: AuthEventOutcome.SUCCESS })
  outcome: AuthEventOutcome;

  /**
   * Why the event failed, e.g. `invalid_credentials`, `account_locked`,
   * `token_revoked`. Null on success.
   */
  @Column({ type: 'varchar', length: 120, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  requestId: string | null;

  /**
   * Free-form structured context. Never store secrets here — passwords, tokens
   * and TOTP codes are stripped by the writing service.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at', precision: 6 })
  createdAt: Date;

  /**
   * When this row becomes eligible for retention purging. Computed on write
   * from {@link AuthEventRetentionDays} so the purge query can use an index.
   */
  @Column({
    type: 'timestamp with time zone',
    name: 'retention_expires_at',
    nullable: true,
    precision: 6,
  })
  retentionExpiresAt: Date | null;
}
