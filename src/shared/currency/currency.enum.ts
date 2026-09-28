export enum Currency {
  XLM = 'XLM',
  USD = 'USD',
  USDC = 'USDC',
  NGN = 'NGN',
  KES = 'KES',
  GHS = 'GHS',
  UGX = 'UGX',
  TZS = 'TZS',
  ZAR = 'ZAR',
  EUR = 'EUR',
  GBP = 'GBP',
  CAD = 'CAD',
  AUD = 'AUD',
  JPY = 'JPY',
}

export interface CurrencyMetadata {
  code: Currency;
  symbol: string;
  name: string;
  decimals: number;
  isFiat: boolean;
  isStellarAsset: boolean;
  defaultLocale: string;
}

export const CURRENCY_METADATA: Record<Currency, CurrencyMetadata> = {
  [Currency.XLM]: {
    code: Currency.XLM,
    symbol: 'XLM',
    name: 'Stellar Lumens',
    decimals: 7,
    isFiat: false,
    isStellarAsset: true,
    defaultLocale: 'en-US',
  },
  [Currency.USD]: {
    code: Currency.USD,
    symbol: '$',
    name: 'US Dollar',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-US',
  },
  [Currency.USDC]: {
    code: Currency.USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    isFiat: false,
    isStellarAsset: true,
    defaultLocale: 'en-US',
  },
  [Currency.NGN]: {
    code: Currency.NGN,
    symbol: '₦',
    name: 'Nigerian Naira',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-NG',
  },
  [Currency.KES]: {
    code: Currency.KES,
    symbol: 'KSh',
    name: 'Kenyan Shilling',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'sw-KE',
  },
  [Currency.GHS]: {
    code: Currency.GHS,
    symbol: 'GH₵',
    name: 'Ghanaian Cedi',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-GH',
  },
  [Currency.UGX]: {
    code: Currency.UGX,
    symbol: 'USh',
    name: 'Ugandan Shilling',
    decimals: 0,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-UG',
  },
  [Currency.TZS]: {
    code: Currency.TZS,
    symbol: 'TSh',
    name: 'Tanzanian Shilling',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'sw-TZ',
  },
  [Currency.ZAR]: {
    code: Currency.ZAR,
    symbol: 'R',
    name: 'South African Rand',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-ZA',
  },
  [Currency.EUR]: {
    code: Currency.EUR,
    symbol: '€',
    name: 'Euro',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'de-DE',
  },
  [Currency.GBP]: {
    code: Currency.GBP,
    symbol: '£',
    name: 'British Pound Sterling',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-GB',
  },
  [Currency.CAD]: {
    code: Currency.CAD,
    symbol: 'C$',
    name: 'Canadian Dollar',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-CA',
  },
  [Currency.AUD]: {
    code: Currency.AUD,
    symbol: 'A$',
    name: 'Australian Dollar',
    decimals: 2,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'en-AU',
  },
  [Currency.JPY]: {
    code: Currency.JPY,
    symbol: '¥',
    name: 'Japanese Yen',
    decimals: 0,
    isFiat: true,
    isStellarAsset: false,
    defaultLocale: 'ja-JP',
  },
};

export const SUPPORTED_CURRENCIES: Currency[] = Object.values(Currency);

export function isSupportedCurrency(code: unknown): code is Currency {
  return typeof code === 'string' && Object.values(Currency).includes(code as Currency);
}

export function getCurrencyMetadata(code: Currency): CurrencyMetadata {
  const meta = CURRENCY_METADATA[code];
  if (!meta) {
    throw new Error(`Unsupported currency: ${code}`);
  }
  return meta;
}
