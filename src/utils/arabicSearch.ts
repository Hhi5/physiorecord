// =======================================================================
// PhysioRecord — Arabic-Aware Clinical Search Engine (5.3)
// Powered by MiniSearch (MIT) + Unicode Arabic & Digit Normalization
// Zero network dependencies; operates strictly on in-memory decrypted records.
// =======================================================================

import MiniSearch from 'minisearch';
import type { PatientRecord } from '../types/clinical';

/**
 * Normalize Arabic, Kurdish/Persian digits, diacritics, and orthographic variants
 * so clinicians can find "أحمد / احمد / إحمد", "منى / مني", "فاطمة / فاطمه",
 * and Eastern Arabic/Persian numerals "٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹" seamlessly.
 */
export function normalizeArabicSearchText(input: string | undefined | null): string {
  if (!input) return '';
  return (
    input
      .normalize('NFKC')
      // Convert Eastern Arabic (U+0660-U+0669) and Extended Arabic-Indic/Persian (U+06F0-U+06F9) digits
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      // Remove Arabic tashkeel / harakat diacritics & tatweel (kashida)
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
      // Fold Alef variants (أ / إ / آ / ٱ -> ا) and Alef Wasla
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      // Fold Alef Maqsura (ى -> ي) and Farsi Yeh (ی -> ي)
      .replace(/[\u0649\u06CC]/g, '\u064A')
      // Fold Ta Marbuta (ة -> ه)
      .replace(/\u0629/g, '\u0647')
      // Fold Hamza on Waw/Ya variants when clinicians type simplified forms
      .replace(/\u0624/g, '\u0648')
      .replace(/\u0626/g, '\u064A')
      // Fold Kurdish Keheh (ک -> ك) for flexible mixed queries
      .replace(/\u06A9/g, '\u0643')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Normalize phone digits and emit both canonical local (`07...`), `+964`,
 * and last-4 / last-7 suffix tokens so searching by phone suffix is instant.
 */
export function extractPhoneSearchTokens(rawPhone: string | undefined | null): string {
  if (!rawPhone) return '';
  const digits = normalizeArabicSearchText(rawPhone).replace(/\D/g, '');
  if (!digits) return '';

  const tokens = new Set<string>([digits]);
  if (digits.startsWith('00964') && digits.length > 5) {
    tokens.add(`0${digits.slice(5)}`);
    tokens.add(digits.slice(5));
  } else if (digits.startsWith('964') && digits.length > 3) {
    tokens.add(`0${digits.slice(3)}`);
    tokens.add(digits.slice(3));
  } else if (digits.startsWith('7') && digits.length === 10) {
    tokens.add(`0${digits}`);
    tokens.add(`964${digits}`);
  } else if (digits.startsWith('0') && digits.length === 11) {
    tokens.add(digits.slice(1));
    tokens.add(`964${digits.slice(1)}`);
  }

  for (const candidate of Array.from(tokens)) {
    if (candidate.length >= 4) tokens.add(candidate.slice(-4));
    if (candidate.length >= 6) tokens.add(candidate.slice(-6));
    if (candidate.length >= 7) tokens.add(candidate.slice(-7));
  }

  return Array.from(tokens).join(' ');
}

interface IndexedPatientDoc {
  id: string;
  nameNorm: string;
  mrnNorm: string;
  phoneTokens: string;
  clinicalMetaNorm: string;
}

export class PatientSearchEngine {
  private miniSearch: MiniSearch<IndexedPatientDoc>;
  private patientsById = new Map<string, PatientRecord>();
  private docsById = new Map<string, IndexedPatientDoc & { textHaystack: string }>();

  constructor(patients: PatientRecord[], resolveMrn?: (patient: PatientRecord, idx: number) => string) {
    this.miniSearch = new MiniSearch<IndexedPatientDoc>({
      fields: ['nameNorm', 'mrnNorm', 'phoneTokens', 'clinicalMetaNorm'],
      storeFields: ['id'],
      processTerm: (term) => normalizeArabicSearchText(term),
      tokenize: (text) =>
        normalizeArabicSearchText(text)
          .split(/[\s\-_/.,;:()[\]]+/)
          .filter(Boolean),
    });

    const docs: IndexedPatientDoc[] = patients.map((p, idx) => {
      this.patientsById.set(p.id, p);
      const mrn = resolveMrn ? resolveMrn(p, idx) : p.data.mrn || '';
      const phone = p.data.phoneNumber || p.data.phone || '';
      const nameNorm = normalizeArabicSearchText(`${p.data.fullNameAr || ''} ${p.data.fullName || ''}`);
      const mrnNorm = normalizeArabicSearchText(mrn);
      const phoneTokens = extractPhoneSearchTokens(phone);
      const clinicalMetaNorm = normalizeArabicSearchText(
        `${p.data.medicalHistory || ''} ${p.data.occupation || ''} ${p.data.address || ''} ${p.data.referringPhysician || ''}`
      );
      const doc: IndexedPatientDoc = {
        id: p.id,
        nameNorm,
        mrnNorm,
        phoneTokens,
        clinicalMetaNorm,
      };
      this.docsById.set(p.id, {
        ...doc,
        textHaystack: `${nameNorm} ${mrnNorm} ${clinicalMetaNorm}`,
      });
      return doc;
    });

    if (docs.length > 0) {
      this.miniSearch.addAll(docs);
    }
  }

  search(rawQuery: string): PatientRecord[] {
    const trimmed = normalizeArabicSearchText(rawQuery);
    if (!trimmed) {
      return Array.from(this.patientsById.values());
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    const results = this.miniSearch.search(trimmed, {
      prefix: true,
      fuzzy: trimmed.length >= 4 && digitsOnly.length < 3 ? 0.2 : 0,
      combineWith: 'AND',
      boost: {
        mrnNorm: 4,
        phoneTokens: 3.5,
        nameNorm: 3,
        clinicalMetaNorm: 1,
      },
    });

    const matchedIds = new Set<string>();
    const ordered: PatientRecord[] = [];
    for (const hit of results) {
      const p = this.patientsById.get(String(hit.id));
      if (p) {
        matchedIds.add(p.id);
        ordered.push(p);
      }
    }

    // Fallback substring pass for short partial phone suffixes or multi-script fragments
    if (digitsOnly.length >= 2 || trimmed.length >= 2) {
      for (const p of this.patientsById.values()) {
        if (matchedIds.has(p.id)) continue;
        const cachedDoc = this.docsById.get(p.id);
        if (!cachedDoc) continue;
        if (
          cachedDoc.textHaystack.includes(trimmed) ||
          (digitsOnly.length >= 2 && cachedDoc.phoneTokens.includes(digitsOnly))
        ) {
          matchedIds.add(p.id);
          ordered.push(p);
        }
      }
    }

    return ordered;
  }
}
