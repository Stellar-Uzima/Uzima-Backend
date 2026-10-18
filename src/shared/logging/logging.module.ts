import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomLogger } from './logger.service';
import { StructuredNestLogger } from './nest-logger.adapter';

@Module({
  imports: [ConfigModule],
  providers: [CustomLogger, StructuredNestLogger],
  exports: [CustomLogger, StructuredNestLogger],
})
export class LoggingModule {}
