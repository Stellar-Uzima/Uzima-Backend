/**
 * List of supported languages for the application
 * Used for frontend language selection dropdowns
 */

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  rtl?: boolean;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    rtl: true,
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
  },
  {
    code: 'ha',
    name: 'Hausa',
    nativeName: 'Hausa',
  },
  {
    code: 'yo',
    name: 'Yoruba',
    nativeName: 'Yorùbá',
  },
  {
    code: 'am',
    name: 'Amharic',
    nativeName: 'Amharic',
  },
  {
    code: 'ig',
    name: 'Igbo',
    nativeName: 'Igbo',
  },
  {
    code: 'zu',
    name: 'Zulu',
    nativeName: 'Zulu',
  },
  {
    code: 'so',
    name: 'Somali',
    nativeName: 'Somali',
  },
  {
    code: 'tw',
    name: 'Twi',
    nativeName: 'Twi',
  },
  {
    code: 'wo',
    name: 'Wolof',
    nativeName: 'Wolof',
  },
];
