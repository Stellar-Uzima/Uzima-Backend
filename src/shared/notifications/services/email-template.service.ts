import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

// ─────────────────────────────────────────────────────────────────────────────
// Template data interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface WelcomeTemplateData {
  name: string;
  dashboardUrl: string;
  privacyUrl?: string;
  unsubscribeUrl?: string;
}

export interface PasswordResetTemplateData {
  name: string;
  resetLink: string;
  privacyUrl?: string;
  unsubscribeUrl?: string;
}

export interface EmailVerificationTemplateData {
  name: string;
  verificationLink: string;
  privacyUrl?: string;
  unsubscribeUrl?: string;
}

export interface TaskReminderTask {
  icon: string;
  name: string;
  reward: string;
}

export interface TaskReminderTemplateData {
  name: string;
  pendingCount: number;
  dashboardUrl: string;
  tasks?: TaskReminderTask[];
  streakDays?: number;
  preferencesUrl?: string;
  privacyUrl?: string;
  unsubscribeUrl?: string;
}

export type TemplateData =
  | WelcomeTemplateData
  | PasswordResetTemplateData
  | EmailVerificationTemplateData
  | TaskReminderTemplateData;

export type TemplateName =
  | 'welcome'
  | 'password-reset'
  | 'email-verification'
  | 'task-reminder';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: TemplateName;
  data: TemplateData;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmailTemplateService
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issue #664 — Email templating service for transactional emails.
 *
 * Loads HTML templates from disk, performs variable interpolation, and
 * dispatches emails via nodemailer.  All template files live in
 * `src/shared/notifications/templates/`.
 *
 * Variable syntax: `{{variableName}}` for simple substitutions.
 * Conditional blocks: `{{#variable}}...{{/variable}}` (renders when truthy).
 * Array iteration: `{{#array}}...{{name}}...{{/array}}`.
 */
@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templateDir: string;
  private readonly templateCache = new Map<string, string>();
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.templateDir = path.join(__dirname, '..', 'templates');
    this.initTransporter();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Render an HTML template with the supplied data and return the HTML string.
   * Throws if the template file cannot be found.
   */
  renderTemplate(template: TemplateName, data: TemplateData): string {
    const raw = this.loadTemplate(template);
    return this.interpolate(raw, data as Record<string, unknown>);
  }

  /**
   * Send a transactional email using an HTML template.
   * Returns `true` on success, `false` if the transporter is not configured.
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        'Email transporter is not configured. Set MAIL_HOST, MAIL_USER, and MAIL_PASSWORD env vars.',
      );
      return false;
    }

    const html = this.renderTemplate(options.template, options.data);
    const fromName = this.configService.get<string>('MAIL_FROM_NAME', 'Stellar Uzima');
    const fromAddr = this.configService.get<string>('MAIL_USER', 'no-reply@stellaruzima.com');

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddr}>`,
        to: options.to,
        subject: options.subject,
        html,
      });
      this.logger.log(`Email sent: template="${options.template}" to="${options.to}"`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email: template="${options.template}" to="${options.to}"`,
        error,
      );
      return false;
    }
  }

  // ── Convenience methods ─────────────────────────────────────────────────────

  async sendWelcomeEmail(to: string, data: WelcomeTemplateData): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Welcome to Stellar Uzima 🌟',
      template: 'welcome',
      data,
    });
  }

  async sendPasswordResetEmail(to: string, data: PasswordResetTemplateData): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Reset your Stellar Uzima password',
      template: 'password-reset',
      data,
    });
  }

  async sendEmailVerification(to: string, data: EmailVerificationTemplateData): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Verify your Stellar Uzima email address',
      template: 'email-verification',
      data,
    });
  }

  async sendTaskReminder(to: string, data: TaskReminderTemplateData): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `⏰ You have ${data.pendingCount} task${data.pendingCount !== 1 ? 's' : ''} left today`,
      template: 'task-reminder',
      data,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Load a template from disk (or from the in-memory cache).
   */
  private loadTemplate(name: TemplateName): string {
    if (this.templateCache.has(name)) {
      return this.templateCache.get(name)!;
    }

    const filePath = path.join(this.templateDir, `${name}.html`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Email template not found: ${name} (expected at ${filePath})`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    this.templateCache.set(name, content);
    return content;
  }

  /**
   * Interpolate `{{variable}}` placeholders and `{{#block}}...{{/block}}`
   * conditional / loop sections into the template string.
   */
  private interpolate(template: string, data: Record<string, unknown>): string {
    // 1. Handle {{#array}}...{{/array}} loops (iterate over arrays).
    template = template.replace(
      /\{\{#(\w+(?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_, key: string, inner: string) => {
        const value = this.resolve(data, key);
        if (Array.isArray(value) && value.length > 0) {
          return value
            .map((item: Record<string, unknown>) => this.interpolate(inner, { ...data, ...item }))
            .join('');
        }
        // Truthy non-array: render the block once.
        if (value && !Array.isArray(value)) {
          return this.interpolate(inner, data);
        }
        return '';
      },
    );

    // 2. Replace {{variable}} with escaped values.
    template = template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
      const value = this.resolve(data, key);
      return value !== undefined && value !== null ? this.escapeHtml(String(value)) : '';
    });

    return template;
  }

  /**
   * Resolve a dot-notation key path against a data object.
   * e.g. resolve({ user: { name: 'Alice' } }, 'user.name') → 'Alice'
   */
  private resolve(data: Record<string, unknown>, key: string): unknown {
    return key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, data);
  }

  /** Escape HTML special chars to prevent XSS in template data. */
  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /** Initialise the nodemailer transporter from environment config. */
  private initTransporter(): void {
    const host = this.configService.get<string>('MAIL_HOST');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASSWORD');
    const port = parseInt(this.configService.get<string>('MAIL_PORT', '587'), 10);

    if (!host || !user || !pass) {
      this.logger.warn('Email transporter not initialised: MAIL_HOST, MAIL_USER, MAIL_PASSWORD are required.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    this.logger.log(`Email transporter ready (host=${host} port=${port})`);
  }
}