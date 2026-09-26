import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { AdminWalletController } from './admin-wallet.controller';
import { RewardTransaction } from '../../rewards/entities/reward-transaction.entity';
import { User } from '../../entities/user.entity';
import { StellarModule } from '../../stellar/stellar.module';
import { TaskCompletion } from '../../tasks/entities/task-completion.entity';
import { AuditModule } from '@/audit/audit.module';
import { NotificationCenterModule } from '../notification-center/notification-center.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardTransaction, TaskCompletion, User]),
    CacheModule.register(),
    StellarModule,
    AuditModule,
    NotificationCenterModule,
  ],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService],
})
export class WalletModule {}
