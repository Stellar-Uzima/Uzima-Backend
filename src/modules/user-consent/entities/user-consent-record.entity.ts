import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * The categories of consent the platform can capture. Kept independent from
 * the delivery channels defined in `UserPreferences.notifications` so new
 * categories can be added without schema changes to preferences.
 */
export enum ConsentType {
  MARKETING_EMAIL = 'marketing_email',
  MARKETING_PUSH = 'marketing_push',
  MARKETING_SMS = 'marketing_sms',
  ANALYTICS = 'analytics',
  DATA_PROCESSING = 'data_processing',
  THIRD_PARTY_SHARING = 'third_party_sharing',
}

/**
 * Lifecycle of a consent record:
 *  - `granted`  — active consent (or first-time capture).
 *  - `denied`   — the user explicitly refused at capture time.
 *  - `withdrawn` — previously granted, later revoked by the user.
 */
export enum ConsentStatus {
  GRANTED = 'granted',
  DENIED = 'denied',
  WITHDRAWN = 'withdrawn',
}

/**
 * Where the consent was captured, for audit purposes.
 */
export enum ConsentSource {
  ONBOARDING = 'onboarding',
  SETTINGS = 'settings',
  API = 'api',
  LEGAL = 'legal',
}

/**
 * Audit-grade consent record. One row per `(userId, consentType)` — the
 * latest state is derived by re-writing the single logical record (grant
 * clears `withdrawnAt`, withdrawal records the `withdrawnAt`/`reason`).
 * Every write records the source and the version of the policy in effect so
 * support can reconstruct what the user agreed to and when.
 */
@Entity('user_consent_records')
@Index(['userId', 'consentType'])
@Index(['userId', 'status'])
export class UserConsentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ConsentType })
  consentType: ConsentType;

  @Column({ type: 'enum', enum: ConsentStatus })
  status: ConsentStatus;

  @Column({ type: 'enum', enum: ConsentSource, default: ConsentSource.API })
  source: ConsentSource;

  /** Version of the consent policy text the user agreed to. */
  @Column({ type: 'varchar', length: 20, default: '1.0' })
  version: string;

  /** Free-text reason, mainly populated when consent is withdrawn. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  grantedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  withdrawnAt: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}