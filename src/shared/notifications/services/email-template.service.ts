import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templatesDir = path.join(__dirname, '..', 'templates');

  /**
   * Render an email template with the given data.
   * Supports placeholder replacements like {{ key }} or {{key}}.
   */
  async render(templateName: string, data: Record<string, any> = {}): Promise<string> {
    // Map legacy or alternative template names if necessary
    let normalizedName = templateName;
    if (templateName === 'verify-email') {
      normalizedName = 'email-verification';
    }

    const filename = normalizedName.endsWith('.html') ? normalizedName : `${normalizedName}.html`;
    const templatePath = path.join(this.templatesDir, filename);

    try {
      if (!fs.existsSync(templatePath)) {
        // Fallback check in case templates are in shared/mail/templates (e.g. gdpr-export-ready)
        const fallbackPath = path.join(__dirname, '../../mail/templates', filename);
        if (fs.existsSync(fallbackPath)) {
          return this.compileTemplate(fallbackPath, data);
        }
        throw new NotFoundException(`Email template not found: ${templateName} (tried ${templatePath} and ${fallbackPath})`);
      }

      return this.compileTemplate(templatePath, data);
    } catch (error) {
      this.logger.error(`Failed to render email template: ${templateName}`, error as any);
      throw error;
    }
  }

  private async compileTemplate(filePath: string, data: Record<string, any>): Promise<string> {
    let content = await fs.promises.readFile(filePath, 'utf-8');

    // Replace placeholders: {{ key }}
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const replacement = value !== undefined && value !== null ? String(value) : '';
      content = content.replace(regex, replacement);
    }

    // Clean up any remaining unresolved placeholders
    content = content.replace(/{{\s*[\w\.-]+\s*}}/g, '');

    return content;
  }
}
