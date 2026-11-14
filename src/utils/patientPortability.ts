// =======================================================================
// PhysioRecord — Patient CSV Onboarding Importer & Full Vault Portability (5.1)
// Zero external dependencies; RFC-4180 CSV parser + formula-safe CSV export.
// =======================================================================

import type { Gender, PatientClinicalData, PatientRecord } from '../types/clinical';
import type {
  ClinicExpenseIQD,
  FinancialInvoiceIQD,
} from '../types/clinicManagement';
import {
  buildCsvDocument,
  buildExpensesCsv,
  buildInvoicesCsv,
  buildPaymentsCsv,
} from './csvExport';
import { computePatientAge, normalizeIraqiPhoneStorage } from './date';

export interface ParsedPatientCsvRow {
  rowNumber: number;
  data: PatientClinicalData;
  rawName: string;
  normalizedPhone: string;
  isDuplicatePhone: boolean;
  isDuplicateName: boolean;
  warnings: string[];
}

export interface CsvPatientImportPreview {
  totalRows: number;
  validRows: ParsedPatientCsvRow[];
  skippedRows: Array<{ rowNumber: number; reasonAr: string; reasonEn: string }>;
  detectedHeaders: string[];
}

/**
 * RFC-4180 CSV parser supporting UTF-8 BOM, CRLF/LF, and quoted embedded commas/newlines.
 */
export function parseCsvMatrix(rawText: string): string[][] {
  const cleaned = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (ch === '\r') {
      if (cleaned[i + 1] === '\n') i += 1;
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField.trim());
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  currentRow.push(currentField.trim());
  if (currentRow.some((cell) => cell.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

type PatientCsvColumnKey =
  | 'fullNameAr'
  | 'fullName'
  | 'phone'
  | 'gender'
  | 'age'
  | 'dateOfBirth'
  | 'mrn'
  | 'address'
  | 'occupation'
  | 'medicalHistory'
  | 'redFlags'
  | 'referringPhysician'
  | 'generalNotes';

function mapCsvHeaderToField(rawHeader: string): PatientCsvColumnKey | null {
  const h = rawHeader.toLowerCase().replace(/[_\-*/().]+/g, ' ').trim();
  if (/^(الاسم|الاسم الكامل|الاسم بالعربية|name ar|arabic name)$/.test(h)) return 'fullNameAr';
  if (/^(full name|fullname|name|patient name|patient|الاسم بالانجليزية)$/.test(h)) return 'fullName';
  if (/^(phone|mobile|tel|phone number|رقم الهاتف|الهاتف|الموبايل|الجوال)$/.test(h)) return 'phone';
  if (/^(gender|sex|الجنس)$/.test(h)) return 'gender';
  if (/^(age|العمر)$/.test(h)) return 'age';
  if (/^(dob|date of birth|birth date|تاريخ الميلاد|الميلاد)$/.test(h)) return 'dateOfBirth';
  if (/^(mrn|medical record|رقم الملف|الرقم الطبي)$/.test(h)) return 'mrn';
  if (/^(address|العنوان|السكن)$/.test(h)) return 'address';
  if (/^(occupation|job|work|المهنة|العمل)$/.test(h)) return 'occupation';
  if (/^(medical history|history|diagnosis|condition|التشخيص|التاريخ المرضي|الشكوى)$/.test(h)) {
    return 'medicalHistory';
  }
  if (/^(red flags|warnings|alerts|العلامات الحمراء|تحذيرات)$/.test(h)) return 'redFlags';
  if (/^(referring physician|doctor|physician|الطبيب المحول|الإحالة)$/.test(h)) {
    return 'referringPhysician';
  }
  if (/^(notes|general notes|ملاحظات)$/.test(h)) return 'generalNotes';
  return null;
}

function normalizeGenderValue(raw: string | undefined): Gender {
  const v = (raw || '').trim().toLowerCase();
  if (['f', 'female', 'woman', 'أنثى', 'انثى', 'مؤنث'].includes(v)) return 'female';
  if (['m', 'male', 'man', 'ذكر'].includes(v)) return 'male';
  if (['other', 'آخر'].includes(v)) return 'other';
  return 'male';
}

function normalizeDobValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Support dd/mm/yyyy
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${month}-${day}`;
  }
  return undefined;
}

export function previewPatientCsvImport(
  csvText: string,
  existingPatients: PatientRecord[]
): CsvPatientImportPreview {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    return {
      totalRows: 0,
      validRows: [],
      skippedRows: [],
      detectedHeaders: matrix[0] || [],
    };
  }

  const headers = matrix[0];
  const columnMap = headers.map((h) => mapCsvHeaderToField(h));

  const existingPhones = new Set(
    existingPatients
      .map((p) => normalizeIraqiPhoneStorage(p.data.phoneNumber || p.data.phone))
      .filter(Boolean)
  );
  const existingNames = new Set(
    existingPatients
      .flatMap((p) => [p.data.fullNameAr, p.data.fullName])
      .filter((s): s is string => Boolean(s))
      .map((s) => s.trim().toLowerCase())
  );

  const validRows: ParsedPatientCsvRow[] = [];
  const skippedRows: Array<{ rowNumber: number; reasonAr: string; reasonEn: string }> = [];

  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const cells = matrix[rIdx];
    const rowNumber = rIdx + 1;
    const rawObj: Partial<Record<PatientCsvColumnKey, string>> = {};

    cells.forEach((cell, cIdx) => {
      const key = columnMap[cIdx];
      if (key && cell) {
        rawObj[key] = cell;
      }
    });

    const primaryName = rawObj.fullNameAr?.trim() || rawObj.fullName?.trim() || '';
    if (!primaryName) {
      skippedRows.push({
        rowNumber,
        reasonAr: 'الصف يفتقد اسم المريض.',
        reasonEn: 'Row is missing patient name.',
      });
      continue;
    }

    const normalizedPhone = normalizeIraqiPhoneStorage(rawObj.phone);
    const dob = normalizeDobValue(rawObj.dateOfBirth);
    const parsedAgeNum = rawObj.age ? Number(rawObj.age.replace(/[^\d]/g, '')) : undefined;
    const age = computePatientAge(dob, Number.isFinite(parsedAgeNum) ? parsedAgeNum : undefined);

    const warnings: string[] = [];
    const isDuplicatePhone = Boolean(normalizedPhone && existingPhones.has(normalizedPhone));
    const isDuplicateName = existingNames.has(primaryName.toLowerCase());
    if (isDuplicatePhone) warnings.push('رقم الهاتف مسجل مسبقاً');
    if (isDuplicateName) warnings.push('الاسم موجود مسبقاً');

    const patientData: PatientClinicalData = {
      fullName: rawObj.fullName?.trim() || primaryName,
      fullNameAr: rawObj.fullNameAr?.trim() || primaryName,
      gender: normalizeGenderValue(rawObj.gender),
      ...(normalizedPhone ? { phoneNumber: normalizedPhone, phone: normalizedPhone } : {}),
      ...(dob ? { dateOfBirth: dob } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(rawObj.mrn ? { mrn: rawObj.mrn.trim() } : {}),
      ...(rawObj.address ? { address: rawObj.address.trim() } : {}),
      ...(rawObj.occupation ? { occupation: rawObj.occupation.trim() } : {}),
      ...(rawObj.medicalHistory ? { medicalHistory: rawObj.medicalHistory.trim() } : {}),
      ...(rawObj.redFlags ? { redFlags: rawObj.redFlags.trim() } : {}),
      ...(rawObj.referringPhysician ? { referringPhysician: rawObj.referringPhysician.trim() } : {}),
      ...(rawObj.generalNotes ? { generalNotes: rawObj.generalNotes.trim() } : {}),
    };

    validRows.push({
      rowNumber,
      data: patientData,
      rawName: primaryName,
      normalizedPhone,
      isDuplicatePhone,
      isDuplicateName,
      warnings,
    });
  }

  return {
    totalRows: matrix.length - 1,
    validRows,
    skippedRows,
    detectedHeaders: headers,
  };
}

export function buildSamplePatientsCsvTemplate(lang: 'ar' | 'en' = 'ar'): string {
  const headers =
    lang !== 'en'
      ? ['الاسم بالعربية', 'Full Name', 'رقم الهاتف', 'الجنس', 'العمر', 'تاريخ الميلاد', 'العنوان', 'التاريخ المرضي']
      : ['fullNameAr', 'fullName', 'phone', 'gender', 'age', 'dateOfBirth', 'address', 'medicalHistory'];
  const sampleRow =
    lang !== 'en'
      ? ['علي حسن كريم', 'Ali Hassan Kareem', '0770 123 4567', 'ذكر', '34', '1992-05-14', 'بغداد - الكرادة', 'ألم أسفل الظهر المزمن']
      : ['علي حسن كريم', 'Ali Hassan Kareem', '0770 123 4567', 'male', '34', '1992-05-14', 'Baghdad', 'Chronic Low Back Pain'];

  return buildCsvDocument(headers, [sampleRow], true);
}

export function buildPatientsCsv(patients: PatientRecord[], lang: 'ar' | 'en' = 'ar'): string {
  const headers =
    lang !== 'en'
      ? [
          'المعرف',
          'الرقم الطبي (MRN)',
          'الاسم بالعربية',
          'الاسم بالإنكليزية',
          'الهاتف',
          'الجنس',
          'العمر',
          'تاريخ الميلاد',
          'السكن',
          'المهنة',
          'التاريخ المرضي',
          'العلامات الحمراء',
          'مؤرشف؟',
        ]
      : [
          'ID',
          'MRN',
          'Arabic Name',
          'English Name',
          'Phone',
          'Gender',
          'Age',
          'Date of Birth',
          'Address',
          'Occupation',
          'Medical History',
          'Red Flags',
          'Archived',
        ];

  const rows = patients.map((p) => [
    p.id,
    p.data.mrn || '',
    p.data.fullNameAr || '',
    p.data.fullName || '',
    p.data.phoneNumber || p.data.phone || '',
    p.data.gender,
    computePatientAge(p.data.dateOfBirth, p.data.age) ?? '',
    p.data.dateOfBirth || '',
    p.data.address || '',
    p.data.occupation || '',
    p.data.medicalHistory || '',
    p.data.redFlags || '',
    p.isArchived === 1,
  ]);

  return buildCsvDocument(headers, rows, true);
}

export function buildFullVaultCsvFiles(params: {
  patients: PatientRecord[];
  invoices: FinancialInvoiceIQD[];
  expenses: ClinicExpenseIQD[];
  currencyCode: string;
  lang: 'ar' | 'en';
}): Array<{ filename: string; csvContent: string }> {
  const { patients, invoices, expenses, currencyCode, lang } = params;
  const dateStamp = new Date().toISOString().slice(0, 10);
  return [
    {
      filename: `physiorecord-patients-${dateStamp}.csv`,
      csvContent: buildPatientsCsv(patients, lang),
    },
    {
      filename: `physiorecord-invoices-${dateStamp}.csv`,
      csvContent: buildInvoicesCsv(invoices, currencyCode, lang),
    },
    {
      filename: `physiorecord-payments-${dateStamp}.csv`,
      csvContent: buildPaymentsCsv(invoices, currencyCode, lang),
    },
    {
      filename: `physiorecord-expenses-${dateStamp}.csv`,
      csvContent: buildExpensesCsv(expenses, currencyCode, lang),
    },
  ];
}
