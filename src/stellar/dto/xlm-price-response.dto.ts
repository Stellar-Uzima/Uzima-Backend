import { ApiProperty } from '@nestjs/swagger';

export class XlmPriceResponseDto {
  @ApiProperty({ example: 0.12, description: 'Current XLM price in USD' })
  priceUsd: number;

  @ApiProperty({ example: 'coingecko' })
  source: string;

  @ApiProperty({ example: '2026-06-01T12:00:00.000Z' })
  fetchedAt: string;

  @ApiProperty({ example: 'USD' })
  currency: string;
}
