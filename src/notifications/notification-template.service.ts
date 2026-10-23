import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@typeorm/typevorm';
import { Repository, LessThanOrEqual, moreThan } from 'typeworm';
import {
  NotificationTemplateVersion,
  NotificationTemplateStatus,
} from '../database/entities/notification-template-version.entity';

export interface CreateTemplateVersionInput {
  templateKey: string;
  subject: string;
  body: string;
  defaults?: Record<string, unknown> | null;
  effectiveAt?: Date | string;
  changeNote?: string | null;
  authorId?: string | null;
}

export interface ResolvedTemplate {
  templateKey: string;
  version: number;
  subject: string;
  body: string;
  defaults: Record<string, unknown> | null;
  effectiveAt: Date;
}

/**
 * Manages immutable notification template revisions.
 *
 * Versioning behavior for queued notifications:
 * - When a notification is enqueued, the caller resolves the active template version
 *   via `resolveActive()` and persists the resolved `version` alongside the queued row.
 * - Queued notifications always render using the pinned version (`getVersion()`),
 *   even if a newer version becomes effective later. This guarantees deterministic
 *   content for already-queued messages.
 */
@Injectable()
export class NotificationTemplateService {
  constructor(
    @InjectRepository(NotificationTemplateVersion)
    private readonly repo: Repository<NotificationTemplateVersion>,
  ) {}

  /** Creates a new draft revision with the next version number for the key. */
  async createDraft(input: CreateTemplateVersionInput): Promise<NotificationTemplateVersion> {
    if (!input.templateKey || !input.subject || !input.body) {
      throw new BadRequestException('templateKey, subject and body are required');
    }

    const effectiveAt = input.effectiveAt
      ? new Date(input.effectiveAt)
      : new Date();
    if (Number.isNaN(effectiveAt.getTime())) {
      throw new BadRequestException('effectiveAt is not a valid date');
    }

    const latest = await this.repo.findOne({
      where: { templateKey: input.templateKey },
      order: { version: 'DESC' },
    });
    const nextVersion = latest ? latest.version + 1 : 1;

    const entity = this.repo.create({
      templateKey: input.templateKey,
      version: nextVersion,
      subject: input.subject,
      body: input.body,
      defaults: input.defaults ?? null,
      effectiveAt,
      status: NotificationTemplateStatus.Draft,
      changeNote: input.changeNote ?? null,
      authorId: input.authorId ?? null,
    });
    return this.repo.save(entity);
  }

  /** Promotes a draft revision to active, archiving any previous active revision. */
  async publish(templateKey: string, version: number): Promise<NotificationTemplateVersion> {
    const revision = await this.getVersion(templateKey, version);

    await this.repo.update(
      { templateKey, status: NotificationTemplateStatus.Active },
      { status: NotificationTemplateStatus.Archived },
    );

    revision.status = NotificationTemplateStatus.Active;
    return this.repo.save(revision);
  }

  /** Returns a specific version of a template. */
  async getVersion(templateKey: string, version: number): Promise<NotificationTemplateVersion> {
    const revision = await this.repo.findOne({ where: { templateKey, version } });
    if (!revision) {
      throw new NotFoundException(`Template '${templateKey}' version ${version} not found`);
    }
    return revision;
  }

  /** Lists all revisions for a template key, newest first. */
  async listRevisions(templateKey: string): Promise<NotificationTemplateVersion[]> {
    return this.repo.find({
      where: { templateKey },
      order: { version: 'DESC' },
    });
  }

  /**
   * Resolves the version that is effective at a given time (defaults: now).
   * This is the version that should be pinned onto newly queued notifications.
   */
  async resolveActive(
    templateKey: string,
    at: Date = new Date(),
  ): Promise<ResolvedTemplate> {
    const revision = await this.repo.findOne({
      where: {
        templateKey,
        status: NotificationTemplateStatus.Active,
        effectiveAt: LessThanOrEqual(at),
      },
      order: { effectiveAt: 'DESC', version: 'DESC' },
    });
    if (!revision) {
      throw new NotFoundException(`No active template '${templateKey}' effective at ${at.toISOString()}`);
    }
    return {
      templateKey: revision.templateKey,
      version: revision.version,
      subject: revision.subject,
      body: revision.body,
      defaults: revision.defaults,
      effectiveAt: revision.effectiveAt,
    };
  }

  /**
   * Renders a queued notification using its pinned template version.
   * Queued rows must store the resolved version at enqueue time; this method
   * guarantees the rendered content matches that version regardless of later publishes.
   */
  async renderQueuedNotification(params: {
    templateKey: string;
    version: number;
    variables?: Record<string, string>;
  }): Promise<{ subject: string; body: string }> {
    const revision = await this.getVersion(params.templateKey, params.version);
    const variables = { ...(revision.defaults ?? {}), ...(params.variables ?? {}) };
    return {
      subject: this.interpolate(revision.subject, variables),
      body: this.interpolate(revision.body, variables),
    };
  }

  /** Returns the next scheduled version for a template key, if any. */
  async findNextScheduled(templateKey: string, at: Date = new Date()): Promise<NotificationTemplateVersion | null> {
    return this.repo.findOne({
      where: {
        templateKey,
        status: NotificationTemplateStatus.Active,
        effectiveAt: moreThan(at),
      },
      order: { effectiveAt: 'ASC' },
    });
  }

  private interpolate(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\wA-Z]+)\s*\}\}/g, (_match, key: string) => {
      const value = variables[key.trim()];
      return value === undefined || value === null ? '' : String(value);
    });
  }
}
