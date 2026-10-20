import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class TransferWalletDto {
  @ApiProperty({
    description: 'ID of the user receiving the funds',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  recipientId: string;

  @ApiProperty({
    description: 'Amount to transfer in XLM',
    example: 5.25,
    minimum: 0.0000001,
  })
  @IsNumber(
    { maxDecimalPlaces: 7 },
    { message: 'Amount must be a number with max 7 decimal places' },
  )
  @IsPositive({ message: 'Amount must be greater than zero' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional memo stored on both transfer records',
    example: 'Lunch split',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;

  @ApiPropertyOptional({
    description: 'Idempotency key; may be sent as the Idempotency-Key header instead',
    example: '3f6c1b0a-8f4f-4e5e-9a3a-1d4d2f6b7c88',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}

export class TransferResponseDto {
  @ApiProperty({
    description: 'ID of the transfer wallet transaction record',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  transactionId: string;

  @ApiProperty({ description: 'Sender user ID' })
  senderId: string;

  @ApiProperty({ description: 'Recipient user ID' })
  recipientId: string;

  @ApiProperty({ description: 'Transferred amount in XLM', example: 5.25 })
  amount: number;

  @ApiProperty({ description: 'Sender balance after the transfer', example: 94.75 })
  senderBalanceAfter: number;

  @ApiProperty({ description: 'Recipient balance after the transfer', example: 5.25 })
  recipientBalanceAfter: number;

  @ApiProperty({ description: 'Transfer creation timestamp' })
  createdAt: Date;
}
