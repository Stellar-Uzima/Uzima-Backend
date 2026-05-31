import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomLogger } from './logger.service';
import { RequestContextService } from '../../common/middleware/request-context.service';

@Module({
  imports: [ConfigModule],
  providers: [CustomLogger, RequestContextService],
  exports: [CustomLogger, RequestContextService],
})
export class LoggingModule {}