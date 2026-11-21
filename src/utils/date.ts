/**
 * Unified Date, Display Formatting, and Age Utilities for PhysioRecord.
 *
 * Ensures all clinical dates (session date, onset date, discharge date, assessment date)
 * use local calendar dates (critical for Iraq UTC+3 post-midnight charting) and all
 * date display uses Gregorian calendar with Latin digits ('ar-IQ-u-ca-gregory-nu-latn' / 'en-GB').
 */

/**
 * Returns a YYYY-MM-DD calendar date string in the user's local timezone.
 * If an ISO string or YYYY-MM-DD string is passed, parses it safely:
 * - If already YYYY-MM-DD, returns it directly.
 * - If an ISO timestamp, converts to local YYYY-MM-DD.
 */
export function localDate(input?: Date | string): string {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateParts(parsed);
    }
  }
  const d = input instanceof Date && !Number.isNaN(input.getTime()) ? input : new Date();
  return formatDateParts(d);
}

function formatDateParts(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type SupportedLocaleLang = 'ar' | 'en' | 'ckb';

export const IRAQI_MONTHS_AR: readonly string[] = [
  'كانون الثاني',
  'شباط',
  'آذار',
  'نيسان',
  'أيار',
  'حزيران',
  'تموز',
  'آب',
  'أيلول',
  'تشرين الأول',
  'تشرين الثاني',
  'كانون الأول',
];

export const MONTHS_EN_SHORT: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const MONTHS_EN_LONG: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const IRAQ_LATN_NUMBER_FORMATTER = new Intl.NumberFormat('ar-IQ-u-nu-latn');

export function formatIraqNumber(val: number): string {
  if (!Number.isFinite(val)) return '0';
  return IRAQ_LATN_NUMBER_FORMATTER.format(val);
}

function parseToDateObject(dateInput: string | Date | number | undefined | null): Date | null {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
      const [d, m, y] = trimmed.split('/').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
  }
  const dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return Number.isNaN(dateObj.getTime()) ? null : dateObj;
}

/**
 * Formats any date (YYYY-MM-DD, ISO, or Date) strictly as dd/mm/yyyy with Latin digits.
 */
export function formatDateDDMMYYYY(
  dateInput: string | Date | number | undefined | null
): string {
  if (!dateInput) return '—';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const dateObj = parseToDateObject(dateInput);
  if (!dateObj) return String(dateInput);
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear());
  return `${day}/${month}/${year}`;
}

/**
 * Formats time app-wide:
 * - Arabic ('ar'): 12h with ص/م and Latin digits (e.g., "09:30 ص", "02:15 م")
 * - English ('en'): 24h with Latin digits (e.g., "09:30", "14:15")
 */
export function formatTimeIraq(
  timeOrDate: string | Date | number | undefined | null,
  lang: SupportedLocaleLang = 'ar'
): string {
  if (!timeOrDate) return '—';

  let hours = 0;
  let minutes = 0;

  if (typeof timeOrDate === 'string') {
    const trimmed = timeOrDate.trim();
    const hmMatch = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (hmMatch) {
      hours = Number(hmMatch[1]);
      minutes = Number(hmMatch[2]);
    } else {
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return trimmed;
      hours = parsed.getHours();
      minutes = parsed.getMinutes();
    }
  } else {
    const d = timeOrDate instanceof Date ? timeOrDate : new Date(timeOrDate);
    if (Number.isNaN(d.getTime())) return '—';
    hours = d.getHours();
    minutes = d.getMinutes();
  }

  const mm = String(minutes).padStart(2, '0');

  if (lang === 'en') {
    const hh24 = String(hours).padStart(2, '0');
    return `${hh24}:${mm}`;
  }

  const period =
    lang === 'ckb'
      ? hours >= 12
        ? 'د.ن'
        : 'پ.ن'
      : hours >= 12
      ? 'م'
      : 'ص';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const hh12 = String(h12).padStart(2, '0');
  return `${hh12}:${mm} ${period}`;
}

export const IRAQI_MONTHS_CKB = [
  'کانوونی دووەم',
  'شوبات',
  'ئازار',
  'نیسان',
  'ئایار',
  'حوزەیران',
  'تەمموز',
  'ئاب',
  'ئەیلوول',
  'تشرینی یەکەم',
  'تشرینی دووەم',
  'کانوونی یەکەم',
] as const;

/**
 * Formats a date or timestamp using strictly Gregorian calendar + Latin digits
 * and Iraqi month names (كانون الثاني / کانوونی دووەم...) in Arabic & Kurdish Sorani.
 */
export function formatClinicalDate(
  dateInput: string | Date | number | undefined | null,
  lang: SupportedLocaleLang = 'ar',
  options?: { includeTime?: boolean; monthFormat?: 'short' | 'numeric' | 'long' }
): string {
  if (!dateInput) return '—';

  const dateObj = parseToDateObject(dateInput);
  if (!dateObj) {
    return String(dateInput);
  }

  const dayNum = dateObj.getDate();
  const dayPadded = String(dayNum).padStart(2, '0');
  const monthIdx = dateObj.getMonth();
  const monthPadded = String(monthIdx + 1).padStart(2, '0');
  const year = dateObj.getFullYear();

  const mf = options?.monthFormat ?? 'short';
  let datePart: string;

  if (mf === 'numeric') {
    datePart = `${dayPadded}/${monthPadded}/${year}`;
  } else if (lang === 'ar') {
    const iraqiMonth = IRAQI_MONTHS_AR[monthIdx] || monthPadded;
    datePart = `${dayNum} ${iraqiMonth} ${year}`;
  } else if (lang === 'ckb') {
    const ckbMonth = IRAQI_MONTHS_CKB[monthIdx] || monthPadded;
    datePart = `${dayNum} ${ckbMonth} ${year}`;
  } else {
    const enMonth = mf === 'long' ? MONTHS_EN_LONG[monthIdx] : MONTHS_EN_SHORT[monthIdx];
    datePart = `${dayPadded} ${enMonth} ${year}`;
  }

  if (options?.includeTime) {
    const timePart = formatTimeIraq(dateObj, lang);
    return `${datePart} · ${timePart}`;
  }

  return datePart;
}

/**
 * Iraqi Phone Helpers:
 * - Display mask: 07XX XXX XXXX (LTR)
 * - Canonical storage: +964 7XX XXX XXXX
 */
export function maskIraqiPhoneInput(raw: string | undefined | null): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00964')) {
    digits = '0' + digits.slice(5);
  } else if (digits.startsWith('964')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('7')) {
    digits = '0' + digits;
  }
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
}

export function normalizeIraqiPhoneStorage(raw: string | undefined | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00964')) {
    digits = digits.slice(5);
  } else if (digits.startsWith('964')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && digits.startsWith('7')) {
    return `+964 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  }
  return trimmed;
}

export function formatIraqiPhoneDisplay(raw: string | undefined | null): string {
  if (!raw) return '—';
  const masked = maskIraqiPhoneInput(raw);
  return masked || raw;
}

/**
 * Computes patient age dynamically from `dateOfBirth` (YYYY-MM-DD),
 * falling back to legacy `fallbackAge` only when `dateOfBirth` is missing or invalid.
 */
export function computePatientAge(
  dateOfBirth?: string | null,
  fallbackAge?: number | null,
  referenceDate: Date = new Date()
): number | undefined {
  if (dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
    const [birthYear, birthMonth, birthDay] = dateOfBirth.trim().split('-').map(Number);
    const refYear = referenceDate.getFullYear();
    const refMonth = referenceDate.getMonth() + 1;
    const refDay = referenceDate.getDate();

    let age = refYear - birthYear;
    if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
      age -= 1;
    }
    if (age >= 0 && age <= 130) {
      return age;
    }
  }

  if (typeof fallbackAge === 'number' && !Number.isNaN(fallbackAge) && fallbackAge >= 0) {
    return fallbackAge;
  }

  return undefined;
}

export type WeekdayNum = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAYS_IRAQI_ORDER: ReadonlyArray<{
  index: WeekdayNum;
  ar: string;
  shortAr: string;
  ckb: string;
  shortCkb: string;
  en: string;
  shortEn: string;
}> = [
  { index: 6, ar: 'السبت', shortAr: 'سبت', ckb: 'شەممە', shortCkb: 'شەم', en: 'Saturday', shortEn: 'Sat' },
  { index: 0, ar: 'الأحد', shortAr: 'أحد', ckb: 'یەکشەممە', shortCkb: 'یەکشەم', en: 'Sunday', shortEn: 'Sun' },
  { index: 1, ar: 'الإثنين', shortAr: 'إثنين', ckb: 'دووشەممە', shortCkb: 'دووشەم', en: 'Monday', shortEn: 'Mon' },
  { index: 2, ar: 'الثلاثاء', shortAr: 'ثلاثاء', ckb: 'سێشەممە', shortCkb: 'سێشەم', en: 'Tuesday', shortEn: 'Tue' },
  { index: 3, ar: 'الأربعاء', shortAr: 'أربعاء', ckb: 'چوارشەممە', shortCkb: 'چوارشەم', en: 'Wednesday', shortEn: 'Wed' },
  { index: 4, ar: 'الخميس', shortAr: 'خميس', ckb: 'پێنجشەممە', shortCkb: 'پێنجشەم', en: 'Thursday', shortEn: 'Thu' },
  { index: 5, ar: 'الجمعة', shortAr: 'جمعة', ckb: 'هەینی', shortCkb: 'هەینی', en: 'Friday', shortEn: 'Fri' },
];

export function getWeekdayFromDateStr(yyyyMmDd: string): WeekdayNum | null {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd.trim())) return null;
  const [y, m, d] = yyyyMmDd.trim().split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getDay() as WeekdayNum;
}

export function formatWeekdaysSummary(
  weekdays: WeekdayNum[],
  lang: SupportedLocaleLang = 'ar'
): string {
  const ordered = WEEKDAYS_IRAQI_ORDER.filter((w) => weekdays.includes(w.index));
  const sep = lang === 'en' ? ', ' : '، ';
  return ordered
    .map((w) => (lang === 'ar' ? w.ar : lang === 'ckb' ? w.ckb : w.shortEn))
    .join(sep);
}

export function addDaysToDateStr(yyyyMmDd: string, deltaDays: number): string {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd.trim())) {
    const dt = new Date();
    dt.setDate(dt.getDate() + deltaDays);
    return localDate(dt);
  }
  const [y, m, d] = yyyyMmDd.trim().split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays, 12, 0, 0);
  return localDate(dt);
}

/**
 * Normalizes Iraqi or international phone digits for WhatsApp (+964 default).
 * e.g. "0770 123 4567" -> "9647701234567"
 *      "+964 0770 123 4567" -> "9647701234567"
 *      "770 123 4567" -> "9647701234567"
 */
export function normalizePhoneDigitsForIraq(phone: string | undefined | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('96407') && digits.length === 14) {
    digits = `964${digits.slice(4)}`;
  } else if (digits.startsWith('07') && digits.length === 11) {
    digits = `964${digits.slice(1)}`;
  } else if (digits.startsWith('7') && digits.length === 10) {
    digits = `964${digits}`;
  }
  return digits;
}

export function formatPhoneIraqE164(phone: string | undefined | null): string | null {
  const digits = normalizePhoneDigitsForIraq(phone);
  return digits ? `+${digits}` : null;
}

/**
 * Pure WhatsApp deep-link builder (zero network requests).
 * Normalizes Iraqi local numbers (e.g. 0770 123 4567 -> 9647701234567) or E.164 digits.
 */
export function buildWhatsAppReminderUrl(
  phone: string | undefined | null,
  messageText: string
): string | null {
  const digits = normalizePhoneDigitsForIraq(phone);
  if (!digits) return null;
  const encoded = encodeURIComponent(messageText);
  return `https://wa.me/${digits}?text=${encoded}`;
}

// =======================================================================
// Pure Duration Input Draft Helpers
// =======================================================================

export const DEFAULT_DURATION_MIN = 5;
export const DEFAULT_DURATION_MAX = 240;
export const DEFAULT_DURATION_FALLBACK = 45;

/**
 * Sanitizes raw user typing into digits only (allowing empty string while clearing).
 */
export function sanitizeDurationDraft(raw: string, maxDigits = 3): string {
  const normalizedDigits = raw
    // Convert Arabic-Indic / Extended Arabic-Indic numerals if user types on Arabic/Kurdish keyboard
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d]/g, '');
  return normalizedDigits.slice(0, maxDigits);
}

/**
 * Parses and clamps a draft string on blur or form submission.
 */
export function commitDurationDraft(
  draft: string,
  options?: { min?: number; max?: number; fallback?: number }
): number {
  const min = options?.min ?? DEFAULT_DURATION_MIN;
  const max = options?.max ?? DEFAULT_DURATION_MAX;
  const fallback = options?.fallback ?? DEFAULT_DURATION_FALLBACK;
  const clean = sanitizeDurationDraft(draft, 4);
  if (!clean) return fallback;
  const parsed = Number.parseInt(clean, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
