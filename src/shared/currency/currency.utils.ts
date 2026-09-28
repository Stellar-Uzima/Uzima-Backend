import { Currency, getCurrencyMetadata, isSupportedCurrency } from './currency.enum';

export interface FormatAmountOptions {
  locale?: string;
  symbol?: boolean;
  compact?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  style?: 'currency' | 'decimal';
}

export interface ConversionResult {
  amount: number;
  currency: Currency;
  amountUsd?: number;
  rateApplied?: number;
  rateSource?: string;
  rateFetchedAt?: string;
}

export function formatAmount(
  amount: number,
  currency: Currency,
  options: FormatAmountOptions = {},
): string {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number');
  }
  if (!isSupportedCurrency(currency)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const meta = getCurrencyMetadata(currency);
  const locale = options.locale ?? meta.defaultLocale;
  const style = options.style ?? (options.symbol === false ? 'decimal' : 'currency');

  const minimumFractionDigits = options.minimumFractionDigits ?? Math.min(meta.decimals, 2);
  const maximumFractionDigits = options.maximumFractionDigits ?? meta.decimals;

  const notation = options.compact ? ('compact' as const) : ('standard' as const);

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style,
      currency,
      currencyDisplay: style === 'currency' ? 'symbol' : 'code',
      minimumFractionDigits,
      maximumFractionDigits,
      notation,
      useGrouping: true,
    });
    return formatter.format(amount);
  } catch {
    const symbol = options.symbol === false ? '' : (meta.symbol ? `${meta.symbol} ` : `${meta.code} `);
    const fixed = amount.toFixed(maximumFractionDigits);
    return `${symbol}${Number(fixed).toLocaleString(locale, {
      minimumFractionDigits,
      maximumFractionDigits,
    })}`;
  }
}

export function formatAmountCompact(
  amount: number,
  currency: Currency,
  locale?: string,
): string {
  return formatAmount(amount, currency, { locale, compact: true });
}

export function validateCurrencyAmount(
  amount: unknown,
  currency: Currency,
): { valid: boolean; amount?: number; error?: string } {
  const meta = getCurrencyMetadata(currency);
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return { valid: false, error: 'Amount must be a finite number' };
  }
  if (amount < 0) {
    return { valid: false, error: 'Amount cannot be negative' };
  }
  const factor = 10 ** meta.decimals;
  const scaled = Math.round(amount * factor);
  if (!Number.isFinite(scaled)) {
    return { valid: false, error: 'Amount out of range for currency decimals' };
  }
  const normalized = scaled / factor;
  return { valid: true, amount: normalized };
}

export function convertXlmToUsd(xlmAmount: number, xlmUsdPrice: number): number {
  if (!Number.isFinite(xlmAmount) || xlmAmount < 0) {
    throw new Error('XLM amount must be a non-negative finite number');
  }
  if (!Number.isFinite(xlmUsdPrice) || xlmUsdPrice <= 0) {
    throw new Error('XLM/USD price must be a positive finite number');
  }
  return roundToDecimals(xlmAmount * xlmUsdPrice, 2);
}

export function convertUsdToXlm(usdAmount: number, xlmUsdPrice: number): number {
  if (!Number.isFinite(usdAmount) || usdAmount < 0) {
    throw new Error('USD amount must be a non-negative finite number');
  }
  if (!Number.isFinite(xlmUsdPrice) || xlmUsdPrice <= 0) {
    throw new Error('XLM/USD price must be a positive finite number');
  }
  return roundToDecimals(usdAmount / xlmUsdPrice, 7);
}

export function convertXlmToFiat(
  xlmAmount: number,
  xlmUsdPrice: number,
  fiatUsdRate: number,
  decimals = 2,
): number {
  const usd = convertXlmToUsd(xlmAmount, xlmUsdPrice);
  return roundToDecimals(usd * fiatUsdRate, decimals);
}

export function convertFiatToXlm(
  fiatAmount: number,
  xlmUsdPrice: number,
  fiatUsdRate: number,
): number {
  if (!Number.isFinite(fiatUsdRate) || fiatUsdRate <= 0) {
    throw new Error('Fiat/USD rate must be a positive finite number');
  }
  const usd = fiatAmount / fiatUsdRate;
  return convertUsdToXlm(usd, xlmUsdPrice);
}

export function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function detectDefaultCurrency(countryCode?: string, preferredLanguage?: string): Currency {
  if (!countryCode && !preferredLanguage) {
    return Currency.USD;
  }
  const country = (countryCode ?? '').toUpperCase();
  const lang = (preferredLanguage ?? '').toLowerCase();

  const countryMap: Record<string, Currency> = {
    NG: Currency.NGN,
    KE: Currency.KES,
    GH: Currency.GHS,
    UG: Currency.UGX,
    TZ: Currency.TZS,
    ZA: Currency.ZAR,
    US: Currency.USD,
    GB: Currency.GBP,
    CA: Currency.CAD,
    AU: Currency.AUD,
    JP: Currency.JPY,
    DE: Currency.EUR,
    FR: Currency.EUR,
    IT: Currency.EUR,
    ES: Currency.EUR,
    NL: Currency.EUR,
    BE: Currency.EUR,
    PT: Currency.EUR,
    IE: Currency.EUR,
    AT: Currency.EUR,
    FI: Currency.EUR,
  };

  if (country && countryMap[country]) {
    return countryMap[country];
  }

  if (lang.startsWith('en-ng') || lang === 'yo' || lang === 'ha' || lang === 'ig') {
    return Currency.NGN;
  }
  if (lang.startsWith('sw') || lang.startsWith('en-ke')) {
    return Currency.KES;
  }
  if (lang.startsWith('en-gh')) {
    return Currency.GHS;
  }
  if (lang.startsWith('en-ug')) {
    return Currency.UGX;
  }
  if (lang.startsWith('en-tz')) {
    return Currency.TZS;
  }
  if (lang.startsWith('en-za') || lang.startsWith('af')) {
    return Currency.ZAR;
  }
  if (lang.startsWith('en-gb')) {
    return Currency.GBP;
  }
  if (lang.startsWith('ja')) {
    return Currency.JPY;
  }
  if (lang.startsWith('de') || lang.startsWith('fr') || lang.startsWith('it') || lang.startsWith('es')) {
    return Currency.EUR;
  }

  return Currency.USD;
}
