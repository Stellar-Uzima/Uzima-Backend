import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NotificationTemplateStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
}

/**
 * An immutable revision of a user-facing notification template.
 * Each revision has a monotonically increasing version per template key and
 * an effective date that determines when it becomes the canonical version.
 */
@Entity('notification_template_versions')
@Index('notification_template_versions_key_version', ['templateKey', 'version'], { unique: true })
export class NotificationTemplateVersion {
  @PrimaryGeneratedColumn('.uuid')
  id: string;

  /** Stable identifier for the logical template (e.g. 'welcome-email'). */
  @Column({ type: 'varchar', length: 128 })
  @Index()
  templateKey: string;

  /** Monotonically increasing revision number within a templateKey. */
  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar', length: 255 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  /** Optional structured defaults for the template (JSON object). */
  @Column({ type: 'jsonb', nullable: true })
  defaults: Record<string, unknown> | null;

  /** Date at which this revision becomes effective. */
  @Column({ type: 'timestamp' })
  @Index()
  effectiveAt: Date;

  @Column({ type: 'enum', enum: NotificationTemplateStatus, default: NotificationTemplateStatus.Draft })
  status: NotificationTemplateStatus;

  /** Free-form note describing the change, for review traceability. */
  @Column({ type: 'text', nullable: true })
  changeNote: string | null;

  /** Identity of the author who created this revision. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  authorId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
