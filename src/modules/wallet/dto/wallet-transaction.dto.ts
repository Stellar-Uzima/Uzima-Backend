import { IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletTransactionResponseDto } from './savings-wallet.dto';

export class ReverseTransactionDto {
  @ApiPropertyOptional({
    description: 'Human-readable reason for the reversal',
    example: 'Duplicate charge reported by user',
    minLength: 1,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class ReverseTransactionResponseDto {
  @ApiProperty({
    description: 'Original transaction after reversal (status REVERSED)',
    type: WalletTransactionResponseDto,
  })
  original: WalletTransactionResponseDto;

  @ApiProperty({
    description: 'Compensating ledger entry created for the reversal',
    type: WalletTransactionResponseDto,
  })
  reversal: WalletTransactionResponseDto;
}
