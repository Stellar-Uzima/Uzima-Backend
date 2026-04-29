import { Module, Global } from '@nestjs/common';
import { SigningService } from './signing.service';
import { RequestSigningGuard } from './request-signing.guard';

@Global()
@Module({
  providers: [SigningService, RequestSigningGuard],
  exports: [SigningService, RequestSigningGuard],
})
export class SigningModule {}
