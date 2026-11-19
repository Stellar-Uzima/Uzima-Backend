import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A callback received from the email provider.
 *
 * Acceptance and delivery events are stored here so an operator can tell the
 * difference between "our application attempted the email" (delivery log) and
 * "the provider accepted or delivered it" (this table). Events are correlated
 * to the originating notification where the provider echoes our notification
 * or delivery-log identifier.
 *
 * `providerEventId` is unique per provider and is what makes duplicate
 * callbacks idempotent.
 */
@Entity('email_provider_events')
@Index(['provider', 'providerEventId'], { unique: true })
@Index(['notificationId'])
@Index(['providerMessageId'])
@Index(['occurredAt'])
export class EmailProviderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, default: 'email' })
  provider: string;

  /** Provider-assigned event identifier (or a payload hash when absent). */
  @Column({ type: 'varchar', length: 255 })
  providerEventId: string;

  /**
   * Normalized event type: `accepted`, `delivered`, `bounced`, `complained`,
   * `deferred`, `dropped`, or the provider's own value when unrecognized.
   */
  @Column({ type: 'varchar', length: 50 })
  eventType: string;

  /** Provider message identifier, when the callback exposes one. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  /** Originating in-app notification, when correlation data is available. */
  @Column({ type: 'uuid', nullable: true })
  notificationId: string | null;

  /** Originating per-channel delivery log, when correlation data is available. */
  @Column({ type: 'uuid', nullable: true })
  deliveryLogId: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  recipient: string | null;

  /** When the provider says the event happened, when supplied. */
  @Column({ type: 'timestamp with time zone', nullable: true })
  occurredAt: Date | null;

  /** Raw callback payload for audit; never logged. */
  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  receivedAt: Date;
}
