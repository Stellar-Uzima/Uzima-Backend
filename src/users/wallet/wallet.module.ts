import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { StellarModule } from '../../stellar/stellar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardTransaction, User]),
    CacheModule.register(),
    StellarModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}