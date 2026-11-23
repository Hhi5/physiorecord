// =======================================================================
// PhysioRecord — Phase E Sharing & Interop Pure Logic (E1–E4)
// - E1: Web Share API (files + text) with +964 WhatsApp & clipboard fallbacks
// - E2: Offline RFC 5545 .ics calendar generator with explicit privacy filter
// - E3: Patient Visit Card summary & tomorrow schedule helpers
// - E4: 3-point angle geometry & annotated encrypted copy image compositor
// Zero runtime network calls; zero external dependencies.
// =======================================================================

import type {
  ClinicAppointment,
  FinancialInvoiceIQD,
  IcsExportFieldOptions,
  PatientVisitCardSummary,
  PhotoAngleMeasurement,
  PhotoAnnotationState,
  PhotoArrowAnnotation,
  PhotoCalibrationScale,
  PhotoCobbAngleMeasurement,
  PhotoDistanceMeasurement,
  PhotoPoint2D,
} from '../types/clinicManagement';
import {
  buildWhatsAppReminderUrl,
  formatDateDDMMYYYY,
  formatTimeIraq,
  localDate,
} from './date';
import {
  ATTACHMENT_MAX_DIMENSION_PX,
  ATTACHMENT_THUMBNAIL_MAX_PX,
  estimateDataUrlBytes,
  isSafeAttachmentDataUrl,
} from './attachmentMedia';
import { formatHomeVisitAddressDisplay } from './iraqScheduleLocationsC1C3';
import { shareGeneratedFileOnAndroid } from '../platform/nativeBridge';
import { sanitizeExportedDocumentHtml } from './securityHardening';

// =======================================================================
// E1: Web Share API (file + text) with +964 WhatsApp & Copy Fallbacks
// =======================================================================

export interface ShareNavigatorLike {
  share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[]; title?: string; text?: string }) => boolean;
  clipboard?: {
    writeText?: (text: string) => Promise<void>;
  };
}

export function canUseWebShareApi(nav?: ShareNavigatorLike | null): boolean {
  const target =
    nav === undefined
      ? typeof navigator !== 'undefined'
        ? (navigator as unknown as ShareNavigatorLike)
        : null
      : nav;
  return Boolean(target && typeof target.share === 'function');
}

export function canShareFilesWithWebShare(
  file: File,
  nav?: ShareNavigatorLike | null
): boolean {
  const target =
    nav === undefined
      ? typeof navigator !== 'undefined'
        ? (navigator as unknown as ShareNavigatorLike)
        : null
      : nav;
  if (!target || typeof target.share !== 'function' || typeof target.canShare !== 'function') {
    return false;
  }
  try {
    return Boolean(target.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

function escapeHtmlBasic(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildShareableDocumentHtmlString(params: {
  title: string;
  docType: string;
  sheetHtml: string;
  dir: 'rtl' | 'ltr';
  lang: 'ar' | 'en';
}): string {
  const safeTitle = escapeHtmlBasic(params.title);
  // Strip active HTML vectors (scripts, iframes, inline on* handlers, javascript:/data:text/html URIs)
  const sanitizedSheet = sanitizeExportedDocumentHtml(params.sheetHtml);

  return `<!DOCTYPE html>
<html lang="${params.lang}" dir="${params.dir}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'self' data:;" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: #f8fafc;
      color: #0f172a;
      font-family: system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif;
      font-size: 13px;
      line-height: 1.65;
    }
    .sheet-wrap {
      max-width: 210mm;
      min-height: 272mm;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-top: 4px solid #0f172a;
      padding: 32px 38px;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #1e293b; padding-bottom: 14px; margin-bottom: 16px; }
    footer { margin-top: auto; padding-top: 18px; border-top: 2px solid #1e293b; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 8px; }
    th, td { border: 1px solid #94a3b8; padding: 7px 10px; text-align: start; font-size: 12px; }
    th { background: #f1f5f9; font-weight: 700; }
    img { max-width: 100%; height: auto; }
    @media print {
      @page { size: A4; margin: 12mm; }
      body { background: #ffffff; padding: 0; }
      .sheet-wrap { box-shadow: none; border: none; border-top: 3px solid #0f172a; padding: 4mm 2mm; max-width: none; min-height: 268mm; }
    }
  </style>
</head>
<body data-doc-type="${escapeHtmlBasic(params.docType)}">
  <div class="sheet-wrap">
    ${sanitizedSheet}
  </div>
</body>
</html>`;
}

export function buildShareableDocumentHtmlFile(params: {
  title: string;
  docType: string;
  sheetHtml: string;
  dir: 'rtl' | 'ltr';
  lang: 'ar' | 'en';
  fileNameBase: string;
}): File {
  const safeBase =
    params.fileNameBase
      .trim()
      .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'physiorecord-document';
  const html = buildShareableDocumentHtmlString(params);

  const fileName = `${safeBase}.html`;
  if (typeof File !== 'undefined') {
    return new File([html], fileName, { type: 'text/html;charset=utf-8' });
  }
  const blobFallback = new Blob([html], { type: 'text/html;charset=utf-8' }) as unknown as File & {
    name: string;
    lastModified: number;
  };
  Object.defineProperty(blobFallback, 'name', { value: fileName });
  Object.defineProperty(blobFallback, 'lastModified', { value: Date.now() });
  return blobFallback;
}

export function buildDocumentShareSummaryText(params: {
  docTitle: string;
  clinicName: string;
  patientName?: string;
  amountFormatted?: string;
  nextAppointmentText?: string;
  remainingSessions?: number;
  lang: 'ar' | 'en';
}): string {
  const isAr = params.lang !== 'en';
  const lines: string[] = [];
  if (params.clinicName.trim()) {
    lines.push(params.clinicName.trim());
  }
  lines.push(params.docTitle.trim());
  if (params.patientName?.trim()) {
    lines.push(
      isAr ? `المريض: ${params.patientName.trim()}` : `Patient: ${params.patientName.trim()}`
    );
  }
  if (params.amountFormatted?.trim()) {
    lines.push(
      isAr
        ? `المبلغ: ${params.amountFormatted.trim()}`
        : `Amount: ${params.amountFormatted.trim()}`
    );
  }
  if (params.nextAppointmentText?.trim()) {
    lines.push(
      isAr
        ? `الموعد القادم: ${params.nextAppointmentText.trim()}`
        : `Next Appointment: ${params.nextAppointmentText.trim()}`
    );
  }
  if (typeof params.remainingSessions === 'number' && params.remainingSessions >= 0) {
    lines.push(
      isAr
        ? `الجلسات المتبقية بالكورس: ${params.remainingSessions}`
        : `Remaining Package Sessions: ${params.remainingSessions}`
    );
  }
  return lines.join('\n');
}

export function buildDocumentWhatsAppFallbackUrl(
  patientPhone: string | undefined | null,
  summaryText: string
): string | null {
  const cleanText = summaryText.trim();
  const specific = buildWhatsAppReminderUrl(patientPhone, cleanText);
  if (specific) return specific;
  if (!cleanText) return null;
  return `https://wa.me/?text=${encodeURIComponent(cleanText)}`;
}

export async function shareDocumentViaWebShareOrFallback(params: {
  title: string;
  text: string;
  file?: File;
  patientPhone?: string | null;
  navigatorObj?: ShareNavigatorLike | null;
}): Promise<{
  method: 'web_share_file' | 'web_share_text' | 'whatsapp_url' | 'clipboard';
  whatsappUrl: string | null;
  copiedText: string;
}> {
  const nav =
    params.navigatorObj === undefined
      ? typeof navigator !== 'undefined'
        ? (navigator as unknown as ShareNavigatorLike)
        : null
      : params.navigatorObj;
  const phoneSpecificWa = buildWhatsAppReminderUrl(params.patientPhone, params.text);
  const whatsappUrl = buildDocumentWhatsAppFallbackUrl(params.patientPhone, params.text);

  if (params.file && params.navigatorObj === undefined) {
    try {
      const fileContent =
        typeof params.file.text === 'function' ? await params.file.text() : '';
      if (fileContent) {
        const sharedNatively = await shareGeneratedFileOnAndroid({
          filename: params.file.name || 'physiorecord-document.html',
          content: fileContent,
          mimeType: params.file.type || 'text/html',
          title: params.title,
          text: params.text,
        });
        if (sharedNatively) {
          return {
            method: 'web_share_file',
            whatsappUrl,
            copiedText: params.text,
          };
        }
      }
    } catch {
      // Fall through to standard Web Share API
    }
  }

  if (params.file && canShareFilesWithWebShare(params.file, nav) && nav?.share) {
    try {
      await nav.share({
        title: params.title,
        text: params.text,
        files: [params.file],
      });
      return {
        method: 'web_share_file',
        whatsappUrl,
        copiedText: params.text,
      };
    } catch (err) {
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
        return {
          method: 'web_share_file',
          whatsappUrl,
          copiedText: params.text,
        };
      }
    }
  }

  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({
        title: params.title,
        text: params.text,
      });
      return {
        method: 'web_share_text',
        whatsappUrl,
        copiedText: params.text,
      };
    } catch (err) {
      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
        return {
          method: 'web_share_text',
          whatsappUrl,
          copiedText: params.text,
        };
      }
    }
  }

  let copied = false;
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(params.text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (phoneSpecificWa) {
    return {
      method: 'whatsapp_url',
      whatsappUrl: phoneSpecificWa,
      copiedText: params.text,
    };
  }

  return {
    method: copied || !whatsappUrl ? 'clipboard' : 'whatsapp_url',
    whatsappUrl,
    copiedText: params.text,
  };
}

// =======================================================================
// E2: Privacy-First Offline .ics Calendar Generator
// =======================================================================

export const DEFAULT_ICS_EXPORT_OPTIONS: IcsExportFieldOptions = {
  includePatientName: true,
  includePatientPhone: false,
  includeTherapistName: true,
  includeLocationAndRoom: true,
  includeVisitTypeAndNotes: false,
  includeReminderAlarmMinutes: 30,
};

export function findNextUpcomingAppointment(
  appointments: ClinicAppointment[],
  opts?: { patientId?: string; fromDate?: string; fromTime?: string }
): ClinicAppointment | null {
  const hasCustomDate = Boolean(opts?.fromDate);
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const fromDate = opts?.fromDate || localDate(now);
  const fromTime = opts?.fromTime ?? (hasCustomDate ? '00:00' : defaultTime);

  const candidates = appointments
    .filter((appt) => {
      if (appt.status === 'cancelled' || appt.status === 'no_show') return false;
      if (opts?.patientId && appt.patientId !== opts.patientId) return false;
      if (appt.date > fromDate) return true;
      if (appt.date === fromDate) {
        return (appt.startTime || '00:00') >= fromTime;
      }
      return false;
    })
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });

  return candidates[0] || null;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsLocalTimestamp(dateStr: string, timeStr: string, addMinutes = 0): string {
  const [yRaw, mRaw, dRaw] = dateStr.split('-').map((n) => Number.parseInt(n, 10));
  const [hhRaw, mmRaw] = (timeStr || '09:00').split(':').map((n) => Number.parseInt(n, 10));
  const year = Number.isFinite(yRaw) ? yRaw : 2026;
  const month = Number.isFinite(mRaw) ? mRaw : 1;
  const day = Number.isFinite(dRaw) ? dRaw : 1;
  const hour = Number.isFinite(hhRaw) ? hhRaw : 9;
  const min = Number.isFinite(mmRaw) ? mmRaw : 0;

  const totalMinutes = hour * 60 + min + addMinutes;
  const dayOffset = Math.floor(totalMinutes / 1440);
  const remMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const endHour = Math.floor(remMinutes / 60);
  const endMin = remMinutes % 60;

  const dt = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const yy = String(dt.getUTCFullYear()).padStart(4, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`;
}

function formatIcsUtcStamp(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

export function buildIcsCalendarContent(params: {
  appointments: ClinicAppointment[];
  options: IcsExportFieldOptions;
  lang: 'ar' | 'en';
  calendarName?: string;
}): string {
  const isAr = params.lang !== 'en';
  const activeAppointments = params.appointments.filter((a) => a.status !== 'cancelled');
  const dtStamp = formatIcsUtcStamp();
  const calName =
    params.calendarName?.trim() ||
    (isAr ? 'مواعيد PhysioRecord' : 'PhysioRecord Schedule');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PhysioRecord//OfflineCalendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];

  for (const appt of activeAppointments) {
    const dtStart = formatIcsLocalTimestamp(appt.date, appt.startTime || '09:00', 0);
    const dtEnd = formatIcsLocalTimestamp(
      appt.date,
      appt.startTime || '09:00',
      Math.max(5, appt.durationMinutes || 30)
    );

    const summary = params.options.includePatientName
      ? isAr
        ? `جلسة علاج طبيعي — ${appt.patientName}`
        : `Physiotherapy Session — ${appt.patientName}`
      : isAr
        ? 'موعد جلسة علاج طبيعي'
        : 'Physiotherapy Appointment';

    const descParts: string[] = [];
    if (params.options.includePatientPhone && appt.patientPhone) {
      descParts.push(
        isAr ? `الهاتف: ${appt.patientPhone}` : `Phone: ${appt.patientPhone}`
      );
    }
    if (params.options.includeTherapistName && appt.therapistName) {
      descParts.push(
        isAr ? `المعالج: ${appt.therapistName}` : `Therapist: ${appt.therapistName}`
      );
    }
    if (params.options.includeVisitTypeAndNotes) {
      const visitLabel =
        appt.visitType === 'initial_evaluation'
          ? isAr
            ? 'تقييم أولي'
            : 'Initial Evaluation'
          : appt.visitType === 're_evaluation'
            ? isAr
              ? 'إعادة تقييم'
              : 'Re-evaluation'
            : isAr
              ? 'جلسة متابعة'
              : 'Follow-up';
      descParts.push(isAr ? `نوع الزيارة: ${visitLabel}` : `Visit Type: ${visitLabel}`);
      if (appt.episodeTitle) {
        descParts.push(isAr ? `الحلقة: ${appt.episodeTitle}` : `Episode: ${appt.episodeTitle}`);
      }
      if (appt.notes) {
        descParts.push(isAr ? `ملاحظات: ${appt.notes}` : `Notes: ${appt.notes}`);
      }
    }

    const locationParts: string[] = [];
    if (params.options.includeLocationAndRoom) {
      if (appt.roomOrBed) locationParts.push(appt.roomOrBed);
      if (appt.appointmentMode === 'home_visit') {
        const hv = formatHomeVisitAddressDisplay(appt.homeVisitAddress);
        locationParts.push(hv || (isAr ? 'زيارة منزلية' : 'Home Visit'));
      }
    }

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(`${appt.id}@physiorecord.local`)}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (locationParts.length > 0) {
      lines.push(`LOCATION:${escapeIcsText(locationParts.join(' — '))}`);
    }
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n'))}`);
    }
    if (
      typeof params.options.includeReminderAlarmMinutes === 'number' &&
      params.options.includeReminderAlarmMinutes > 0
    ) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(
        `TRIGGER:-PT${Math.round(params.options.includeReminderAlarmMinutes)}M`
      );
      lines.push(`DESCRIPTION:${escapeIcsText(summary)}`);
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

// =======================================================================
// E3: Patient Visit Card Summary Calculator
// =======================================================================

export function computePatientVisitCardSummary(params: {
  patientId: string;
  patientName: string;
  patientMrn?: string;
  patientPhone?: string;
  appointments: ClinicAppointment[];
  invoices: FinancialInvoiceIQD[];
  referenceDateStr?: string;
}): PatientVisitCardSummary {
  const refDate = params.referenceDateStr || localDate();
  const upcomingAppointments = params.appointments
    .filter(
      (appt) =>
        appt.patientId === params.patientId &&
        appt.status !== 'cancelled' &&
        appt.status !== 'no_show' &&
        appt.date >= refDate
    )
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (a.startTime || '00:00').localeCompare(b.startTime || '00:00');
    });

  const activeInvoices = params.invoices.filter(
    (inv) => inv.patientId === params.patientId && inv.status !== 'void'
  );

  let packageTotalSessions = 0;
  let packageUsedSessions = 0;
  let totalBalanceDueIQD = 0;
  const activeCourseInvoiceNumbers: string[] = [];

  for (const inv of activeInvoices) {
    totalBalanceDueIQD += Math.max(0, inv.balanceDueIQD || 0);
    const total = inv.packageTotalSessions || 0;
    if (inv.invoiceType === 'rehab_package' || total > 0) {
      const used = Math.max(0, Math.min(total, inv.packageUsedSessions || 0));
      packageTotalSessions += total;
      packageUsedSessions += used;
      if (inv.invoiceNumber) {
        activeCourseInvoiceNumbers.push(inv.invoiceNumber);
      }
    }
  }

  return {
    patientId: params.patientId,
    patientName: params.patientName,
    patientMrn: params.patientMrn,
    patientPhone: params.patientPhone,
    nextAppointment: upcomingAppointments[0] || null,
    upcomingAppointments,
    packageTotalSessions,
    packageUsedSessions,
    packageRemainingSessions: Math.max(0, packageTotalSessions - packageUsedSessions),
    activeCourseInvoiceNumbers,
    totalBalanceDueIQD,
  };
}

export function formatNextVisitBriefText(
  appt: ClinicAppointment | null,
  lang: 'ar' | 'en'
): string {
  if (!appt) return '';
  const d = formatDateDDMMYYYY(appt.date);
  const t = formatTimeIraq(appt.startTime, lang);
  return `${d} · ${t}`;
}

// =======================================================================
// E4: 3-Point Angle Geometry & Encrypted Annotated Photo Compositor
// =======================================================================

export function computeThreePointAngleDegrees(
  pointA: PhotoPoint2D,
  vertexB: PhotoPoint2D,
  pointC: PhotoPoint2D,
  aspectWidth = 1,
  aspectHeight = 1
): { angleDegrees: number; supplementaryDegrees: number } {
  const w = aspectWidth > 0 ? aspectWidth : 1;
  const h = aspectHeight > 0 ? aspectHeight : 1;

  const ux = (pointA.xNorm - vertexB.xNorm) * w;
  const uy = (pointA.yNorm - vertexB.yNorm) * h;
  const vx = (pointC.xNorm - vertexB.xNorm) * w;
  const vy = (pointC.yNorm - vertexB.yNorm) * h;

  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);
  if (magU < 1e-6 || magV < 1e-6) {
    return { angleDegrees: 0, supplementaryDegrees: 180 };
  }

  const rawCos = (ux * vx + uy * vy) / (magU * magV);
  const clampedCos = Math.max(-1, Math.min(1, rawCos));
  const deg = (Math.acos(clampedCos) * 180) / Math.PI;
  const angleDegrees = Math.round(deg * 10) / 10;
  const supplementaryDegrees = Math.round((180 - angleDegrees) * 10) / 10;
  return { angleDegrees, supplementaryDegrees };
}

export function createDefaultPhotoAngleMeasurement(
  index = 1,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): PhotoAngleMeasurement {
  const pointA: PhotoPoint2D = { xNorm: 0.36, yNorm: 0.25 };
  const vertexB: PhotoPoint2D = { xNorm: 0.5, yNorm: 0.54 };
  const pointC: PhotoPoint2D = { xNorm: 0.68, yNorm: 0.78 };
  const { angleDegrees, supplementaryDegrees } = computeThreePointAngleDegrees(
    pointA,
    vertexB,
    pointC
  );
  return {
    id: `ang_${Date.now()}_${index}`,
    label: lang === 'en' ? `Angle ${index}` : lang === 'ckb' ? `گۆشە ${index}` : `زاوية ${index}`,
    pointA,
    vertexB,
    pointC,
    angleDegrees,
    supplementaryDegrees,
  };
}

/**
 * Computes acute Cobb / intersecting axis angle (0°–90°) between two segments
 * (e.g. superior and inferior vertebral endplates on spine radiograph or sagittal pelvis).
 */
export function computeFourPointCobbAngleDegrees(
  line1Start: PhotoPoint2D,
  line1End: PhotoPoint2D,
  line2Start: PhotoPoint2D,
  line2End: PhotoPoint2D,
  aspectWidth = 1,
  aspectHeight = 1
): { angleDegrees: number; obtuseDegrees: number } {
  const w = aspectWidth > 0 ? aspectWidth : 1;
  const h = aspectHeight > 0 ? aspectHeight : 1;

  const ux = (line1End.xNorm - line1Start.xNorm) * w;
  const uy = (line1End.yNorm - line1Start.yNorm) * h;
  const vx = (line2End.xNorm - line2Start.xNorm) * w;
  const vy = (line2End.yNorm - line2Start.yNorm) * h;

  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);
  if (magU < 1e-6 || magV < 1e-6) {
    return { angleDegrees: 0, obtuseDegrees: 180 };
  }

  const rawCos = Math.abs(ux * vx + uy * vy) / (magU * magV);
  const clampedCos = Math.max(0, Math.min(1, rawCos));
  const acuteDeg = (Math.acos(clampedCos) * 180) / Math.PI;
  const angleDegrees = Math.round(acuteDeg * 10) / 10;
  const obtuseDegrees = Math.round((180 - angleDegrees) * 10) / 10;
  return { angleDegrees, obtuseDegrees };
}

export function createDefaultPhotoCobbMeasurement(
  index = 1,
  lang: 'ar' | 'en' | 'ckb' = 'ar',
  aspectWidth = 1,
  aspectHeight = 1
): PhotoCobbAngleMeasurement {
  const line1Start: PhotoPoint2D = { xNorm: 0.34, yNorm: 0.28 };
  const line1End: PhotoPoint2D = { xNorm: 0.66, yNorm: 0.22 };
  const line2Start: PhotoPoint2D = { xNorm: 0.34, yNorm: 0.7 };
  const line2End: PhotoPoint2D = { xNorm: 0.66, yNorm: 0.74 };
  const { angleDegrees, obtuseDegrees } = computeFourPointCobbAngleDegrees(
    line1Start,
    line1End,
    line2Start,
    line2End,
    aspectWidth,
    aspectHeight
  );
  return {
    id: `cobb_${Date.now()}_${index}`,
    label:
      lang === 'en'
        ? `Cobb ${index}`
        : lang === 'ckb'
          ? `کۆب ${index}`
          : `زاوية كوب ${index}`,
    line1Start,
    line1End,
    line2Start,
    line2End,
    angleDegrees,
    obtuseDegrees,
  };
}

/**
 * Derives physical pixelsPerMm scale factor from a calibrated ruler segment on the image.
 */
export function computePhotoCalibrationScale(
  pointA: PhotoPoint2D,
  pointB: PhotoPoint2D,
  knownLengthMm: number,
  imageWidthPx = 1000,
  imageHeightPx = 1000
): PhotoCalibrationScale | null {
  const w = imageWidthPx > 0 ? imageWidthPx : 1000;
  const h = imageHeightPx > 0 ? imageHeightPx : 1000;
  const pxDist = Math.hypot((pointB.xNorm - pointA.xNorm) * w, (pointB.yNorm - pointA.yNorm) * h);
  if (!Number.isFinite(knownLengthMm) || knownLengthMm <= 0 || pxDist < 1) {
    return null;
  }
  const pixelsPerMm = Math.round((pxDist / knownLengthMm) * 10000) / 10000;
  return {
    pointA,
    pointB,
    knownLengthMm,
    pixelsPerMm,
  };
}

export function computePhotoDistanceMetrics(
  start: PhotoPoint2D,
  end: PhotoPoint2D,
  imageWidthPx = 1000,
  imageHeightPx = 1000,
  calibration?: PhotoCalibrationScale | null
): {
  pixelLength: number;
  deltaXPx: number;
  deltaYPx: number;
  lengthMm: number | null;
  deltaXMm: number | null;
  deltaYMm: number | null;
  tiltFromHorizontalDeg: number;
} {
  const w = imageWidthPx > 0 ? imageWidthPx : 1000;
  const h = imageHeightPx > 0 ? imageHeightPx : 1000;
  const dxPx = (end.xNorm - start.xNorm) * w;
  const dyPx = (end.yNorm - start.yNorm) * h;
  const pixelLength = Math.round(Math.hypot(dxPx, dyPx) * 10) / 10;
  const deltaXPx = Math.round(Math.abs(dxPx) * 10) / 10;
  const deltaYPx = Math.round(Math.abs(dyPx) * 10) / 10;

  let tiltFromHorizontalDeg = 0;
  if (pixelLength > 0.01) {
    const rawAngle = (Math.atan2(Math.abs(dyPx), Math.abs(dxPx)) * 180) / Math.PI;
    tiltFromHorizontalDeg = Math.round(rawAngle * 10) / 10;
  }

  if (calibration && calibration.pixelsPerMm > 0) {
    return {
      pixelLength,
      deltaXPx,
      deltaYPx,
      lengthMm: Math.round((pixelLength / calibration.pixelsPerMm) * 10) / 10,
      deltaXMm: Math.round((deltaXPx / calibration.pixelsPerMm) * 10) / 10,
      deltaYMm: Math.round((deltaYPx / calibration.pixelsPerMm) * 10) / 10,
      tiltFromHorizontalDeg,
    };
  }

  return {
    pixelLength,
    deltaXPx,
    deltaYPx,
    lengthMm: null,
    deltaXMm: null,
    deltaYMm: null,
    tiltFromHorizontalDeg,
  };
}

export function createDefaultPhotoDistanceMeasurement(
  index = 1,
  lang: 'ar' | 'en' | 'ckb' = 'ar',
  imageWidthPx = 1000,
  imageHeightPx = 1000,
  calibration?: PhotoCalibrationScale | null
): PhotoDistanceMeasurement {
  const start: PhotoPoint2D = { xNorm: 0.3, yNorm: 0.45 };
  const end: PhotoPoint2D = { xNorm: 0.7, yNorm: 0.45 };
  const metrics = computePhotoDistanceMetrics(start, end, imageWidthPx, imageHeightPx, calibration);
  return {
    id: `dist_${Date.now()}_${index}`,
    label:
      lang === 'en'
        ? `Distance ${index}`
        : lang === 'ckb'
          ? `مەودا ${index}`
          : `مسافة ${index}`,
    start,
    end,
    pixelLength: metrics.pixelLength,
    lengthMm: metrics.lengthMm,
    deltaXMm: metrics.deltaXMm,
    deltaYMm: metrics.deltaYMm,
    tiltFromHorizontalDeg: metrics.tiltFromHorizontalDeg,
  };
}

export function createDefaultPhotoArrowAnnotation(
  index = 1,
  lang: 'ar' | 'en' | 'ckb' = 'ar'
): PhotoArrowAnnotation {
  return {
    id: `arr_${Date.now()}_${index}`,
    label:
      lang === 'en'
        ? `Note ${index}`
        : lang === 'ckb'
          ? `ئاماژە ${index}`
          : `علامة ${index}`,
    start: { xNorm: 0.25, yNorm: 0.35 },
    end: { xNorm: 0.42, yNorm: 0.45 },
    colorHex: '#f59e0b',
  };
}

function getGridDivisions(gridMode: PhotoAnnotationState['gridMode']): number {
  if (gridMode === '12x12') return 12;
  if (gridMode === '6x6') return 6;
  if (gridMode === '3x3') return 3;
  return 0;
}

export function formatPhotoDistanceBadgeText(dist: PhotoDistanceMeasurement): string {
  if (dist.lengthMm !== null && Number.isFinite(dist.lengthMm)) {
    const cm = Math.round((dist.lengthMm / 10) * 100) / 100;
    return dist.lengthMm >= 10 ? `${dist.label}: ${cm} cm` : `${dist.label}: ${dist.lengthMm} mm`;
  }
  return `${dist.label}: ${dist.pixelLength} px`;
}

export async function createThumbnailFromDataUrl(
  payloadDataUrl: string,
  widthPx: number,
  heightPx: number
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return payloadDataUrl;
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Thumbnail image load failed'));
      el.src = payloadDataUrl;
    });
    const thumbScale = Math.min(1, ATTACHMENT_THUMBNAIL_MAX_PX / Math.max(widthPx, heightPx));
    const thumbW = Math.max(1, Math.round(widthPx * thumbScale));
    const thumbH = Math.max(1, Math.round(heightPx * thumbScale));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const tCtx = thumbCanvas.getContext('2d');
    if (!tCtx) return payloadDataUrl;
    tCtx.drawImage(img, 0, 0, thumbW, thumbH);
    return thumbCanvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return payloadDataUrl;
  }
}

function drawBadgePill(
  ctx: CanvasRenderingContext2D,
  badgeText: string,
  anchorX: number,
  anchorY: number,
  widthPx: number,
  heightPx: number,
  textColor = '#fef08a',
  borderColor = '#475569'
): void {
  const fontSize = Math.max(13, Math.round(widthPx / 42));
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const metrics = ctx.measureText(badgeText);
  const padX = 10;
  const pillW = metrics.width + padX * 2;
  const pillH = fontSize + 12;
  const pillX = Math.max(6, Math.min(widthPx - pillW - 6, anchorX + 10));
  const pillY = Math.max(6, Math.min(heightPx - pillH - 6, anchorY - pillH - 8));

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, pillX + padX, pillY + pillH / 2);
}

function buildFallbackAnnotatedSvgDataUrl(params: {
  sourceDataUrl: string;
  widthPx: number;
  heightPx: number;
  annotations: PhotoAnnotationState;
}): string {
  const { sourceDataUrl, widthPx, heightPx, annotations } = params;
  const safeHref = isSafeAttachmentDataUrl(sourceDataUrl, 'image')
    ? escapeHtmlBasic(sourceDataUrl.trim())
    : '';
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
    ...(safeHref
      ? [
          `<image href="${safeHref}" x="0" y="0" width="${widthPx}" height="${heightPx}" preserveAspectRatio="xMidYMid meet" />`,
        ]
      : []),
  ];

  const divisions = getGridDivisions(annotations.gridMode);
  if (divisions > 0) {
    for (let i = 1; i < divisions; i += 1) {
      const gx = ((widthPx * i) / divisions).toFixed(1);
      const gy = ((heightPx * i) / divisions).toFixed(1);
      parts.push(
        `<line x1="${gx}" y1="0" x2="${gx}" y2="${heightPx}" stroke="#14b8a6" stroke-opacity="0.55" stroke-width="1" />`
      );
      parts.push(
        `<line x1="0" y1="${gy}" x2="${widthPx}" y2="${gy}" stroke="#14b8a6" stroke-opacity="0.55" stroke-width="1" />`
      );
    }
  }

  if (annotations.showPlumbLine) {
    const px = ((widthPx * annotations.plumbLineXPercent) / 100).toFixed(1);
    parts.push(
      `<line x1="${px}" y1="0" x2="${px}" y2="${heightPx}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" />`
    );
  }

  if (annotations.showHorizontalLevel) {
    const py = ((heightPx * annotations.horizontalLevelYPercent) / 100).toFixed(1);
    parts.push(
      `<line x1="0" y1="${py}" x2="${widthPx}" y2="${py}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="8 6" />`
    );
  }

  for (const ang of annotations.angles) {
    const ax = ang.pointA.xNorm * widthPx;
    const ay = ang.pointA.yNorm * heightPx;
    const bx = ang.vertexB.xNorm * widthPx;
    const by = ang.vertexB.yNorm * heightPx;
    const cx = ang.pointC.xNorm * widthPx;
    const cy = ang.pointC.yNorm * heightPx;
    parts.push(
      `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#facc15" stroke-width="3" />`,
      `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="#facc15" stroke-width="3" />`,
      `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="6" fill="#0d9488" stroke="#ffffff" stroke-width="2" />`,
      `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="7" fill="#ef4444" stroke="#ffffff" stroke-width="2" />`,
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="#0d9488" stroke="#ffffff" stroke-width="2" />`,
      `<rect x="${(bx + 10).toFixed(1)}" y="${(by - 28).toFixed(1)}" width="136" height="24" rx="6" fill="#0f172a" fill-opacity="0.9" />`,
      `<text x="${(bx + 18).toFixed(1)}" y="${(by - 12).toFixed(1)}" fill="#fef08a" font-size="13" font-family="sans-serif" font-weight="bold">${escapeHtmlBasic(ang.label)}: ${ang.angleDegrees}°</text>`
    );
  }

  for (const cobb of annotations.cobbAngles || []) {
    const x1a = cobb.line1Start.xNorm * widthPx;
    const y1a = cobb.line1Start.yNorm * heightPx;
    const x1b = cobb.line1End.xNorm * widthPx;
    const y1b = cobb.line1End.yNorm * heightPx;
    const x2a = cobb.line2Start.xNorm * widthPx;
    const y2a = cobb.line2Start.yNorm * heightPx;
    const x2b = cobb.line2End.xNorm * widthPx;
    const y2b = cobb.line2End.yNorm * heightPx;
    const midX = (x1b + x2b) / 2;
    const midY = (y1b + y2b) / 2;
    parts.push(
      `<line x1="${x1a.toFixed(1)}" y1="${y1a.toFixed(1)}" x2="${x1b.toFixed(1)}" y2="${y1b.toFixed(1)}" stroke="#38bdf8" stroke-width="3" />`,
      `<line x1="${x2a.toFixed(1)}" y1="${y2a.toFixed(1)}" x2="${x2b.toFixed(1)}" y2="${y2b.toFixed(1)}" stroke="#38bdf8" stroke-width="3" />`,
      `<line x1="${((x1a + x1b) / 2).toFixed(1)}" y1="${((y1a + y1b) / 2).toFixed(1)}" x2="${((x2a + x2b) / 2).toFixed(1)}" y2="${((y2a + y2b) / 2).toFixed(1)}" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4" />`,
      `<text x="${(midX + 8).toFixed(1)}" y="${midY.toFixed(1)}" fill="#bae6fd" font-size="13" font-family="sans-serif" font-weight="bold">${escapeHtmlBasic(cobb.label)}: ${cobb.angleDegrees}°</text>`
    );
  }

  for (const dist of annotations.distances || []) {
    const sx = dist.start.xNorm * widthPx;
    const sy = dist.start.yNorm * heightPx;
    const ex = dist.end.xNorm * widthPx;
    const ey = dist.end.yNorm * heightPx;
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    parts.push(
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#34d399" stroke-width="3" />`,
      `<text x="${(mx + 6).toFixed(1)}" y="${(my - 8).toFixed(1)}" fill="#a7f3d0" font-size="13" font-family="sans-serif" font-weight="bold">${escapeHtmlBasic(formatPhotoDistanceBadgeText(dist))}</text>`
    );
  }

  for (const arr of annotations.arrows || []) {
    const sx = arr.start.xNorm * widthPx;
    const sy = arr.start.yNorm * heightPx;
    const ex = arr.end.xNorm * widthPx;
    const ey = arr.end.yNorm * heightPx;
    parts.push(
      `<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${escapeHtmlBasic(arr.colorHex || '#f59e0b')}" stroke-width="3" />`,
      `<text x="${sx.toFixed(1)}" y="${(sy - 8).toFixed(1)}" fill="#ffffff" font-size="13" font-family="sans-serif" font-weight="bold">${escapeHtmlBasic(arr.label)}</text>`
    );
  }

  parts.push('</svg>');
  const svgStr = parts.join('');
  let encoded = '';
  if (typeof btoa === 'function') {
    const utf8 = unescape(encodeURIComponent(svgStr));
    encoded = btoa(utf8);
  } else {
    encoded = Buffer.from(svgStr, 'utf8').toString('base64');
  }
  return `data:image/svg+xml;base64,${encoded}`;
}

export async function renderAnnotatedPhotoDataUrl(params: {
  sourceDataUrl: string;
  widthPx?: number;
  heightPx?: number;
  annotations: PhotoAnnotationState;
}): Promise<{
  payloadDataUrl: string;
  thumbnailDataUrl: string;
  widthPx: number;
  heightPx: number;
  storedBytes: number;
}> {
  const { annotations, sourceDataUrl } = params;
  const fallbackW = params.widthPx && params.widthPx > 0 ? params.widthPx : 800;
  const fallbackH = params.heightPx && params.heightPx > 0 ? params.heightPx : 600;

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const svgUrl = buildFallbackAnnotatedSvgDataUrl({
      sourceDataUrl,
      widthPx: fallbackW,
      heightPx: fallbackH,
      annotations,
    });
    return {
      payloadDataUrl: svgUrl,
      thumbnailDataUrl: svgUrl,
      widthPx: fallbackW,
      heightPx: fallbackH,
      storedBytes: estimateDataUrlBytes(svgUrl),
    };
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = sourceDataUrl;
    });

    const natW = img.naturalWidth || img.width || fallbackW;
    const natH = img.naturalHeight || img.height || fallbackH;
    const scale = Math.min(1, ATTACHMENT_MAX_DIMENSION_PX / Math.max(natW, natH));
    const widthPx = Math.max(1, Math.round(natW * scale));
    const heightPx = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D unavailable');
    }

    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const divisions = getGridDivisions(annotations.gridMode);
    if (divisions > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 184, 166, 0.55)';
      ctx.lineWidth = Math.max(1, Math.round(widthPx / 600));
      for (let i = 1; i < divisions; i += 1) {
        const gx = (widthPx * i) / divisions;
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, heightPx);
        ctx.stroke();

        const gy = (heightPx * i) / divisions;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(widthPx, gy);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (annotations.showPlumbLine) {
      const px = (widthPx * annotations.plumbLineXPercent) / 100;
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = Math.max(2, Math.round(widthPx / 320));
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, heightPx);
      ctx.stroke();
      ctx.restore();
    }

    if (annotations.showHorizontalLevel) {
      const py = (heightPx * annotations.horizontalLevelYPercent) / 100;
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(2, Math.round(widthPx / 320));
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(widthPx, py);
      ctx.stroke();
      ctx.restore();
    }

    const baseLineW = Math.max(2.5, widthPx / 260);
    const rOuter = Math.max(6, widthPx / 110);

    // 3-point angle overlays
    for (const ang of annotations.angles) {
      const ax = ang.pointA.xNorm * widthPx;
      const ay = ang.pointA.yNorm * heightPx;
      const bx = ang.vertexB.xNorm * widthPx;
      const by = ang.vertexB.yNorm * heightPx;
      const cx = ang.pointC.xNorm * widthPx;
      const cy = ang.pointC.yNorm * heightPx;

      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = baseLineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      const a1 = Math.atan2(ay - by, ax - bx);
      const a2 = Math.atan2(cy - by, cx - bx);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
      ctx.lineWidth = Math.max(1.5, baseLineW * 0.7);
      ctx.beginPath();
      ctx.arc(bx, by, rOuter * 3.2, a1, a1 + diff, diff < 0);
      ctx.stroke();

      const pts: Array<[number, number, string]> = [
        [ax, ay, '#0d9488'],
        [bx, by, '#ef4444'],
        [cx, cy, '#0d9488'],
      ];
      for (const [x, y, fill] of pts) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rOuter, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      drawBadgePill(ctx, `${ang.label}: ${ang.angleDegrees}°`, bx, by, widthPx, heightPx, '#fef08a', '#facc15');
      ctx.restore();
    }

    // 4-point Cobb / Spinal axis overlays
    for (const cobb of annotations.cobbAngles || []) {
      const x1a = cobb.line1Start.xNorm * widthPx;
      const y1a = cobb.line1Start.yNorm * heightPx;
      const x1b = cobb.line1End.xNorm * widthPx;
      const y1b = cobb.line1End.yNorm * heightPx;
      const x2a = cobb.line2Start.xNorm * widthPx;
      const y2a = cobb.line2Start.yNorm * heightPx;
      const x2b = cobb.line2End.xNorm * widthPx;
      const y2b = cobb.line2End.yNorm * heightPx;

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = baseLineW;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1a, y1a);
      ctx.lineTo(x1b, y1b);
      ctx.moveTo(x2a, y2a);
      ctx.lineTo(x2b, y2b);
      ctx.stroke();

      ctx.setLineDash([6, 4]);
      ctx.lineWidth = Math.max(1.5, baseLineW * 0.65);
      ctx.beginPath();
      ctx.moveTo((x1a + x1b) / 2, (y1a + y1b) / 2);
      ctx.lineTo((x2a + x2b) / 2, (y2a + y2b) / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      for (const [x, y] of [
        [x1a, y1a],
        [x1b, y1b],
        [x2a, y2a],
        [x2b, y2b],
      ]) {
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rOuter * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      drawBadgePill(
        ctx,
        `${cobb.label}: ${cobb.angleDegrees}°`,
        (x1b + x2b) / 2,
        (y1b + y2b) / 2,
        widthPx,
        heightPx,
        '#bae6fd',
        '#38bdf8'
      );
      ctx.restore();
    }

    // Calibrated / Pixel distance overlays
    for (const dist of annotations.distances || []) {
      const sx = dist.start.xNorm * widthPx;
      const sy = dist.start.yNorm * heightPx;
      const ex = dist.end.xNorm * widthPx;
      const ey = dist.end.yNorm * heightPx;

      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = baseLineW;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      for (const [x, y] of [
        [sx, sy],
        [ex, ey],
      ]) {
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rOuter * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      drawBadgePill(
        ctx,
        formatPhotoDistanceBadgeText(dist),
        (sx + ex) / 2,
        (sy + ey) / 2,
        widthPx,
        heightPx,
        '#a7f3d0',
        '#34d399'
      );
      ctx.restore();
    }

    // Arrow callouts
    for (const arr of annotations.arrows || []) {
      const sx = arr.start.xNorm * widthPx;
      const sy = arr.start.yNorm * heightPx;
      const ex = arr.end.xNorm * widthPx;
      const ey = arr.end.yNorm * heightPx;
      const color = arr.colorHex || '#f59e0b';
      const headLen = Math.max(12, widthPx / 55);
      const angle = Math.atan2(ey - sy, ex - sx);

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = baseLineW;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      if (arr.label.trim()) {
        drawBadgePill(ctx, arr.label, sx, sy, widthPx, heightPx, '#ffffff', color);
      }
      ctx.restore();
    }

    const payloadDataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const thumbnailDataUrl = await createThumbnailFromDataUrl(payloadDataUrl, widthPx, heightPx);

    return {
      payloadDataUrl,
      thumbnailDataUrl,
      widthPx,
      heightPx,
      storedBytes: estimateDataUrlBytes(payloadDataUrl),
    };
  } catch {
    const svgUrl = buildFallbackAnnotatedSvgDataUrl({
      sourceDataUrl,
      widthPx: fallbackW,
      heightPx: fallbackH,
      annotations,
    });
    return {
      payloadDataUrl: svgUrl,
      thumbnailDataUrl: svgUrl,
      widthPx: fallbackW,
      heightPx: fallbackH,
      storedBytes: estimateDataUrlBytes(svgUrl),
    };
  }
}
