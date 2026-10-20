import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_LOCALE, resolveLocale } from '../../../common/utils/locale-resolver.util';

export const SUPPORTED_NOTIFICATION_LOCALES = [DEFAULT_LOCALE] as const;

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
    preferredLocale?: string | null
  ): Promise<string> {
    let normalizedName = templateName;
    if (templateName === 'verify-email') {
      normalizedName = 'email-verification';
    }

    const filename = normalizedName.endsWith('.html') ? normalizedName : `${normalizedName}.html`;
    const locale = resolveLocale(SUPPORTED_NOTIFICATION_LOCALES, preferredLocale);
    const localizedTemplatePath = path.join(this.templatesDir, locale, filename);
    const templatePath = path.join(this.templatesDir, filename);

    try {
      const selectedTemplatePath = fs.existsSync(localizedTemplatePath)
        ? localizedTemplatePath
        : templatePath;

      if (!fs.existsSync(selectedTemplatePath)) {
        const fallbackPath = path.join(__dirname, '../../mail/templates', filename);
        if (fs.existsSync(fallbackPath)) {
          return this.compileTemplate(fallbackPath, data);
        }
        throw new NotFoundException(
          `Email template not found: ${templateName} (tried ${localizedTemplatePath}, ${templatePath}, and ${fallbackPath})`
        );
      }

      return this.compileTemplate(selectedTemplatePath, data);
    } catch (error) {
      this.logger.error(`Failed to render email template: ${templateName}`, error as any);
      throw error;
    }
  }

  private async compileTemplate(filePath: string, data: Record<string, unknown>): Promise<string> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const placeholders = new Set(
      Array.from(content.matchAll(/{{\s*([\w.-]+)\s*}}/g), (match) => match[1])
    );
    const missing = [...placeholders].filter(
      (key) => data[key] === undefined || data[key] === null
    );

    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required variables for email template "${path.basename(filePath, '.html')}": ${missing.join(', ')}`
      );
    }

    return content.replace(/{{\s*([\w.-]+)\s*}}/g, (_placeholder, key: string) =>
      String(data[key])
    );
  }
}
