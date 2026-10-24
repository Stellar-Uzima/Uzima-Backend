import { Module } from '@nestjs/common';
import { DIGEST_SENDER } from './digest.constants';
import { DigestScheduler } from './digest.scheduler';
import { DigestService } from './digest.service';
import { MailDigestSender } from './mail-digest.sender';

@Module({
  providers: [
    DigestService,
    DigestScheduler,
    { provide: DIGEST_SENDER, useClass: MailDigestSender },
  ],
  exports: [DigestService],
})
export class DigestModule {}
