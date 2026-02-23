import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';

@Module({
  controllers: [StellarController],
  providers: [StellarService],
})
export class StellarModule {}
