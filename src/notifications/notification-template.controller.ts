import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { NotificationTemplateService } from './notification-template.service';

@Controller('notification-templates')
export class NotificationTemplateController {
  constructor(private readonly service: NotificationTemplateService) {}

  @Get(':key/versions')
  async listRevisions(@Param('key') key: string) {
    return this.service.listRevisions(key);
  }

  @Get(':key/versions/latest')
  async getLatest(@Param('key') key: string) {
    return this.service.resolveActive(key);
  }

  @Get(':key/versions/:version')
  async getVersion(@Param('key') key: string, @Param('version') version: string) {
    return this.service.getVersion(key, Number(version));
  }

  @Post(':key/versions')
  async createDraft(
    @Param('key') key: string,
    @Body()
    body: {
      subject: string;
      body: string;
      defaults?: Record<string, unknown> | null;
      effectiveAt?: string;
      changeNote?: string;
      authorId?: string;
    },
  ) {
    return this.service.createDraft({ templateKey: key, ...body });
  }

  @Post(':key/versions/:version/publish')
  async publish(@Param('key') key: string, @Param('version') version: string) {
    return this.service.publish(key, Number(version));
  }
}
