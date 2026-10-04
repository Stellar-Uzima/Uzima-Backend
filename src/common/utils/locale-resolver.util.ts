/**
 * Resolves the locale to render user-facing text/emails in, given a
 * user's stored preference and the set of locales the app actually
 * ships translations for. Falls back to a well-defined default so
 * untranslated content never renders with an undefined locale.
 */
export const DEFAULT_LOCALE = 'en';

export function resolveLocale(
  supportedLocales: readonly string[],
  preferredLocale?: string | null,
): string {
  if (!supportedLocales.includes(DEFAULT_LOCALE)) {
    throw new Error('DEFAULT_LOCALE must be included in supportedLocales');
  }

  if (!preferredLocale) {
    return DEFAULT_LOCALE;
  }

  const normalized = preferredLocale.toLowerCase();
  const exact = supportedLocales.find((l) => l.toLowerCase() === normalized);
  if (exact) return exact;

  const base = normalized.split('-')[0];
  const baseMatch = supportedLocales.find(
    (l) => l.toLowerCase().split('-')[0] === base,
  );
  return baseMatch ?? DEFAULT_LOCALE;
}
