import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackfillRun } from './entities/backfill-run.entity';
import { BackfillController } from './backfill.controller';
import { BackfillService } from './backfill.service';

@Module({
  imports: [TypeOrmModule.forFeature([BackfillRun])],
  controllers: [BackfillController],
  providers: [BackfillService],
  exports: [BackfillService],
})
export class BackfillModule {}
