import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetPayoutHistoryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 10, minimum: 1, maximum: 100 })
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Start date for filtering (ISO 8601)', example: '2026-01-01T00:00:00.000Z' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for filtering (ISO 8601)', example: '2026-12-31T23:59:59.999Z' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by payout status', enum: ['pending', 'completed', 'failed'] })
  status?: 'pending' | 'completed' | 'failed';
}

export class PayoutHistoryResponseDto {
  @ApiProperty({ description: 'Unique payout identifier', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ description: 'Payout amount as a string', example: '100.50' })
  amount: string;

  @ApiProperty({ description: 'Date the payout was processed', example: '2026-06-15T12:00:00.000Z' })
  date: Date;

  @ApiProperty({ description: 'Stellar transaction hash', example: 'tx_hash_abc123' })
  transactionHash: string;

  @ApiProperty({ description: 'Current status of the payout', enum: ['pending', 'completed', 'failed'], example: 'completed' })
  status: string;
}

export class PaginatedPayoutHistoryDto {
  @ApiProperty({ description: 'Array of payout records', type: [PayoutHistoryResponseDto] })
  data: PayoutHistoryResponseDto[];

  @ApiProperty({ description: 'Total number of payout records', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Number of records per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  totalPages: number;
}
