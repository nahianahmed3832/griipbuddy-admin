export function canonicalCategoryLocale(raw: string): string | null {
  const locale = raw.trim();
  if (!locale || locale.length > 35) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    return canonical && canonical.length <= 35 ? canonical : null;
  } catch {
    return null;
  }
}

export function catalogLocaleChain(raw: string): string[] {
  const locale = canonicalCategoryLocale(raw);
  return locale ? [...new Set([locale, new Intl.Locale(locale).language])] : [];
}
