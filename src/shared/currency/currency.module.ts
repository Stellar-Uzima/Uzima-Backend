import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { StellarModule } from '../../stellar/stellar.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [StellarModule, AuditModule],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}
