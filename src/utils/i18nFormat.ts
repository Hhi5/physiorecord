// =======================================================================
// PhysioRecord — Intl Locale Formatters (5.8)
// Standard browser Intl formatting for Arabic (Iraq), English, and
// RTL-ready Kurdish Sorani (ckb-IQ) with graceful runtime fallback.
// =======================================================================

export type AppLocaleCode = 'ar' | 'en' | 'ckb';

export function isRtlLanguage(lang: AppLocaleCode): boolean {
  return lang === 'ar' || lang === 'ckb';
}

export function getIntlLocaleTag(lang: AppLocaleCode): string {
  if (lang === 'en') return 'en-GB';
  if (lang === 'ckb') return 'ckb-IQ-u-ca-gregory-nu-latn';
  return 'ar-IQ-u-ca-gregory-nu-latn';
}

export function formatIntlNumber(
  value: number,
  lang: AppLocaleCode,
  options?: Intl.NumberFormatOptions
): string {
  const safe = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat(getIntlLocaleTag(lang), options).format(safe);
  } catch {
    return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ar-IQ-u-nu-latn', options).format(safe);
  }
}

export function formatIntlDate(
  dateInput: Date | string,
  lang: AppLocaleCode,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  const d =
    typeof dateInput === 'string'
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? `${dateInput}T12:00:00` : dateInput)
      : dateInput;
  if (Number.isNaN(d.getTime())) return String(dateInput);
  try {
    return new Intl.DateTimeFormat(getIntlLocaleTag(lang), options).format(d);
  } catch {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ar-IQ-u-ca-gregory-nu-latn', options).format(d);
  }
}

export function formatIntlPercent(ratioPercent: number, lang: AppLocaleCode): string {
  const safe = Number.isFinite(ratioPercent) ? ratioPercent : 0;
  try {
    return new Intl.NumberFormat(getIntlLocaleTag(lang), {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(safe / 100);
  } catch {
    return `${Math.round(safe)}%`;
  }
}
