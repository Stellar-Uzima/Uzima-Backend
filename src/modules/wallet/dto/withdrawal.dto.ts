import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
}

export class CreateWithdrawalDto {
  @ApiProperty({
    description: 'Amount to withdraw in XLM',
    example: 10.5,
    minimum: 0.01,
  })
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 7 }, { message: 'Amount must be a number with max 7 decimal places' })
  @Min(0.01, { message: 'Minimum withdrawal amount is 0.01 XLM' })
  amount: number;

  @ApiProperty({
    description: 'Destination Stellar address',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar address format',
  })
  destinationAddress: string;

  @ApiPropertyOptional({
    description: 'Optional memo for the withdrawal',
    example: 'Withdrawal to external exchange',
  })
  @IsOptional()
  @IsString()
  memo?: string;
}

export class WithdrawalResponseDto {
  @ApiProperty({
    description: 'Withdrawal ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Withdrawal amount in XLM',
    example: 10.5,
  })
  amount: number;

  @ApiProperty({
    description: 'Destination address',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  destinationAddress: string;

  @ApiPropertyOptional({
    description: 'Optional memo',
    example: 'Withdrawal to external exchange',
  })
  memo?: string;

  @ApiProperty({
    description: 'Withdrawal status',
    enum: WithdrawalStatus,
    example: WithdrawalStatus.PENDING,
  })
  status: WithdrawalStatus;

  @ApiPropertyOptional({
    description: 'Stellar transaction hash (when completed)',
    example: 'a1b2c3d4e5f6...',
  })
  transactionHash?: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-01T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiPropertyOptional({
    description: 'Completion timestamp',
    example: '2024-01-01T12:05:00.000Z',
  })
  completedAt?: Date;

  @ApiPropertyOptional({
    description: 'Failure reason if failed/rejected',
    example: 'Insufficient balance',
  })
  failureReason?: string;
}

export class WithdrawalListQueryDto {
  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of results per page',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: WithdrawalStatus,
  })
  @IsOptional()
  @IsEnum(WithdrawalStatus)
  status?: WithdrawalStatus;
}