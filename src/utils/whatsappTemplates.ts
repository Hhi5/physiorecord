// =======================================================================
// PhysioRecord — Bilingual Editable WhatsApp Templates & Safe Deep-Link Helper
// Zero automatic sending; strictly user-initiated `wa.me` + clipboard fallback
// Phone normalized strictly to Iraq +964 E.164 digits (`buildWhatsAppReminderUrl`)
// =======================================================================

import type {
  ClinicAppointment,
  ClinicProfileData,
  FinancialInvoiceIQD,
  HepPrescriptionItem,
  PaymentTransactionIQD,
  WhatsAppTemplatesConfig,
} from '../types/clinicManagement';
import {
  buildWhatsAppReminderUrl,
  formatDateDDMMYYYY,
  formatTimeIraq,
} from './date';
import { getCurrencyConfig } from './currencies';

function formatCurrency(amount: number, currencyCode: string, lang: 'ar' | 'en'): string {
  const cfg = getCurrencyConfig(currencyCode);
  const symbol = lang !== 'en' ? cfg.symbolAr : cfg.symbolEn;
  const formatted = new Intl.NumberFormat(lang !== 'en' ? 'ar-IQ-u-nu-latn' : 'en-US', {
    maximumFractionDigits: cfg.decimals,
    minimumFractionDigits: cfg.decimals > 0 && Math.abs(amount) % 1 !== 0 ? 2 : 0,
  }).format(amount);
  return `${formatted} ${symbol}`;
}

export const DEFAULT_WHATSAPP_TEMPLATES: Omit<WhatsAppTemplatesConfig, 'updatedAt' | 'version'> = {
  id: 'whatsapp_templates',
  appointmentReminder: {
    ar: 'السلام عليكم {patientName}، تذكير بموعد جلسة العلاج الطبيعي في {clinicName} بتاريخ {date} الساعة {time}. نتمنى لكم الشفاء العاجل.',
    en: 'Hello {patientName}, friendly reminder for your physiotherapy session at {clinicName} on {date} at {time}. Wishing you a swift recovery.',
  },
  hepProgram: {
    ar: 'السلام عليكم {patientName}، برنامج التمارين المنزلية الموصى به من {clinicName}:\n{hepList}\nيرجى التوقف فوراً ومراجعتنا عند حدوث ألم غير معتاد.',
    en: 'Hello {patientName}, your Home Exercise Program from {clinicName}:\n{hepList}\nStop immediately and contact us if unusual pain occurs.',
  },
  paymentReceipt: {
    ar: 'السلام عليكم {patientName}، تم استلام دفعة بمبلغ {amount} (وصل رقم: {receiptNumber} | فاتورة: {invoiceNumber}) لدى {clinicName}. الرصيد المتبقي: {balanceDue}. شكراً لثقتكم.',
    en: 'Hello {patientName}, payment of {amount} received (Receipt: {receiptNumber} | Invoice: {invoiceNumber}) at {clinicName}. Remaining balance: {balanceDue}. Thank you.',
  },
};

export function interpolateWhatsAppTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>
): string {
  let result = template;
  for (const [key, val] of Object.entries(variables)) {
    const replacement = val === undefined || val === null ? '' : String(val);
    result = result.split(`{${key}}`).join(replacement);
  }
  return result.trim();
}

export function buildAppointmentReminderText(params: {
  template: string;
  appointment: ClinicAppointment;
  clinicProfile: ClinicProfileData;
  lang: 'ar' | 'en';
}): string {
  const { template, appointment, clinicProfile, lang } = params;
  const clinicName =
    lang !== 'en'
      ? clinicProfile.clinicNameAr || clinicProfile.therapistNameAr || 'عيادة العلاج الطبيعي'
      : clinicProfile.clinicNameEn || clinicProfile.therapistNameEn || 'Physiotherapy Clinic';

  return interpolateWhatsAppTemplate(template, {
    patientName: appointment.patientName,
    clinicName,
    date: formatDateDDMMYYYY(appointment.date),
    time: formatTimeIraq(appointment.startTime, lang),
    room: appointment.roomOrBed || '',
    phone: clinicProfile.phone || '',
  });
}

export function buildHepWhatsAppText(params: {
  template: string;
  patientName: string;
  hepItems: HepPrescriptionItem[];
  clinicProfile: ClinicProfileData;
  lang: 'ar' | 'en';
}): string {
  const { template, patientName, hepItems, clinicProfile, lang } = params;
  const clinicName =
    lang !== 'en'
      ? clinicProfile.clinicNameAr || clinicProfile.therapistNameAr || 'عيادة العلاج الطبيعي'
      : clinicProfile.clinicNameEn || clinicProfile.therapistNameEn || 'Physiotherapy Clinic';

  const hepList =
    hepItems.length === 0
      ? lang !== 'en'
        ? '- لا توجد تمارين مضافة بعد'
        : '- No exercises assigned yet'
      : hepItems
          .map((item, idx) => {
            const title = lang !== 'en' ? item.nameAr : item.nameEn;
            const holdPart =
              item.holdSeconds > 0
                ? lang !== 'en'
                  ? ` · ثبات ${item.holdSeconds} ث`
                  : ` · ${item.holdSeconds}s hold`
                : '';
            return lang !== 'en'
              ? `${idx + 1}. ${title} — ${item.sets} جولات × ${item.reps} تكرار${holdPart}`
              : `${idx + 1}. ${title} — ${item.sets} sets × ${item.reps} reps${holdPart}`;
          })
          .join('\n');

  return interpolateWhatsAppTemplate(template, {
    patientName,
    clinicName,
    hepList,
    phone: clinicProfile.phone || '',
  });
}

export function buildReceiptWhatsAppText(params: {
  template: string;
  invoice: FinancialInvoiceIQD;
  payment?: PaymentTransactionIQD;
  clinicProfile: ClinicProfileData;
  primaryCurrencyCode: string;
  lang: 'ar' | 'en';
}): string {
  const { template, invoice, payment, clinicProfile, primaryCurrencyCode, lang } = params;
  const clinicName =
    lang !== 'en'
      ? clinicProfile.clinicNameAr || clinicProfile.therapistNameAr || 'عيادة العلاج الطبيعي'
      : clinicProfile.clinicNameEn || clinicProfile.therapistNameEn || 'Physiotherapy Clinic';

  const latestPostedPayment =
    payment ||
    [...(invoice.payments || [])]
      .reverse()
      .find((p) => !p.isReversal && p.amountIQD > 0);

  const amountVal = latestPostedPayment ? latestPostedPayment.amountIQD : invoice.paidAmountIQD;
  const paidCode = latestPostedPayment?.currencyCode || primaryCurrencyCode;
  const paidDisplay =
    latestPostedPayment &&
    paidCode !== primaryCurrencyCode &&
    latestPostedPayment.originalAmount
      ? `${formatCurrency(latestPostedPayment.originalAmount, paidCode, lang)} (${formatCurrency(
          amountVal,
          primaryCurrencyCode,
          lang
        )})`
      : formatCurrency(amountVal, primaryCurrencyCode, lang);

  return interpolateWhatsAppTemplate(template, {
    patientName: invoice.patientName,
    clinicName,
    amount: paidDisplay,
    receiptNumber: latestPostedPayment?.receiptNumber || invoice.invoiceNumber,
    invoiceNumber: invoice.invoiceNumber,
    balanceDue: formatCurrency(invoice.balanceDueIQD, primaryCurrencyCode, lang),
    date: formatDateDDMMYYYY(latestPostedPayment?.date || invoice.date),
    phone: clinicProfile.phone || '',
  });
}

export function buildUserInitiatedWhatsAppHref(
  phone: string | undefined | null,
  messageText: string
): string | null {
  return buildWhatsAppReminderUrl(phone, messageText);
}
