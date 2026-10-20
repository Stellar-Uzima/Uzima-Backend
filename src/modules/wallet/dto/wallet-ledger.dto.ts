import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  WalletLedgerDirection,
  WalletLedgerEntryType,
} from '../entities/wallet-ledger-entry.entity';

export class LedgerEntriesQueryDto {
  @ApiPropertyOptional({ description: '1-based page number', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of entries per page (1-100)',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by ledger entry type',
    enum: WalletLedgerEntryType,
  })
  @IsEnum(WalletLedgerEntryType)
  @IsOptional()
  type?: WalletLedgerEntryType;

  @ApiPropertyOptional({
    description: 'Filter by direction',
    enum: WalletLedgerDirection,
  })
  @IsEnum(WalletLedgerDirection)
  @IsOptional()
  direction?: WalletLedgerDirection;
}

export class LedgerEntryResponseDto {
  @ApiProperty({ description: 'Ledger entry ID' })
  id: string;

  @ApiProperty({ description: 'Entry direction', enum: WalletLedgerDirection })
  direction: WalletLedgerDirection;

  @ApiProperty({ description: 'Absolute amount in XLM', example: 5.25 })
  amount: number;

  @ApiProperty({ description: 'Entry type', enum: WalletLedgerEntryType })
  type: WalletLedgerEntryType;

  @ApiPropertyOptional({ description: 'Kind of the referenced record', example: 'wallet_transaction' })
  referenceType?: string;

  @ApiPropertyOptional({ description: 'ID of the referenced record' })
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Balance after this entry', example: 94.75 })
  balanceAfter?: number;

  @ApiProperty({ description: 'When the entry was posted' })
  createdAt: Date;
}

export class LedgerPageResponseDto {
  @ApiProperty({ type: [LedgerEntryResponseDto] })
  data: LedgerEntryResponseDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    example: { totalCount: 12, page: 1, limit: 20, totalPages: 1 },
  })
  metadata: { totalCount: number; page: number; limit: number; totalPages: number };
}
