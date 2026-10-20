import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationTypeEnum } from '../../../modules/notification-center/entities/in-app-notification.entity';
import { EmailTemplateService, SUPPORTED_NOTIFICATION_LOCALES } from './email-template.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTemplateService],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('render', () => {
    it('should successfully render the welcome template', async () => {
      const result = await service.render('welcome', { name: 'John Doe' });
      expect(result).toContain('Welcome, John Doe!');
      expect(result).toContain('Uzima');
      expect(result).not.toContain('{{name}}');
      expect(result).not.toContain('{{ name }}');
    });

    it('should successfully render the password-reset template', async () => {
      const result = await service.render('password-reset', {
        name: 'Jane Doe',
        link: 'https://example.com/reset?token=123',
      });
      expect(result).toContain('Hello, Jane Doe');
      expect(result).toContain('https://example.com/reset?token=123');
      expect(result).not.toContain('{{name}}');
      expect(result).not.toContain('{{link}}');
    });

    it('should successfully render the email-verification template using verify-email alias', async () => {
      const result = await service.render('verify-email', {
        name: 'Alice',
        link: 'https://example.com/verify?token=456',
      });
      expect(result).toContain('Hello Alice,');
      expect(result).toContain('https://example.com/verify?token=456');
      expect(result).not.toContain('{{name}}');
      expect(result).not.toContain('{{link}}');
    });

    it('should successfully render the task-reminder template', async () => {
      const result = await service.render('task-reminder', {
        taskTitle: 'Drink Water',
        remindAt: '12:00 PM',
      });
      expect(result).toContain('Drink Water');
      expect(result).toContain('12:00 PM');
      expect(result).not.toContain('{{taskTitle}}');
      expect(result).not.toContain('{{remindAt}}');
    });

    it('rejects templates with missing required variables', async () => {
      await expect(service.render('welcome', {})).rejects.toThrow(
        new BadRequestException('Missing required variables for email template "welcome": name')
      );

      await expect(service.render('password-reset', { name: 'Jane' })).rejects.toThrow('link');
    });

    it('should throw NotFoundException for nonexistent templates', async () => {
      await expect(service.render('nonexistent-template', {})).rejects.toThrow(NotFoundException);
    });

    it.each(
      Object.values(NotificationTypeEnum).flatMap((type) =>
        [...SUPPORTED_NOTIFICATION_LOCALES, 'en-GB', 'sw'].map((locale) => [type, locale])
      )
    )('validates the notification template for type %s and locale %s', async (type, locale) => {
      const result = await service.render(
        'notification',
        { title: type, body: 'Notification body' },
        locale
      );

      expect(result).toContain(`<h1>${type}</h1>`);
      expect(result).toContain('<p>Notification body</p>');
      expect(result).toContain('<html lang="en">');
      expect(result).not.toMatch(/{{\s*[\w.-]+\s*}}/);
    });

    it.each(SUPPORTED_NOTIFICATION_LOCALES)(
      'renders the GDPR export template in supported locale %s',
      async (locale) => {
        const result = await service.render(
          'gdpr-export-ready',
          { downloadUrl: 'https://example.com/export' },
          locale
        );

        expect(result).toContain('https://example.com/export');
        expect(result).not.toContain('{{downloadUrl}}');
      }
    );
  });
});
