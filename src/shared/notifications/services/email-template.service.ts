import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { resolveLocale } from '../../../common/utils/locale-resolver.util';

const SUPPORTED_LOCALES = ['en'] as const;

@Injectable()
export class EmailTemplateService {
  private readonly logger = new Logger(EmailTemplateService.name);
  private readonly templatesDir = path.join(__dirname, '..', 'templates');

  /**
   * Render an email template with the given data.
   * Supports placeholder replacements like {{ key }} or {{key}}.
   */
  async render(
    templateName: string,
    data: Record<string, unknown> = {},
    preferredLocale = 'en'
  ): Promise<string> {
    // Map legacy or alternative template names if necessary
    let normalizedName = templateName;
    if (templateName === 'verify-email') {
      normalizedName = 'email-verification';
    }

    const filename = normalizedName.endsWith('.html') ? normalizedName : `${normalizedName}.html`;
    const locale = resolveLocale(SUPPORTED_LOCALES, preferredLocale);
    const localizedPath = path.join(this.templatesDir, locale, filename);
    const templatePath = fs.existsSync(localizedPath)
      ? localizedPath
      : path.join(this.templatesDir, filename);

    try {
      if (!fs.existsSync(templatePath)) {
        // Fallback check in case templates are in shared/mail/templates (e.g. gdpr-export-ready)
        const fallbackPath = path.join(__dirname, '../../mail/templates', filename);
        if (fs.existsSync(fallbackPath)) {
          return this.compileTemplate(fallbackPath, data);
        }
        throw new NotFoundException(
          `Email template not found: ${templateName} (tried ${templatePath} and ${fallbackPath})`
        );
      }

      return this.compileTemplate(templatePath, data);
    } catch (error) {
      this.logger.error(`Failed to render email template: ${templateName}`, error as any);
      throw error;
    }
  }

  private async compileTemplate(filePath: string, data: Record<string, unknown>): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const placeholders = [...content.matchAll(/{{\s*([\w.-]+)\s*}}/g)];
    const missing = [
      ...new Set(
        placeholders
          .map(([, key]) => key)
          .filter((key) => {
            const value = data[key];
            return (
              value === undefined ||
              value === null ||
              (typeof value === 'string' && value.trim() === '')
            );
          })
      ),
    ];

    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required variables for email template "${path.basename(filePath)}": ${missing.join(', ')}`
      );
    }

    return content.replace(/{{\s*([\w.-]+)\s*}}/g, (_placeholder, key: string) =>
      String(data[key])
    );
  }
}
