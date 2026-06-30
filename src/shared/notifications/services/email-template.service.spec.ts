import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplateService } from './email-template.service';
import { NotFoundException } from '@nestjs/common';

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

    it('should clean up unused placeholders', async () => {
      // If we don't pass name for welcome template, it should be replaced with empty string
      const result = await service.render('welcome', {});
      expect(result).toContain('Welcome, !');
      expect(result).not.toContain('{{name}}');
    });

    it('should throw NotFoundException for nonexistent templates', async () => {
      await expect(service.render('nonexistent-template', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
