import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { SavingsService } from './savings.service';
import { WalletTransactionService } from './wallet-transaction.service';
import { SavingsWalletController } from './savings-wallet.controller';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { SavingsGoal } from '../../database/entities/savings-goal.entity';
import { SavingsContribution } from '../../database/entities/savings-goal.entity';
import { WalletTransaction } from '../../database/entities/wallet-transaction.entity';
import { StellarModule } from '../../stellar/stellar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardTransaction,
      User,
      SavingsGoal,
      SavingsContribution,
      WalletTransaction,
    ]),
    CacheModule.register(),
    StellarModule,
  ],
  controllers: [WalletController, AdminWalletController, SavingsWalletController],
  providers: [WalletService, SavingsService, WalletTransactionService],
  exports: [WalletService, SavingsService, WalletTransactionService],
})
export class WalletModule {}
