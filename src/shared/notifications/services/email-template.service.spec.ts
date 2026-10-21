import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplateService } from './email-template.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

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

    it('rejects a template when a required variable is missing', async () => {
      await expect(service.render('welcome', {})).rejects.toThrow(BadRequestException);
      await expect(service.render('welcome', {})).rejects.toThrow(/name/);
    });

    it.each(['en', 'en-US', 'fr'])(
      'renders the notification template for locale %s using the English fallback',
      async (locale) => {
        const result = await service.render(
          'notification',
          { title: 'Reminder', body: 'Your task is due.', firstName: 'Alex' },
          locale
        );

        expect(result).toContain('Hello Alex,');
        expect(result).toContain('Reminder');
        expect(result).toContain('Your task is due.');
      }
    );

    it('reports every missing variable before returning a rendered template', async () => {
      await expect(
        service.render('notification', { title: 'Reminder', firstName: 'Alex' })
      ).rejects.toThrow(/body/);
    });

    it('should throw NotFoundException for nonexistent templates', async () => {
      await expect(service.render('nonexistent-template', {})).rejects.toThrow(NotFoundException);
    });
  });
});
