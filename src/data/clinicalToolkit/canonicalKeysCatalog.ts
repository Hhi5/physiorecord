// =======================================================================
// PhysioRecord — Canonical Clinical Assessment Keys & Bilingual Autocomplete
// Phase 3.1: Stable canonical keys for MMT, ROM, Special Tests & Custom Widgets
// Non-destructive best-effort mapping: preserves free text with canonicalKey | null.
// =======================================================================

import type {
  ClinicalContentGovernance,
  MmtMeasurementEntry,
  RomMeasurementEntry,
} from '../../types/clinical';
import type {
  CustomWidgetField,
  OrthopedicSpecialTestItem,
} from '../../types/clinicalWidgets';

export interface CanonicalConceptEntry {
  canonicalKey: string;
  category: 'mmt' | 'rom' | 'special_test' | 'custom_field';
  region: string;
  labelAr: string;
  labelEn: string;
  actionAr?: string;
  actionEn?: string;
  aliases: string[];
  governance: ClinicalContentGovernance;
}

const DEFAULT_CANONICAL_GOVERNANCE: ClinicalContentGovernance = {
  source: 'PhysioRecord Clinical Terminology Working Group (Kendall / Magee / Norkin & White)',
  reviewedBy: null,
  reviewedDate: null,
};

export const CANONICAL_MMT_CONCEPTS: CanonicalConceptEntry[] = [
  {
    canonicalKey: 'mmt.cervical.flexors',
    category: 'mmt',
    region: 'cervical',
    labelAr: 'عاطفات الرقبة (Longus capitis / colli)',
    labelEn: 'Cervical Flexors',
    actionAr: 'ثني الرقبة وإيماءة الرأس',
    actionEn: 'Cervical Flexion',
    aliases: ['cervical_flexors', 'cervical flexors', 'deep neck flexors', 'عاطفات الرقبة', 'ثني الرقبة'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.shoulder.flexors',
    category: 'mmt',
    region: 'shoulder',
    labelAr: 'عاطفات الكتف (Anterior Deltoid & Coracobrachialis)',
    labelEn: 'Shoulder Flexors',
    actionAr: 'ثني الكتف للأمام',
    actionEn: 'Shoulder Flexion',
    aliases: ['shoulder_flexors', 'shoulder flexors', 'anterior deltoid', 'عاطفات الكتف', 'ثني الكتف'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.shoulder.abductors',
    category: 'mmt',
    region: 'shoulder',
    labelAr: 'مبعدات الكتف (Deltoid & Supraspinatus)',
    labelEn: 'Shoulder Abductors',
    actionAr: 'تبعيد الكتف للأعلى',
    actionEn: 'Shoulder Abduction',
    aliases: ['shoulder_abductors', 'shoulder abductors', 'deltoid', 'supraspinatus', 'مبعدات الكتف', 'تبعيد الكتف'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.shoulder.external_rotators',
    category: 'mmt',
    region: 'shoulder',
    labelAr: 'المدورات الخارجية للكتف (Infraspinatus & Teres Minor)',
    labelEn: 'Shoulder External Rotators',
    actionAr: 'دوران الكتف للخارج',
    actionEn: 'Shoulder External Rotation',
    aliases: [
      'shoulder_external_rotators',
      'shoulder external rotators',
      'infraspinatus',
      'teres minor',
      'المدورات الخارجية للكتف',
      'دوران خارجي للكتف',
    ],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.shoulder.internal_rotators',
    category: 'mmt',
    region: 'shoulder',
    labelAr: 'المدورات الداخلية للكتف (Subscapularis)',
    labelEn: 'Shoulder Internal Rotators',
    actionAr: 'دوران الكتف للداخل',
    actionEn: 'Shoulder Internal Rotation',
    aliases: [
      'shoulder_internal_rotators',
      'shoulder internal rotators',
      'subscapularis',
      'المدورات الداخلية للكتف',
      'دوران داخلي للكتف',
    ],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.scapular.retractors',
    category: 'mmt',
    region: 'shoulder',
    labelAr: 'مقربات لوح الكتف (Middle Trapezius & Rhomboids)',
    labelEn: 'Scapular Retractors',
    actionAr: 'تقريب لوح الكتف',
    actionEn: 'Scapular Retraction',
    aliases: ['scapular_retractors', 'rhomboids', 'middle trapezius', 'مقربات لوح الكتف', 'تقريب لوح الكتف'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.elbow.flexors',
    category: 'mmt',
    region: 'elbow_wrist',
    labelAr: 'عاطفات المرفق (Biceps & Brachialis)',
    labelEn: 'Elbow Flexors',
    actionAr: 'ثني المرفق',
    actionEn: 'Elbow Flexion',
    aliases: ['elbow_flexors', 'elbow flexors', 'biceps', 'brachialis', 'عاطفات المرفق', 'ثني المرفق'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.elbow.extensors',
    category: 'mmt',
    region: 'elbow_wrist',
    labelAr: 'باسطات المرفق (Triceps Brachii)',
    labelEn: 'Elbow Extensors',
    actionAr: 'بسط المرفق للأمام',
    actionEn: 'Elbow Extension',
    aliases: ['elbow_extensors', 'elbow extensors', 'triceps', 'باسطات المرفق', 'بسط المرفق'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.wrist.extensors',
    category: 'mmt',
    region: 'elbow_wrist',
    labelAr: 'باسطات الرسغ (ECRL, ECRB, ECU)',
    labelEn: 'Wrist Extensors',
    actionAr: 'بسط الرسغ للخلف',
    actionEn: 'Wrist Extension',
    aliases: ['wrist_extensors', 'wrist extensors', 'ecrl', 'ecrb', 'باسطات الرسغ', 'بسط الرسغ'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.wrist.flexors',
    category: 'mmt',
    region: 'elbow_wrist',
    labelAr: 'عاطفات الرسغ (FCR & FCU)',
    labelEn: 'Wrist Flexors',
    actionAr: 'ثني الرسغ',
    actionEn: 'Wrist Flexion',
    aliases: ['wrist_flexors', 'wrist flexors', 'fcr', 'fcu', 'عاطفات الرسغ', 'ثني الرسغ'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.lumbar.extensors',
    category: 'mmt',
    region: 'spine',
    labelAr: 'باسطات الجذع (Erector Spinae)',
    labelEn: 'Trunk / Lumbar Extensors',
    actionAr: 'بسط الجذع للخلف',
    actionEn: 'Trunk Extension',
    aliases: ['trunk_extensors', 'lumbar_extensors', 'erector spinae', 'باسطات الجذع', 'باسطات الظهر'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.hip.flexors',
    category: 'mmt',
    region: 'hip',
    labelAr: 'عاطفات الورك (Iliopsoas)',
    labelEn: 'Hip Flexors',
    actionAr: 'ثني مفصل الورك',
    actionEn: 'Hip Flexion',
    aliases: ['hip_flexors', 'hip flexors', 'iliopsoas', 'psoas', 'عاطفات الورك', 'ثني الورك'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.hip.abductors',
    category: 'mmt',
    region: 'hip',
    labelAr: 'مبعدات الورك (Gluteus Medius & Minimus)',
    labelEn: 'Hip Abductors',
    actionAr: 'تبعيد الفخذ للوحشي',
    actionEn: 'Hip Abduction',
    aliases: ['hip_abductors', 'hip abductors', 'gluteus medius', 'glute med', 'مبعدات الورك', 'تبعيد الورك'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.hip.extensors',
    category: 'mmt',
    region: 'hip',
    labelAr: 'باسطات الورك (Gluteus Maximus)',
    labelEn: 'Hip Extensors',
    actionAr: 'بسط مفصل الورك للخلف',
    actionEn: 'Hip Extension',
    aliases: ['hip_extensors', 'hip extensors', 'gluteus maximus', 'باسطات الورك', 'بسط الورك'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.knee.extensors',
    category: 'mmt',
    region: 'knee',
    labelAr: 'باسطات الركبة (Quadriceps Femoris)',
    labelEn: 'Knee Extensors',
    actionAr: 'بسط الركبة للأمام',
    actionEn: 'Knee Extension',
    aliases: ['knee_extensors', 'knee extensors', 'quadriceps', 'quads', 'باسطات الركبة', 'رباعية الرؤوس', 'بسط الركبة'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.knee.flexors',
    category: 'mmt',
    region: 'knee',
    labelAr: 'عاطفات الركبة (Hamstrings)',
    labelEn: 'Knee Flexors',
    actionAr: 'ثني مفصل الركبة',
    actionEn: 'Knee Flexion',
    aliases: ['knee_flexors', 'knee flexors', 'hamstrings', 'عاطفات الركبة', 'أوتار الركبة', 'ثني الركبة'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.ankle.dorsiflexors',
    category: 'mmt',
    region: 'ankle',
    labelAr: 'عاطفات الكاحل الظهرية (Tibialis Anterior)',
    labelEn: 'Ankle Dorsiflexors',
    actionAr: 'عطف الكاحل للأعلى',
    actionEn: 'Ankle Dorsiflexion',
    aliases: ['ankle_dorsiflexors', 'ankle dorsiflexors', 'tibialis anterior', 'dorsiflexion', 'عاطفات الكاحل الظهرية', 'عطف ظهري للكاحل'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.ankle.plantarflexors',
    category: 'mmt',
    region: 'ankle',
    labelAr: 'عاطفات الكاحل الأخمصية (Gastrocnemius & Soleus)',
    labelEn: 'Ankle Plantarflexors',
    actionAr: 'دفع مشط القدم للأسفل',
    actionEn: 'Ankle Plantarflexion',
    aliases: ['ankle_plantarflexors', 'ankle plantarflexors', 'gastrocnemius', 'soleus', 'عاطفات الكاحل الأخمصية', 'عطف أخمصي للكاحل'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.ankle.invertors',
    category: 'mmt',
    region: 'ankle',
    labelAr: 'مقلبات الكاحل للداخل (Tibialis Posterior)',
    labelEn: 'Ankle Invertors',
    actionAr: 'انقلاب القدم للداخل',
    actionEn: 'Ankle Inversion',
    aliases: ['ankle_invertors', 'tibialis posterior', 'ankle inversion', 'انقلاب داخلي للقدم'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
  {
    canonicalKey: 'mmt.ankle.evertors',
    category: 'mmt',
    region: 'ankle',
    labelAr: 'مقلبات الكاحل للخارج (Fibularis / Peroneals)',
    labelEn: 'Ankle Evertors',
    actionAr: 'انقلاب القدم للخارج',
    actionEn: 'Ankle Eversion',
    aliases: ['ankle_evertors', 'peroneals', 'fibularis', 'ankle eversion', 'انقلاب خارجي للقدم'],
    governance: DEFAULT_CANONICAL_GOVERNANCE,
  },
];

function normalizeClinicalText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[()[\]{}.,:/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CanonicalResolutionResult {
  canonicalKey: string | null;
  label: string;
}

/**
 * Resolves a typed or legacy MMT label to a canonical key if known, preserving user text verbatim.
 * Never destroys or replaces custom free-text when no canonical match exists (`canonicalKey: null`).
 */
export function resolveMmtCanonicalKey(
  label: string,
  explicitCanonicalKey?: string | null,
  legacyMuscleGroupId?: string
): CanonicalResolutionResult {
  const cleanLabel = label.trim();
  if (explicitCanonicalKey) {
    return { canonicalKey: explicitCanonicalKey, label: cleanLabel };
  }

  const normalizedLabel = normalizeClinicalText(cleanLabel);
  const normalizedGroupId = normalizeClinicalText(legacyMuscleGroupId);

  for (const concept of CANONICAL_MMT_CONCEPTS) {
    if (
      normalizedGroupId &&
      concept.aliases.some((alias) => normalizeClinicalText(alias) === normalizedGroupId)
    ) {
      return { canonicalKey: concept.canonicalKey, label: cleanLabel || concept.labelEn };
    }
    if (!normalizedLabel) continue;
    const normAr = normalizeClinicalText(concept.labelAr);
    const normEn = normalizeClinicalText(concept.labelEn);
    if (
      normalizedLabel === normAr ||
      normalizedLabel === normEn ||
      concept.aliases.some((alias) => {
        const normAlias = normalizeClinicalText(alias);
        return (
          normalizedLabel === normAlias ||
          (normAlias.length >= 4 && normalizedLabel.includes(normAlias))
        );
      })
    ) {
      return { canonicalKey: concept.canonicalKey, label: cleanLabel };
    }
  }

  return { canonicalKey: null, label: cleanLabel };
}

export function buildRomCanonicalKey(
  jointId: string,
  movementId: string,
  laterality: string
): string {
  const cleanJoint = jointId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const cleanMov = movementId.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  const cleanLat = laterality.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return `rom.${cleanJoint}.${cleanMov}.${cleanLat}`;
}

export function normalizeRomEntryCanonical(entry: RomMeasurementEntry): RomMeasurementEntry {
  const canonicalKey =
    entry.canonicalKey ?? buildRomCanonicalKey(entry.jointId, entry.movementId, entry.laterality);
  const label =
    entry.label?.trim() || `${entry.jointNameEn || entry.jointId} - ${entry.movementNameEn || entry.movementId}`;
  return {
    ...entry,
    canonicalKey,
    label,
  };
}

export function normalizeMmtEntryCanonical(entry: MmtMeasurementEntry): MmtMeasurementEntry {
  const label =
    entry.label?.trim() ||
    entry.muscleNameAr?.trim() ||
    entry.muscleNameEn?.trim() ||
    entry.actionNameAr?.trim() ||
    entry.actionNameEn?.trim() ||
    '';
  const resolved = resolveMmtCanonicalKey(label, entry.canonicalKey, entry.muscleGroupId);
  return {
    ...entry,
    canonicalKey: resolved.canonicalKey,
    label: resolved.label,
  };
}

export function resolveSpecialTestCanonical(
  test: Pick<OrthopedicSpecialTestItem, 'id' | 'joint' | 'nameAr' | 'nameEn' | 'canonicalKey' | 'label'>
): CanonicalResolutionResult {
  const label = (test.label || test.nameEn || test.nameAr || '').trim();
  if (test.canonicalKey !== undefined) {
    return { canonicalKey: test.canonicalKey, label };
  }
  if (test.id && !test.id.startsWith('st_custom_')) {
    const cleanId = test.id.replace(/^st_/, '').toLowerCase();
    return {
      canonicalKey: `special_test.${test.joint}.${cleanId}`,
      label,
    };
  }
  const norm = normalizeClinicalText(`${test.nameEn} ${test.nameAr}`);
  const knownAliases: Array<{ pattern: RegExp; key: string }> = [
    { pattern: /\bneer\b/, key: 'special_test.shoulder.neer' },
    { pattern: /\bhawkins/, key: 'special_test.shoulder.hawkins' },
    { pattern: /\bempty can\b|\bjobe\b/, key: 'special_test.shoulder.empty_can' },
    { pattern: /\blachman\b/, key: 'special_test.knee.lachman' },
    { pattern: /\bmcmurray\b/, key: 'special_test.knee.mcmurray' },
    { pattern: /\bspurling\b/, key: 'special_test.cervical.spurling' },
    { pattern: /\bslr\b|straight leg raise|lasegue/, key: 'special_test.lumbar.slr' },
    { pattern: /\bfaber\b|\bpatrick\b/, key: 'special_test.hip.faber' },
    { pattern: /\bfinkelstein\b/, key: 'special_test.elbow_wrist.finkelstein' },
    { pattern: /anterior drawer/, key: 'special_test.ankle_foot.anterior_drawer_ankle' },
  ];
  for (const candidate of knownAliases) {
    if (candidate.pattern.test(norm)) {
      return { canonicalKey: candidate.key, label };
    }
  }
  return { canonicalKey: null, label };
}

export function canonicalizeCustomWidgetField(field: CustomWidgetField): CanonicalResolutionResult {
  const label = (field.label || field.labelEn || field.labelAr || '').trim();
  if (field.canonicalKey !== undefined) {
    return { canonicalKey: field.canonicalKey, label };
  }
  const norm = normalizeClinicalText(`${field.id} ${field.labelEn} ${field.labelAr}`);
  if (/pain|nrs|vas|الم|ألم/.test(norm)) {
    return { canonicalKey: 'custom.pain_score', label };
  }
  if (/rom|angle|degree|مدى|زاويه|زاوية/.test(norm)) {
    return { canonicalKey: 'custom.rom_angle', label };
  }
  if (/mmt|strength|power|قوه|قوة|عضل/.test(norm)) {
    return { canonicalKey: 'custom.muscle_strength', label };
  }
  if (/balance|berg|tug|توازن/.test(norm)) {
    return { canonicalKey: 'custom.balance_metric', label };
  }
  return { canonicalKey: null, label };
}

/**
 * Resolves a stable comparison grouping key across snapshots (Phase 3.1 longitudinal continuity).
 * Groups by canonicalKey when mapped; falls back safely to normalized free-text label + laterality.
 */
export function resolveLongitudinalMmtGroupKey(item: {
  canonicalKey?: string | null;
  muscleKey?: string;
  label?: string;
  labelAr?: string;
  labelEn?: string;
  laterality: string;
}): string {
  const lat = (item.laterality || 'midline').toLowerCase();
  if (item.canonicalKey) {
    return `${item.canonicalKey}::${lat}`;
  }
  // Best-effort non-destructive match on historical snapshots missing canonicalKey
  const candidateLabel = item.label || item.labelEn || item.labelAr || '';
  const inferred = resolveMmtCanonicalKey(candidateLabel, undefined, item.muscleKey);
  if (inferred.canonicalKey) {
    return `${inferred.canonicalKey}::${lat}`;
  }
  const normLabel = normalizeClinicalText(candidateLabel);
  if (normLabel) {
    return `custom::${normLabel}::${lat}`;
  }
  return `legacy::${item.muscleKey || 'unknown'}::${lat}`;
}

export function resolveLongitudinalRomGroupKey(item: {
  canonicalKey?: string | null;
  jointMovementKey: string;
  label?: string;
  labelAr?: string;
  labelEn?: string;
  laterality: string;
}): string {
  if (item.canonicalKey) {
    return item.canonicalKey;
  }
  const parts = (item.jointMovementKey || '').split('_');
  if (parts.length >= 2) {
    return buildRomCanonicalKey(parts[0], parts.slice(1, -1).join('_') || parts[1], item.laterality || 'midline');
  }
  return `rom_legacy::${normalizeClinicalText(item.label || item.labelEn || item.jointMovementKey)}::${item.laterality}`;
}
