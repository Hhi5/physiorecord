// =======================================================================
// PhysioRecord — Built-In CC0-1.0 Clinical Note Templates & Content Packs (5.6)
// Original snippets authored by PhysioRecord Contributors under CC0-1.0.
// Third-party JSON content packs are strictly vetted for open licenses.
// =======================================================================

import type {
  ContentPackDefinition,
  NoteTemplateCategory,
  NoteTemplateSnippet,
} from '../types/clinicManagement';

export const BUILT_IN_CC0_SNIPPETS: NoteTemplateSnippet[] = [
  {
    id: 'cc0-rom',
    slashTrigger: 'rom',
    titleAr: 'فحص المدى الحركي العام',
    titleEn: 'Active/Passive ROM Check',
    bodyAr:
      'تم تقييم المدى الحركي الفعال والسلبي (AROM/PROM) للمفصل المصاب مع مقارنة الطرف السليم ورصد مدى الألم ونهاية الحركة.',
    bodyEn:
      'Evaluated AROM and PROM of the involved joint compared bilaterally, noting end-feel and pain provocation range.',
    category: 'objective',
    packId: 'physiorecord-cc0-core',
    source: 'PhysioRecord Original Authored Template',
    license: 'CC0-1.0',
    isBuiltIn: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'cc0-hep',
    slashTrigger: 'hep',
    titleAr: 'مراجعة التمارين المنزلية',
    titleEn: 'HEP Review & Adherence',
    bodyAr:
      'تمت مراجعة برنامج التمارين المنزلية (HEP) والتأكد من الأداء الصحيح وتعديل الشدة والتكرارات بما يناسب تحمّل المريض.',
    bodyEn:
      'Reviewed home exercise program (HEP) technique and adherence; progressed repetitions/load per patient symptom tolerance.',
    category: 'plan',
    packId: 'physiorecord-cc0-core',
    source: 'PhysioRecord Original Authored Template',
    license: 'CC0-1.0',
    isBuiltIn: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'cc0-pain',
    slashTrigger: 'pain',
    titleAr: 'ملاحظة الألم والتحمّل',
    titleEn: 'Pain & Session Tolerance',
    bodyAr:
      'تحمّل المريض الجلسة العلاجية بشكل جيد دون تهيّج متزايد في الأعراض أو ظهور علامات تحذيرية.',
    bodyEn:
      'Patient tolerated manual and therapeutic interventions well with no symptom exacerbation or adverse response.',
    category: 'assessment',
    packId: 'physiorecord-cc0-core',
    source: 'PhysioRecord Original Authored Template',
    license: 'CC0-1.0',
    isBuiltIn: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'cc0-safety',
    slashTrigger: 'safety',
    titleAr: 'فحص السلامة والوقاية',
    titleEn: 'Safety & Precautions Cleared',
    bodyAr:
      'تم التحقق من استقرار العلامات السريرية وخلو الحالة من العلامات الحمراء وموانع التطبيق الفيزيائي قبل الجلسة.',
    bodyEn:
      'Screened clinical stability, precautions, and absence of red flags prior to initiating modalities and loading.',
    category: 'subjective',
    packId: 'physiorecord-cc0-core',
    source: 'PhysioRecord Original Authored Template',
    license: 'CC0-1.0',
    isBuiltIn: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  },
  {
    id: 'cc0-dc',
    slashTrigger: 'dc',
    titleAr: 'توصية جاهزية التخريج',
    titleEn: 'Discharge Readiness Summary',
    bodyAr:
      'استوفى المريض الأهداف الوظيفية المخططة مع استقلالية كاملة في برنامج الوقاية والتمارين المنزلية الذاتية.',
    bodyEn:
      'Patient has achieved functional episode goals and demonstrated independent self-management with maintenance HEP.',
    category: 'plan',
    packId: 'physiorecord-cc0-core',
    source: 'PhysioRecord Original Authored Template',
    license: 'CC0-1.0',
    isBuiltIn: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
  },
];

const PERMITTED_CONTENT_PACK_LICENSES = new Set([
  'CC0-1.0',
  'CC0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'CC BY 4.0',
  'MIT',
  'APACHE-2.0',
  'ISC',
  'PUBLIC DOMAIN',
  'UNLICENSE',
]);

export function parseAndValidateContentPackJson(rawJson: string): {
  pack: ContentPackDefinition;
  snippets: NoteTemplateSnippet[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('ملف حزمة المحتوى ليس بتنسيق JSON صالح.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('بنية حزمة المحتوى غير صالحة.');
  }

  const obj = parsed as Record<string, unknown>;
  const packId = typeof obj.packId === 'string' ? obj.packId.trim() : '';
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  const source = typeof obj.source === 'string' ? obj.source.trim() : '';
  const license = typeof obj.license === 'string' ? obj.license.trim() : '';
  const version = typeof obj.version === 'string' ? obj.version.trim() : '1.0.0';

  if (!packId || !name) {
    throw new Error('حزمة المحتوى تفتقر إلى packId أو name.');
  }
  if (!source || !license) {
    throw new Error(
      'حزمة المحتوى يجب أن تتضمن بيانات المصدر (source) والرخصة (license) بوضوح.'
    );
  }

  const normalizedLic = license.toUpperCase();
  if (
    normalizedLic.includes('NC') ||
    normalizedLic.includes('ND') ||
    normalizedLic.includes('PROPRIETARY') ||
    !PERMITTED_CONTENT_PACK_LICENSES.has(normalizedLic)
  ) {
    throw new Error(
      `رخصة حزمة المحتوى "${license}" مرفوضة وفق سياسة المصدر المفتوح (يُسمح فقط بـ CC0-1.0, CC-BY, MIT, Apache-2.0, Public Domain بدون قيود NC/ND).`
    );
  }

  if (!Array.isArray(obj.snippets) || obj.snippets.length === 0) {
    throw new Error('حزمة المحتوى لا تحتوي على أي قوالب (snippets).');
  }
  if (obj.snippets.length > 200) {
    throw new Error('تتجاوز حزمة المحتوى الحد الأقصى (200 قالب لكل حزمة).');
  }

  const validCategories = new Set<NoteTemplateCategory>([
    'subjective',
    'objective',
    'assessment',
    'plan',
    'general',
  ]);
  const nowIso = new Date().toISOString();
  const snippets: NoteTemplateSnippet[] = [];

  for (let i = 0; i < obj.snippets.length; i++) {
    const rawSnip = obj.snippets[i];
    if (!rawSnip || typeof rawSnip !== 'object') continue;
    const s = rawSnip as Record<string, unknown>;
    const trigger = String(s.slashTrigger || '')
      .replace(/^\/+/, '')
      .trim()
      .toLowerCase();
    const titleAr = String(s.titleAr || '').trim();
    const titleEn = String(s.titleEn || '').trim();
    const bodyAr = String(s.bodyAr || '').trim();
    const bodyEn = String(s.bodyEn || '').trim();
    const categoryRaw = String(s.category || 'general') as NoteTemplateCategory;
    const category: NoteTemplateCategory = validCategories.has(categoryRaw)
      ? categoryRaw
      : 'general';

    if (!trigger || (!bodyAr && !bodyEn)) {
      throw new Error(`القالب رقم ${i + 1} يفتقد الاختصار (slashTrigger) أو النص.`);
    }

    snippets.push({
      id: `pack-${packId}-${String(s.id || trigger || i)}`,
      slashTrigger: trigger,
      titleAr: titleAr || titleEn || trigger,
      titleEn: titleEn || titleAr || trigger,
      bodyAr: bodyAr || bodyEn,
      bodyEn: bodyEn || bodyAr,
      category,
      packId,
      source,
      license,
      isBuiltIn: false,
      updatedAt: nowIso,
      version: 1,
    });
  }

  return {
    pack: {
      packId,
      name,
      version,
      source,
      license,
      author: typeof obj.author === 'string' ? obj.author.trim() : undefined,
      snippets: obj.snippets as ContentPackDefinition['snippets'],
    },
    snippets,
  };
}
