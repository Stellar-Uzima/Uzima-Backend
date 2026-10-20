import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min
} from 'class-validator';
import { StellarTransactionType } from '../entities/stellar-transaction-record.entity';

export class TrackStellarTransactionDto {
  @ApiProperty({
    description: 'Stellar transaction hash (64 hex characters)',
    example: '1c2e3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]{64}$/, { message: 'Transaction hash must be 64 hexadecimal characters' })
  hash: string;

  @ApiPropertyOptional({
    description: 'Lifecycle classification of the transaction',
    enum: StellarTransactionType,
  })
  @IsOptional()
  @IsIn(['payment', 'outgoing', 'incoming', 'other'])
  type?: StellarTransactionType;

  @ApiPropertyOptional({
    description: 'Expected amount in XLM',
    example: 12.5,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0)
  @Max(9_007_199_254_740_991)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Counterpart Stellar account (G…)',
    example: 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR',
  })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'Invalid Stellar public key format' })
  counterpartAddress?: string;
}
