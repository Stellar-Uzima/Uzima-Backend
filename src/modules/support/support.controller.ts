import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { SupportService } from './support.service';
import { SupportCaseStatus } from './entities/support-case.entity';

@Controller('support/cases')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  create(@Req() request: any, @Body() body: { subject: string; description: string; category?: string }) {
    return this.supportService.create(request.user?.id || body['userId'], body);
  }

  @Get()
  list(@Query('status') status?: SupportCaseStatus, @Query('userId') userId?: string) {
    return this.supportService.list({ status, userId });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { status?: SupportCaseStatus; category?: string }) {
    return this.supportService.update(id, body);
  }

  @Post(':id/notes')
  addNote(@Req() request: any, @Param('id') id: string, @Body('body') body: string) {
    return this.supportService.addNote(id, request.user?.id || 'system', body);
  }
}
