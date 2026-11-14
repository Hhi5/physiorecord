// =======================================================================
// PhysioRecord — Iraq Schedule, Locations, Home Visits & Hijri Utilities (Phase C1–C3)
// Pure offline helpers: zero network requests, strict Latin digits, RTL-safe.
// =======================================================================

import type {
  ClinicAppointment,
  ClosedDateRangeEntry,
  HomeVisitAddress,
  PracticeLocationItem,
  PracticeLocationType,
  WeekdayIndex,
  WeeklyBreakWindow,
} from '../types/clinicManagement';
import { formatDateDDMMYYYY, type SupportedLocaleLang } from './date';

export const IRAQ_GOVERNORATES: ReadonlyArray<{ ar: string; en: string }> = [
  { ar: 'بغداد', en: 'Baghdad' },
  { ar: 'البصرة', en: 'Basra' },
  { ar: 'نينوى', en: 'Nineveh' },
  { ar: 'أربيل', en: 'Erbil' },
  { ar: 'النجف', en: 'Najaf' },
  { ar: 'كربلاء', en: 'Karbala' },
  { ar: 'بابل', en: 'Babil' },
  { ar: 'الأنبار', en: 'Anbar' },
  { ar: 'ديالى', en: 'Diyala' },
  { ar: 'كركوك', en: 'Kirkuk' },
  { ar: 'السليمانية', en: 'Sulaymaniyah' },
  { ar: 'دهوك', en: 'Duhok' },
  { ar: 'واسط', en: 'Wasit' },
  { ar: 'ميسان', en: 'Maysan' },
  { ar: 'ذي قار', en: 'Dhi Qar' },
  { ar: 'المثنى', en: 'Muthanna' },
  { ar: 'القادسية', en: 'Al-Qadisiyah' },
  { ar: 'صلاح الدين', en: 'Saladin' },
];

export const PRACTICE_LOCATION_TYPE_LABELS: Record<
  PracticeLocationType,
  { ar: string; en: string }
> = {
  clinic: { ar: 'عيادة رئيسية', en: 'Main Clinic' },
  home_visits: { ar: 'زيارات منزلية', en: 'Home Visits' },
  hospital: { ar: 'مستشفى', en: 'Hospital' },
  second_clinic: { ar: 'عيادة فرعية', en: 'Second Clinic' },
};

export function hasHomeVisitAddress(addr?: HomeVisitAddress | null): boolean {
  if (!addr) return false;
  return Boolean(
    addr.governorate?.trim() || addr.area?.trim() || addr.nearestLandmark?.trim()
  );
}

export function formatHomeVisitAddressDisplay(
  addr: HomeVisitAddress | undefined | null
): string {
  if (!addr) return '';
  return [addr.governorate, addr.area, addr.nearestLandmark]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' — ');
}

/**
 * Pure URL builder for user-initiated external Google Maps search.
 * Constructs the query strictly from typed landmark address fields
 * (governorate, area, nearestLandmark) — never sends patient names or notes,
 * and performs ZERO network requests.
 */
export function buildGoogleMapsSearchUrl(addr?: HomeVisitAddress | null): string {
  if (!addr) return '';
  const parts = [addr.governorate, addr.area, addr.nearestLandmark]
    .map((part) => (part || '').trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

export function resolveDefaultLocationId(
  locations: PracticeLocationItem[],
  mode: 'clinic' | 'home_visit' = 'clinic'
): string {
  const active = locations.filter((l) => l.isActive !== false);
  const pool = active.length > 0 ? active : locations;
  if (mode === 'home_visit') {
    const homeLoc =
      pool.find((l) => l.id === 'loc_home_visits') ||
      pool.find((l) => l.type === 'home_visits');
    if (homeLoc) return homeLoc.id;
  }
  const defaultLoc =
    pool.find((l) => l.isDefault) ||
    pool.find((l) => l.type !== 'home_visits') ||
    pool[0];
  return defaultLoc?.id || 'loc_main_clinic';
}

export function resolveAppointmentLocationId(
  appt: Pick<ClinicAppointment, 'locationId' | 'appointmentMode'>,
  locations: PracticeLocationItem[]
): string {
  if (appt.locationId && appt.locationId.trim()) {
    return appt.locationId.trim();
  }
  return resolveDefaultLocationId(
    locations,
    appt.appointmentMode === 'home_visit' ? 'home_visit' : 'clinic'
  );
}

export function getPracticeLocationLabel(
  locationId: string | undefined,
  locations: PracticeLocationItem[],
  isAr: boolean
): string {
  if (!locationId) {
    const def = locations.find((l) => l.isDefault) || locations[0];
    return def ? (isAr ? def.nameAr : def.nameEn) : isAr ? 'العيادة الرئيسية' : 'Main Clinic';
  }
  const found = locations.find((l) => l.id === locationId);
  if (found) {
    return isAr ? found.nameAr || found.nameEn : found.nameEn || found.nameAr;
  }
  if (locationId === 'loc_home_visits') {
    return isAr ? 'زيارات منزلية' : 'Home Visits';
  }
  if (locationId === 'loc_main_clinic') {
    return isAr ? 'العيادة الرئيسية' : 'Main Clinic';
  }
  return locationId;
}

export interface LocationAppointmentSummaryItem {
  locationId: string;
  nameAr: string;
  nameEn: string;
  type: PracticeLocationItem['type'];
  totalCount: number;
  activeCount: number;
  completedCount: number;
  cancelledOrNoShowCount: number;
}

export function summarizeAppointmentsByLocation(
  appointments: ClinicAppointment[],
  locations: PracticeLocationItem[]
): LocationAppointmentSummaryItem[] {
  const bucketMap = new Map<string, LocationAppointmentSummaryItem>();

  for (const loc of locations) {
    if (loc.isActive === false) continue;
    bucketMap.set(loc.id, {
      locationId: loc.id,
      nameAr: loc.nameAr,
      nameEn: loc.nameEn,
      type: loc.type,
      totalCount: 0,
      activeCount: 0,
      completedCount: 0,
      cancelledOrNoShowCount: 0,
    });
  }

  for (const appt of appointments) {
    const resolvedId = resolveAppointmentLocationId(appt, locations);
    let bucket = bucketMap.get(resolvedId);
    if (!bucket) {
      const known = locations.find((l) => l.id === resolvedId);
      bucket = {
        locationId: resolvedId,
        nameAr: known?.nameAr || resolvedId,
        nameEn: known?.nameEn || resolvedId,
        type: known?.type || (appt.appointmentMode === 'home_visit' ? 'home_visits' : 'clinic'),
        totalCount: 0,
        activeCount: 0,
        completedCount: 0,
        cancelledOrNoShowCount: 0,
      };
      bucketMap.set(resolvedId, bucket);
    }

    bucket.totalCount += 1;
    if (appt.status === 'cancelled' || appt.status === 'no_show') {
      bucket.cancelledOrNoShowCount += 1;
    } else {
      bucket.activeCount += 1;
      if (appt.status === 'completed') {
        bucket.completedCount += 1;
      }
    }
  }

  return Array.from(bucketMap.values());
}

/**
 * Formats a calendar date in the Hijri (Islamic) calendar using pure browser Intl.
 * Returns '' gracefully on any unsupported locale/runtime error.
 */
export function formatHijriDate(
  dateInput: string | Date | undefined | null,
  lang: SupportedLocaleLang = 'ar'
): string {
  if (!dateInput) return '';
  let dt: Date;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      dt = new Date(y, m - 1, d, 12, 0, 0);
    } else {
      dt = new Date(trimmed);
    }
  } else {
    dt = dateInput;
  }

  if (Number.isNaN(dt.getTime())) return '';

  const locales =
    lang === 'en' ? ['en-GB', 'en-US'] : ['ar-IQ-u-nu-latn', 'ar-SA-u-nu-latn'];

  for (const locale of locales) {
    try {
      const fmt = new Intl.DateTimeFormat(locale, {
        calendar: 'islamic',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const resolvedCal = fmt.resolvedOptions().calendar || '';
      if (resolvedCal.startsWith('islamic')) {
        return fmt.format(dt);
      }
    } catch {
      // Try next fallback locale or return ''
    }
  }

  return '';
}

export function parseHhMmToMinutesSafe(hhmm: string): number {
  const [hStr, mStr] = (hhmm || '00:00').split(':');
  const h = Math.max(0, Math.min(23, parseInt(hStr || '0', 10) || 0));
  const m = Math.max(0, Math.min(59, parseInt(mStr || '0', 10) || 0));
  return h * 60 + m;
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return false;
  }
  return parseHhMmToMinutesSafe(endTime) > parseHhMmToMinutesSafe(startTime);
}

export function formatClosedDateRangeSummary(entry: ClosedDateRangeEntry): string {
  const start = formatDateDDMMYYYY(entry.startDate);
  const end = entry.endDate ? formatDateDDMMYYYY(entry.endDate) : start;
  if (!entry.endDate || entry.endDate === entry.startDate) {
    return start;
  }
  return `${start} — ${end}`;
}

export function getWeeklyBreakConflictsForRecurring(
  weekdays: WeekdayIndex[],
  startTime: string,
  durationMinutes: number,
  weeklyBreaks: WeeklyBreakWindow[]
): WeeklyBreakWindow[] {
  if (weekdays.length === 0) return [];
  const slotStart = parseHhMmToMinutesSafe(startTime);
  const slotEnd = slotStart + Math.max(5, durationMinutes || 45);
  return weeklyBreaks.filter((brk) => {
    if (!brk.isActive) return false;
    if (!brk.weekdays.some((wd) => weekdays.includes(wd))) return false;
    const brkStart = parseHhMmToMinutesSafe(brk.startTime);
    const brkEnd = parseHhMmToMinutesSafe(brk.endTime);
    return slotStart < brkEnd && brkStart < slotEnd;
  });
}

export function getWeeklyBreaksForHour(
  weekday: WeekdayIndex | null,
  hour: number,
  weeklyBreaks: WeeklyBreakWindow[]
): WeeklyBreakWindow[] {
  if (weekday === null) return [];
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  return weeklyBreaks.filter((brk) => {
    if (!brk.isActive || !brk.weekdays.includes(weekday)) return false;
    const brkStart = parseHhMmToMinutesSafe(brk.startTime);
    const brkEnd = parseHhMmToMinutesSafe(brk.endTime);
    return hourStart < brkEnd && brkStart < hourEnd;
  });
}
