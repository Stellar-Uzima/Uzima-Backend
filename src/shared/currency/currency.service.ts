import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PriceFeedService } from '../../stellar/price-feed.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditResource } from '../../audit/entities/audit-log.entity';
import {
  Currency,
  CURRENCY_METADATA,
  SUPPORTED_CURRENCIES,
  getCurrencyMetadata,
  isSupportedCurrency,
} from './currency.enum';
import {
  FormattedAmountDto,
  CurrencyRateDto,
  CurrencyInfoDto,
} from './currency-response.dto';
import {
  formatAmount,
  formatAmountCompact,
  validateCurrencyAmount,
  convertXlmToUsd,
  convertUsdToXlm,
  detectDefaultCurrency,
  roundToDecimals,
} from './currency.utils';

export interface FormatAmountRequest {
  amount: number;
  currency: Currency;
  locale?: string;
  includeUsdEquivalent?: boolean;
  symbol?: boolean;
  compact?: boolean;
}

export interface ValidateTransactionCurrencyRequest {
  amount: number;
  currency: Currency;
  minAmount?: number;
  maxAmount?: number;
}

export interface ValidatedTransactionCurrency {
  valid: boolean;
  amount: number;
  currency: Currency;
  decimals: number;
  amountUsd?: number;
  error?: string;
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private readonly priceFeedService: PriceFeedService,
    private readonly auditService: AuditService,
  ) {}

  getSupportedCurrencies(): CurrencyInfoDto[] {
    return SUPPORTED_CURRENCIES.map((code) => {
      const meta = getCurrencyMetadata(code);
      return {
        code: meta.code,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        isFiat: meta.isFiat,
        isStellarAsset: meta.isStellarAsset,
        defaultLocale: meta.defaultLocale,
      };
    });
  }

  getCurrencyInfo(code: Currency): CurrencyInfoDto {
    const meta = getCurrencyMetadata(code);
    return {
      code: meta.code,
      symbol: meta.symbol,
      name: meta.name,
      decimals: meta.decimals,
      isFiat: meta.isFiat,
      isStellarAsset: meta.isStellarAsset,
      defaultLocale: meta.defaultLocale,
    };
  }

  detectDefaultCurrencyForUser(
    countryCode?: string,
    preferredLanguage?: string,
  ): Currency {
    return detectDefaultCurrency(countryCode, preferredLanguage);
  }

  formatAmount(request: FormatAmountRequest): FormattedAmountDto {
    const {
      amount,
      currency,
      locale,
      includeUsdEquivalent = false,
      symbol = true,
      compact = false,
    } = request;

    if (!isSupportedCurrency(currency)) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }
    const meta = getCurrencyMetadata(currency);
    const validated = validateCurrencyAmount(amount, currency);
    if (!validated.valid || validated.amount === undefined) {
      throw new BadRequestException(
        `Invalid amount for currency ${currency}: ${validated.error}`,
      );
    }

    const cleanAmount = roundToDecimals(validated.amount, meta.decimals);
    const formatted = formatAmount(cleanAmount, currency, {
      locale,
      symbol,
      style: symbol ? 'currency' : 'decimal',
    });
    const formattedCompact = compact
      ? formatAmountCompact(cleanAmount, currency, locale)
      : undefined;

    const dto: FormattedAmountDto = {
      amount: cleanAmount,
      currency,
      formatted,
      formattedCompact,
      locale: locale ?? meta.defaultLocale,
      decimals: meta.decimals,
    };

    if (includeUsdEquivalent) {
      this.logger.debug(`Computing USD equivalent for ${cleanAmount} ${currency}`);
    }

    return dto;
  }

  async formatAmountWithConversion(
    request: FormatAmountRequest & {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<FormattedAmountDto> {
    const dto = this.formatAmount(request);
    const { currency, amount, userId, ipAddress, userAgent } = request;

    if (request.includeUsdEquivalent && currency !== Currency.USD) {
      const snapshot = await this.priceFeedService.getXlmUsdPrice();
      let amountUsd: number;

      if (currency === Currency.XLM) {
        amountUsd = convertXlmToUsd(amount, snapshot.priceUsd);
      } else if (currency === Currency.USDC) {
        amountUsd = roundToDecimals(amount, 2);
      } else {
        const meta = getCurrencyMetadata(currency);
        this.logger.warn(
          `Direct fiat ${currency} → USD rate not configured; returning XLM-derived approximation only for XLM/USDC.`,
        );
        dto.rateApplied = snapshot.priceUsd;
        dto.rateSource = snapshot.source;
        dto.rateFetchedAt = snapshot.fetchedAt;
        amountUsd = NaN;
        if (meta.isFiat) {
          return dto;
        }
      }

      if (Number.isFinite(amountUsd)) {
        dto.amountUsd = amountUsd;
        dto.amountUsdFormatted = formatAmount(amountUsd, Currency.USD, {
          locale: request.locale,
        });
        dto.rateApplied = snapshot.priceUsd;
        dto.rateSource = snapshot.source;
        dto.rateFetchedAt = snapshot.fetchedAt;
      }
    }

    if (userId) {
      try {
        await this.auditService.logEvent({
          action: AuditAction.VIEW,
          resourceType: AuditResource.TRANSACTION,
          resourceId: `currency-format:${currency}:${amount}`,
          userId,
          metadata: {
            amount,
            currency,
            locale: request.locale,
            includeUsdEquivalent: request.includeUsdEquivalent,
            amountUsd: dto.amountUsd,
            rateApplied: dto.rateApplied,
            rateSource: dto.rateSource,
          },
          ipAddress,
          userAgent,
          isComplianceEvent: false,
        });
      } catch (auditErr) {
        this.logger.warn(
          `Audit write failed for currency format view: ${(auditErr as Error).message}`,
        );
      }
    }

    return dto;
  }

  async getXlmUsdRate(): Promise<CurrencyRateDto> {
    const snapshot = await this.priceFeedService.getXlmUsdPrice();
    return {
      base: Currency.XLM,
      quote: Currency.USD,
      rate: snapshot.priceUsd,
      inverseRate: Number((1 / snapshot.priceUsd).toFixed(6)),
      source: snapshot.source,
      fetchedAt: snapshot.fetchedAt,
    };
  }

  async convertXlmToUsd(xlmAmount: number): Promise<FormattedAmountDto> {
    const snapshot = await this.priceFeedService.getXlmUsdPrice();
    const amountUsd = convertXlmToUsd(xlmAmount, snapshot.priceUsd);

    return {
      amount: amountUsd,
      currency: Currency.USD,
      formatted: formatAmount(amountUsd, Currency.USD),
      formattedCompact: formatAmountCompact(amountUsd, Currency.USD),
      amountUsd,
      amountUsdFormatted: formatAmount(amountUsd, Currency.USD),
      locale: 'en-US',
      rateApplied: snapshot.priceUsd,
      rateSource: snapshot.source,
      rateFetchedAt: snapshot.fetchedAt,
      decimals: 2,
    };
  }

  async convertUsdToXlm(usdAmount: number): Promise<FormattedAmountDto> {
    const snapshot = await this.priceFeedService.getXlmUsdPrice();
    const amountXlm = convertUsdToXlm(usdAmount, snapshot.priceUsd);

    return {
      amount: amountXlm,
      currency: Currency.XLM,
      formatted: formatAmount(amountXlm, Currency.XLM),
      formattedCompact: formatAmountCompact(amountXlm, Currency.XLM),
      amountUsd: usdAmount,
      amountUsdFormatted: formatAmount(usdAmount, Currency.USD),
      locale: 'en-US',
      rateApplied: snapshot.priceUsd,
      rateSource: snapshot.source,
      rateFetchedAt: snapshot.fetchedAt,
      decimals: 7,
    };
  }

  validateTransactionCurrency(
    req: ValidateTransactionCurrencyRequest,
  ): ValidatedTransactionCurrency {
    const { amount, currency, minAmount, maxAmount } = req;
    const meta = getCurrencyMetadata(currency);
    const checked = validateCurrencyAmount(amount, currency);

    if (!checked.valid || checked.amount === undefined) {
      return {
        valid: false,
        amount: 0,
        currency,
        decimals: meta.decimals,
        error: checked.error,
      };
    }

    if (minAmount !== undefined && checked.amount < minAmount) {
      return {
        valid: false,
        amount: checked.amount,
        currency,
        decimals: meta.decimals,
        error: `Amount ${checked.amount} ${currency} is below minimum ${minAmount}`,
      };
    }
    if (maxAmount !== undefined && checked.amount > maxAmount) {
      return {
        valid: false,
        amount: checked.amount,
        currency,
        decimals: meta.decimals,
        error: `Amount ${checked.amount} ${currency} exceeds maximum ${maxAmount}`,
      };
    }

    return {
      valid: true,
      amount: checked.amount,
      currency,
      decimals: meta.decimals,
    };
  }

  async validateAndConvertTransaction(
    req: ValidateTransactionCurrencyRequest & { includeUsd?: boolean },
  ): Promise<ValidatedTransactionCurrency> {
    const result = this.validateTransactionCurrency(req);
    if (!result.valid || !req.includeUsd) {
      return result;
    }

    if (result.currency === Currency.XLM) {
      const snapshot = await this.priceFeedService.getXlmUsdPrice();
      result.amountUsd = convertXlmToUsd(result.amount, snapshot.priceUsd);
    } else if (result.currency === Currency.USD || result.currency === Currency.USDC) {
      result.amountUsd = roundToDecimals(result.amount, 2);
    }

    return result;
  }

  getCurrencyMetadataMap(): Record<string, typeof CURRENCY_METADATA[Currency]> {
    return { ...CURRENCY_METADATA };
  }
}
