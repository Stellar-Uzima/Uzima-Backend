import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrencyService } from './currency.service';
import { Currency, isSupportedCurrency } from './currency.enum';
import { FormattedAmountDto, CurrencyInfoDto, CurrencyRateDto } from './currency-response.dto';
import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';

class FormatAmountQueryDto {
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsOptional()
  @IsString()
  locale?: string;

  @Transform(({ value }) => (value === 'true' || value === true ? true : false))
  @IsOptional()
  includeUsdEquivalent?: boolean = false;

  @Transform(({ value }) => (value === 'false' || value === false ? false : true))
  @IsOptional()
  symbol?: boolean = true;

  @Transform(({ value }) => (value === 'true' || value === true ? true : false))
  @IsOptional()
  compact?: boolean = false;
}

@ApiTags('currency')
@ApiBearerAuth()
@Controller({ path: 'currency' })
@UseGuards(JwtAuthGuard)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get('supported')
  @ApiOperation({ summary: 'List all supported currencies and their metadata' })
  @ApiResponse({ status: 200, type: [CurrencyInfoDto] })
  listSupported(): CurrencyInfoDto[] {
    return this.currencyService.getSupportedCurrencies();
  }

  @Get('info/:code')
  @ApiOperation({ summary: 'Get metadata for a single currency code' })
  @ApiResponse({ status: 200, type: CurrencyInfoDto })
  @ApiResponse({ status: 400, description: 'Unsupported currency code' })
  getInfo(@Param('code') code: string): CurrencyInfoDto {
    if (!isSupportedCurrency(code)) {
      throw new BadRequestException(`Unsupported currency code: ${code}`);
    }
    return this.currencyService.getCurrencyInfo(code);
  }

  @Get('rates/xlm-usd')
  @ApiOperation({ summary: 'Get current XLM/USD spot rate with source & timestamp' })
  @ApiResponse({ status: 200, type: CurrencyRateDto })
  getXlmUsdRate(): Promise<CurrencyRateDto> {
    return this.currencyService.getXlmUsdRate();
  }

  @Get('format')
  @ApiOperation({ summary: 'Format an amount for a currency (optionally with USD equivalent)' })
  @ApiQuery({ name: 'includeUsdEquivalent', type: Boolean, required: false })
  @ApiResponse({ status: 200, type: FormattedAmountDto })
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  formatAmount(@Query() query: FormatAmountQueryDto): Promise<FormattedAmountDto> {
    return this.currencyService.formatAmountWithConversion({
      amount: query.amount,
      currency: query.currency,
      locale: query.locale,
      includeUsdEquivalent: query.includeUsdEquivalent,
      symbol: query.symbol,
      compact: query.compact,
    });
  }

  @Get('convert/xlm-to-usd')
  @ApiOperation({ summary: 'Convert an XLM amount to USD using the current spot rate' })
  @ApiResponse({ status: 200, type: FormattedAmountDto })
  @UsePipes(new ValidationPipe({ transform: true }))
  convertXlmToUsd(@Query('amount') amountRaw: string): Promise<FormattedAmountDto> {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount must be a non-negative finite number');
    }
    return this.currencyService.convertXlmToUsd(amount);
  }

  @Get('convert/usd-to-xlm')
  @ApiOperation({ summary: 'Convert a USD amount to XLM using the current spot rate' })
  @ApiResponse({ status: 200, type: FormattedAmountDto })
  @UsePipes(new ValidationPipe({ transform: true }))
  convertUsdToXlm(@Query('amount') amountRaw: string): Promise<FormattedAmountDto> {
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException('amount must be a non-negative finite number');
    }
    return this.currencyService.convertUsdToXlm(amount);
  }
}
