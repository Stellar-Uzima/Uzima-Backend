import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ReconciliationQueryDto {
  @ApiPropertyOptional({ description: 'Restrict the check to a single user', format: 'uuid' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: '1-based page number', minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Accounts per page (1-100)',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;
}

export class LedgerMismatchDto {
  @ApiProperty({ description: 'User whose balance disagrees with the ledger' })
  userId: string;

  @ApiProperty({ description: 'Balance stored on the user row', example: 100 })
  walletBalance: number;

  @ApiProperty({ description: 'Balance implied by posted ledger entries', example: 95 })
  ledgerBalance: number;

  @ApiProperty({ description: 'walletBalance minus ledgerBalance', example: 5 })
  drift: number;

  @ApiProperty({ description: 'Number of ledger entries for the user', example: 7 })
  entryCount: number;
}

export class ReconciliationReportDto {
  @ApiProperty({ description: 'Accounts checked', example: 250 })
  totalChecked: number;

  @ApiProperty({ description: 'Accounts whose balance drifted from the ledger', example: 3 })
  totalMismatches: number;

  @ApiProperty({ type: [LedgerMismatchDto], description: 'Mismatches for this page (never auto-corrected)' })
  mismatches: LedgerMismatchDto[];
}

export class UserReconciliationDto {
  @ApiProperty({ description: 'Checked user ID' })
  userId: string;

  @ApiProperty({ description: 'Balance stored on the user row', example: 100 })
  walletBalance: number;

  @ApiProperty({ description: 'Balance implied by posted ledger entries', example: 95 })
  ledgerBalance: number;

  @ApiProperty({ description: 'walletBalance minus ledgerBalance', example: 5 })
  drift: number;

  @ApiProperty({ description: 'Number of ledger entries for the user', example: 7 })
  entryCount: number;

  @ApiProperty({ description: 'True when drift is zero', example: false })
  matched: boolean;
}
