import { Controller, Get, Param, Post } from '@nestjs/common';
import { BackfillService } from './backfill.service';

@Controller('admin/backfills')
export class BackfillController {
  constructor(private readonly backfills: BackfillService) {}

  @Get()
  list() { return this.backfills.list(); }

  @Post(':jobKey/run')
  run(@Param('jobKey') jobKey: string) { return this.backfills.run(jobKey); }
}
