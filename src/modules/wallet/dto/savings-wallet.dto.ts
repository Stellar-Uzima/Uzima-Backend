import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
  Max,
  IsDateString,
  Length,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SavingsGoalStatus } from '../database/entities/savings-goal.entity';
import { ContributionStatus } from '../database/entities/savings-goal.entity';
import { WalletTransactionType, WalletTransactionStatus } from '../database/entities/wallet-transaction.entity';

export class CreateSavingsGoalDto {
  @ApiProperty({ description: 'Goal title', example: 'Emergency Fund', minLength: 1, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 200)
  title: string;

  @ApiPropertyOptional({ description: 'Goal description', example: 'Build 3 months of expenses' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Target amount in XLM', example: 500, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.01)
  targetAmount: number;

  @ApiPropertyOptional({ description: 'Auto-contribution amount per period', example: 10 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0)
  autoContributionAmount?: number = 0;

  @ApiPropertyOptional({ description: 'Auto-contribution frequency', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY'])
  autoContributionFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({ description: 'Target completion date', example: '2024-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;
}

export class UpdateSavingsGoalDto {
  @ApiPropertyOptional({ description: 'Goal title', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ description: 'Goal description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Target amount in XLM', minimum: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.01)
  targetAmount?: number;

  @ApiPropertyOptional({ description: 'Auto-contribution amount per period', minimum: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0)
  autoContributionAmount?: number;

  @ApiPropertyOptional({ description: 'Auto-contribution frequency', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  @IsOptional()
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY'])
  autoContributionFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({ description: 'Target completion date' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ description: 'Goal status', enum: SavingsGoalStatus })
  @IsOptional()
  @IsEnum(SavingsGoalStatus)
  status?: SavingsGoalStatus;
}

export class SavingsGoalResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Emergency Fund' })
  title: string;

  @ApiPropertyOptional({ example: 'Build 3 months of expenses' })
  description?: string;

  @ApiProperty({ example: 500 })
  targetAmount: number;

  @ApiProperty({ example: 125.5 })
  currentAmount: number;

  @ApiProperty({ example: 25.1 })
  progressPercentage: number;

  @ApiPropertyOptional({ example: 10 })
  autoContributionAmount?: number;

  @ApiPropertyOptional({ enum: ['DAILY', 'WEEKLY', 'MONTHLY'] })
  autoContributionFrequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59.000Z' })
  targetDate?: Date;

  @ApiProperty({ enum: SavingsGoalStatus, example: SavingsGoalStatus.ACTIVE })
  status: SavingsGoalStatus;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Days remaining until target date' })
  daysRemaining?: number;

  @ApiPropertyOptional({ description: 'Required daily/weekly/monthly contribution to meet target' })
  requiredContributionRate?: number;
}

export class CreateContributionDto {
  @ApiProperty({ description: 'Amount to contribute in XLM', example: 25, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.01)
  amount: number;
}

export class ContributionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  goalId: string;

  @ApiProperty({ example: 25 })
  amount: number;

  @ApiProperty({ enum: ContributionStatus, example: ContributionStatus.CONFIRMED })
  status: ContributionStatus;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  transactionHash?: string;

  @ApiPropertyOptional({ example: 'Insufficient balance' })
  failureReason?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class SavingsGoalListQueryDto {
  @ApiPropertyOptional({ enum: SavingsGoalStatus })
  @IsOptional()
  @IsEnum(SavingsGoalStatus)
  status?: SavingsGoalStatus;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class WalletTransactionResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ enum: WalletTransactionType, example: WalletTransactionType.DEPOSIT })
  type: WalletTransactionType;

  @ApiProperty({ example: 50.5 })
  amount: number;

  @ApiProperty({ example: 100 })
  balanceBefore: number;

  @ApiProperty({ example: 150.5 })
  balanceAfter: number;

  @ApiProperty({ enum: WalletTransactionStatus, example: WalletTransactionStatus.CONFIRMED })
  status: WalletTransactionStatus;

  @ApiPropertyOptional({ example: '123e4567-e89b-12d3-a456-426614174000' })
  referenceId?: string;

  @ApiPropertyOptional({ example: 'withdrawal' })
  referenceType?: string;

  @ApiPropertyOptional({ example: 'Top-up via bank transfer' })
  description?: string;

  @ApiPropertyOptional({ example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR' })
  sourceAddress?: string;

  @ApiPropertyOptional({ example: 'GDXYZ...' })
  destinationAddress?: string;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6...' })
  stellarTxHash?: string;

  @ApiPropertyOptional({ example: 'Insufficient funds' })
  failureReason?: string;

  @ApiPropertyOptional({ example: { bankRef: 'TXN123' } })
  metadata?: Record<string, any>;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class WalletTransactionListQueryDto {
  @ApiPropertyOptional({ enum: WalletTransactionType })
  @IsOptional()
  @IsEnum(WalletTransactionType)
  type?: WalletTransactionType;

  @ApiPropertyOptional({ enum: WalletTransactionStatus })
  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  status?: WalletTransactionStatus;

  @ApiPropertyOptional({ description: 'Start date filter', example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter', example: '2024-12-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class TopUpDto {
  @ApiProperty({ description: 'Amount to top up in XLM', example: 100, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'Payment method identifier', example: 'bank_transfer', minLength: 1, maxLength: 50 })
  @IsString()
  @IsNotEmpty()
  @Length(1, 50)
  paymentMethod: string;

  @ApiPropertyOptional({ description: 'External reference ID from payment provider', example: 'TXN123456' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  externalReference?: string;

  @ApiPropertyOptional({ description: 'Return URL after payment completion', example: 'https://app.example.com/wallet' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class TopUpResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  transactionId: string;

  @ApiProperty({ example: 100 })
  amount: number;

  @ApiProperty({ enum: WalletTransactionStatus, example: WalletTransactionStatus.PENDING })
  status: WalletTransactionStatus;

  @ApiPropertyOptional({ description: 'Payment URL for redirect-based methods', example: 'https://pay.example.com/pay/abc123' })
  paymentUrl?: string;

  @ApiPropertyOptional({ description: 'Instructions for manual payment methods', example: 'Send XLM to address GDXYZ... with memo: 123456' })
  instructions?: string;

  @ApiProperty()
  createdAt: Date;
}