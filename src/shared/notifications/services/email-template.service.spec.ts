import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailTemplateService, TemplateName } from './email-template.service';
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

/** Minimal ConfigService stub — returns no mail env vars so transporter stays null. */
const mockConfigService = {
  get: jest.fn((key: string, fallback?: string) => fallback ?? undefined),
};

async function buildService(): Promise<EmailTemplateService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      EmailTemplateService,
      { provide: ConfigService, useValue: mockConfigService },
    ],
  }).compile();
  return module.get<EmailTemplateService>(EmailTemplateService);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    service = await buildService();
    jest.clearAllMocks();
  });

  // ── Service setup ───────────────────────────────────────────────────────────

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Template files exist ────────────────────────────────────────────────────

  describe('template files', () => {
    const templates: TemplateName[] = [
      'welcome',
      'password-reset',
      'email-verification',
      'task-reminder',
    ];

    it.each(templates)('template file "%s.html" should exist on disk', (name) => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.html`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it.each(templates)('template file "%s.html" should be valid HTML', (name) => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.html`);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
    });

    it.each(templates)('template file "%s.html" should have a viewport meta tag (mobile-responsive)', (name) => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.html`);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('viewport');
      expect(content).toContain('width=device-width');
    });

    it.each(templates)('template file "%s.html" should have a @media query for mobile', (name) => {
      const filePath = path.join(TEMPLATES_DIR, `${name}.html`);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('@media');
      expect(content).toContain('max-width');
    });
  });

  // ── renderTemplate — welcome ────────────────────────────────────────────────

  describe('renderTemplate("welcome")', () => {
    const data = {
      name: 'Alice',
      dashboardUrl: 'https://app.stellaruzima.com/dashboard',
      privacyUrl: 'https://stellaruzima.com/privacy',
      unsubscribeUrl: 'https://stellaruzima.com/unsubscribe',
    };

    it('should return an HTML string', () => {
      const html = service.renderTemplate('welcome', data);
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('should contain the user name', () => {
      const html = service.renderTemplate('welcome', data);
      expect(html).toContain('Alice');
    });

    it('should contain the dashboard URL', () => {
      const html = service.renderTemplate('welcome', data);
      expect(html).toContain('https://app.stellaruzima.com/dashboard');
    });

    it('should not contain un-replaced {{placeholders}}', () => {
      const html = service.renderTemplate('welcome', data);
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should escape HTML special characters in user data', () => {
      const html = service.renderTemplate('welcome', {
        ...data,
        name: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  // ── renderTemplate — password-reset ────────────────────────────────────────

  describe('renderTemplate("password-reset")', () => {
    const data = {
      name: 'Bob',
      resetLink: 'https://app.stellaruzima.com/reset?token=abc123',
      privacyUrl: 'https://stellaruzima.com/privacy',
      unsubscribeUrl: 'https://stellaruzima.com/unsubscribe',
    };

    it('should contain the user name', () => {
      const html = service.renderTemplate('password-reset', data);
      expect(html).toContain('Bob');
    });

    it('should contain the reset link', () => {
      const html = service.renderTemplate('password-reset', data);
      expect(html).toContain('https://app.stellaruzima.com/reset?token=abc123');
    });

    it('should not contain un-replaced {{placeholders}}', () => {
      const html = service.renderTemplate('password-reset', data);
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should mention the 1-hour expiry', () => {
      const html = service.renderTemplate('password-reset', data);
      expect(html).toContain('1 hour');
    });
  });

  // ── renderTemplate — email-verification ────────────────────────────────────

  describe('renderTemplate("email-verification")', () => {
    const data = {
      name: 'Carol',
      verificationLink: 'https://app.stellaruzima.com/verify-email?token=xyz789',
      privacyUrl: 'https://stellaruzima.com/privacy',
      unsubscribeUrl: 'https://stellaruzima.com/unsubscribe',
    };

    it('should contain the user name', () => {
      const html = service.renderTemplate('email-verification', data);
      expect(html).toContain('Carol');
    });

    it('should contain the verification link', () => {
      const html = service.renderTemplate('email-verification', data);
      expect(html).toContain('https://app.stellaruzima.com/verify-email?token=xyz789');
    });

    it('should not contain un-replaced {{placeholders}}', () => {
      const html = service.renderTemplate('email-verification', data);
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should mention the 24-hour expiry', () => {
      const html = service.renderTemplate('email-verification', data);
      expect(html).toContain('24 hour');
    });
  });

  // ── renderTemplate — task-reminder ─────────────────────────────────────────

  describe('renderTemplate("task-reminder")', () => {
    const data = {
      name: 'Dave',
      pendingCount: 3,
      dashboardUrl: 'https://app.stellaruzima.com/tasks',
      streakDays: 7,
      tasks: [
        { icon: '🏃', name: 'Morning run', reward: '0.5' },
        { icon: '💧', name: 'Drink 2L of water', reward: '0.3' },
      ],
      preferencesUrl: 'https://app.stellaruzima.com/preferences',
      privacyUrl: 'https://stellaruzima.com/privacy',
      unsubscribeUrl: 'https://stellaruzima.com/unsubscribe',
    };

    it('should contain the user name', () => {
      const html = service.renderTemplate('task-reminder', data);
      expect(html).toContain('Dave');
    });

    it('should contain the pending task count', () => {
      const html = service.renderTemplate('task-reminder', data);
      expect(html).toContain('3');
    });

    it('should contain the streak days when provided', () => {
      const html = service.renderTemplate('task-reminder', data);
      expect(html).toContain('7');
    });

    it('should contain task names when tasks array is provided', () => {
      const html = service.renderTemplate('task-reminder', data);
      expect(html).toContain('Morning run');
      expect(html).toContain('Drink 2L of water');
    });

    it('should not contain un-replaced {{placeholders}}', () => {
      const html = service.renderTemplate('task-reminder', data);
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('should render without tasks array (optional)', () => {
      const dataNoTasks = { ...data, tasks: undefined };
      expect(() => service.renderTemplate('task-reminder', dataNoTasks)).not.toThrow();
    });

    it('should render without streakDays (optional)', () => {
      const dataNoStreak = { ...data, streakDays: undefined };
      const html = service.renderTemplate('task-reminder', dataNoStreak);
      expect(html).not.toContain('Day streak');
    });
  });

  // ── Unknown template ────────────────────────────────────────────────────────

  describe('renderTemplate — unknown template', () => {
    it('should throw an error for a non-existent template', () => {
      expect(() =>
        service.renderTemplate('nonexistent' as TemplateName, {} as any),
      ).toThrow(/template not found/i);
    });
  });

  // ── Template caching ────────────────────────────────────────────────────────

  describe('template caching', () => {
    it('should return the same result on repeated calls (cache hit)', () => {
      const data = {
        name: 'Eve',
        dashboardUrl: 'https://example.com',
      };
      const first = service.renderTemplate('welcome', data);
      const second = service.renderTemplate('welcome', data);
      expect(first).toBe(second);
    });
  });

  // ── sendEmail — no transporter ──────────────────────────────────────────────

  describe('sendEmail', () => {
    it('should return false when the transporter is not configured', async () => {
      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        template: 'welcome',
        data: { name: 'Test', dashboardUrl: 'https://example.com' },
      });
      expect(result).toBe(false);
    });
  });

  // ── Convenience methods ─────────────────────────────────────────────────────

  describe('convenience helpers', () => {
    it('sendWelcomeEmail should call sendEmail with correct template', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendWelcomeEmail('a@b.com', {
        name: 'Frank',
        dashboardUrl: 'https://example.com',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'welcome', to: 'a@b.com' }),
      );
    });

    it('sendPasswordResetEmail should call sendEmail with correct template', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendPasswordResetEmail('a@b.com', {
        name: 'Grace',
        resetLink: 'https://example.com/reset',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'password-reset', to: 'a@b.com' }),
      );
    });

    it('sendEmailVerification should call sendEmail with correct template', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendEmailVerification('a@b.com', {
        name: 'Hank',
        verificationLink: 'https://example.com/verify',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'email-verification', to: 'a@b.com' }),
      );
    });

    it('sendTaskReminder should call sendEmail with correct template', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendTaskReminder('a@b.com', {
        name: 'Ivy',
        pendingCount: 2,
        dashboardUrl: 'https://example.com/tasks',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'task-reminder', to: 'a@b.com' }),
      );
    });

    it('sendTaskReminder subject should be singular when pendingCount is 1', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendTaskReminder('a@b.com', {
        name: 'Jack',
        pendingCount: 1,
        dashboardUrl: 'https://example.com/tasks',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('1 task left') }),
      );
    });

    it('sendTaskReminder subject should be plural when pendingCount > 1', async () => {
      const spy = jest.spyOn(service, 'sendEmail').mockResolvedValue(false);
      await service.sendTaskReminder('a@b.com', {
        name: 'Kate',
        pendingCount: 5,
        dashboardUrl: 'https://example.com/tasks',
      });
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining('5 tasks left') }),
      );
    });
  });

  // ── XSS / injection guard ───────────────────────────────────────────────────

  describe('XSS protection', () => {
    it('should escape & < > " \' in all template variables', () => {
      const dangerous = `<script>alert('xss')</script> & "quoted"`;
      const html = service.renderTemplate('welcome', {
        name: dangerous,
        dashboardUrl: 'https://example.com',
      });
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp;');
      expect(html).toContain('&quot;');
    });
  });
});