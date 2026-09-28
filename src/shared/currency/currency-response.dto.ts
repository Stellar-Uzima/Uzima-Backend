import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from './currency.enum';

export class FormattedAmountDto {
  @ApiProperty({ description: 'Numeric amount in the requested currency', example: 1234.56 })
  amount: number;

  @ApiProperty({
    description: 'ISO 4217 or Stellar asset currency code',
    enum: Currency,
    example: Currency.XLM,
  })
  currency: Currency;

  @ApiProperty({
    description: 'Locale-aware formatted amount string (includes symbol when applicable)',
    example: '$1,234.56',
  })
  formatted: string;

  @ApiPropertyOptional({
    description: 'Compact formatted amount for UI headers/lists (e.g., $1.2K)',
    example: '$1.2K',
  })
  formattedCompact?: string;

  @ApiPropertyOptional({
    description: 'Equivalent amount in USD when conversion was applied',
    example: 145.23,
  })
  amountUsd?: number;

  @ApiPropertyOptional({
    description: 'USD formatted string when amountUsd is present',
    example: '$145.23',
  })
  amountUsdFormatted?: string;

  @ApiPropertyOptional({
    description: 'Locale used for formatting',
    example: 'en-US',
  })
  locale?: string;

  @ApiPropertyOptional({
    description: 'Spot rate applied for conversion (source currency per 1 USD)',
    example: 0.1177,
  })
  rateApplied?: number;

  @ApiPropertyOptional({
    description: 'Source of the spot rate (coingecko, stellar-dex, cache)',
    example: 'coingecko',
  })
  rateSource?: string;

  @ApiPropertyOptional({
    description: 'ISO timestamp when the spot rate was fetched',
    example: '2025-03-18T12:00:00.000Z',
  })
  rateFetchedAt?: string;

  @ApiPropertyOptional({
    description: 'Currency decimals used for rounding',
    example: 2,
  })
  decimals?: number;
}

export class CurrencyRateDto {
  @ApiProperty({ description: 'Base currency code', enum: Currency, example: Currency.XLM })
  base: Currency;

  @ApiProperty({ description: 'Quote currency code', enum: Currency, example: Currency.USD })
  quote: Currency;

  @ApiProperty({ description: '1 base = rate quote', example: 0.1177 })
  rate: number;

  @ApiPropertyOptional({
    description: 'Inverse rate: 1 quote = inverseRate base',
    example: 8.496,
  })
  inverseRate?: number;

  @ApiProperty({ description: 'Rate source', example: 'coingecko' })
  source: string;

  @ApiProperty({ description: 'ISO timestamp when fetched', example: '2025-03-18T12:00:00.000Z' })
  fetchedAt: string;
}

export class CurrencyInfoDto {
  @ApiProperty({ enum: Currency, example: Currency.XLM })
  code: Currency;

  @ApiProperty({ example: 'XLM' })
  symbol: string;

  @ApiProperty({ example: 'Stellar Lumens' })
  name: string;

  @ApiProperty({ example: 7 })
  decimals: number;

  @ApiProperty({ example: false })
  isFiat: boolean;

  @ApiProperty({ example: true })
  isStellarAsset: boolean;

  @ApiProperty({ example: 'en-US' })
  defaultLocale: string;
}
