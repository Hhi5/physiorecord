// =======================================================================
// PhysioRecord — Phase F Pure Utilities (F1–F5)
// - F1: Settings search catalog & Simple/Advanced view mode filtering
// - F2: 4-step Onboarding Checklist progress computation
// - F3: Bundled Semantic Versioning CHANGELOG & Dexie v1–v10 Migration Guide
// - F4: Public Demo Mode detection & synthetic dataset helpers
// - F5: Community Content Pack license & source metadata validator
// =======================================================================

import type {
  BackupStateMetadata,
  ChangelogReleaseEntry,
  ClinicProfileData,
  CommunityContentPackValidationResult,
  DexieMigrationVersionEntry,
  OnboardingChecklistStepStatus,
  OnboardingChecklistSummary,
  SettingsSearchableItem,
  SettingsViewMode,
} from '../types/clinicManagement';
import { normalizeArabicSearchText } from './arabicSearch';

export const APP_SEMVER_VERSION = '1.1.0';

// -----------------------------------------------------------------------
// F1: Settings Search Catalog & Simple/Advanced Mode Filtering
// -----------------------------------------------------------------------
export const SETTINGS_SEARCHABLE_CATALOG: ReadonlyArray<SettingsSearchableItem> = [
  {
    id: 'hub-clinic-profile',
    tab: 'clinic',
    isAdvanced: false,
    categoryAr: 'ملف العيادة والوصولات',
    categoryEn: 'Clinic Profile & Receipts',
    titleAr: 'اسم العيادة، المعالج، الهاتف، الشعار وقوالب واتساب',
    titleEn: 'Clinic Name, Therapist, Phone, Logo & WhatsApp Templates',
    descAr: 'تخصيص ترويسة المطبوعات، الشعار، الختم، ومدة الجلسة الافتراضية.',
    descEn: 'Configure printed receipt headers, logo, stamp, and default session duration.',
    keywords: ['عيادة', 'شعار', 'ختم', 'واتساب', 'هاتف', 'clinic', 'profile', 'logo', 'whatsapp', 'header'],
  },
  {
    id: 'hub-backup-restore',
    tab: 'security',
    isAdvanced: false,
    categoryAr: 'النسخ الاحتياطي والاسترداد',
    categoryEn: 'Backup & Recovery',
    titleAr: 'النسخ الاحتياطي المشفر (.ptbackup) وتمرين الاسترداد',
    titleEn: 'Encrypted Vault Backup (.ptbackup) & Recovery Drill',
    descAr: 'حفظ نسخة احتياطية مشفرة، التحقق من مفتاح الطوارئ (32 حرفاً)، وتصدير الأرشيف.',
    descEn: 'Create encrypted backups, verify the 32-char recovery key, and export full vault archives.',
    keywords: ['نسخ', 'احتياطي', 'استعادة', 'مفتاح', 'طوارئ', 'backup', 'restore', 'recovery', 'drill', 'export'],
  },
  {
    id: 'hub-security-lock',
    tab: 'security',
    isAdvanced: false,
    categoryAr: 'الأمان والقفل التلقائي',
    categoryEn: 'Security & Auto-Lock',
    titleAr: 'مهلة القفل التلقائي، البصمة (WebAuthn)، ورمز المشرف (PIN)',
    titleEn: 'Auto-Lock Timer, Passkey/Biometric Unlock & Admin PIN',
    descAr: 'تحديد وقت عدم النشاط (أو أبداً)، تفعيل البصمة، وحماية الإجراءات الحساسة.',
    descEn: 'Set inactivity auto-lock timeout (including Never), passkey unlock, and Admin PIN.',
    keywords: ['أمان', 'قفل', 'بصمة', 'رمز', 'تشفير', 'security', 'lock', 'timeout', 'pin', 'passkey', 'never'],
  },
  {
    id: 'hub-language-accessibility',
    tab: 'display',
    isAdvanced: false,
    categoryAr: 'اللغة والمظهر وإمكانية الوصول',
    categoryEn: 'Language, Appearance & Accessibility',
    titleAr: 'اللغة (عربي / کوردی / EN)، الوضع الليلي، الخطوط وحجم العرض',
    titleEn: 'Language (AR / CKB / EN), Dark Mode, Custom Fonts & Accessibility',
    descAr: 'تبديل لغة الواجهة، رفع خط مخصص، تكبير الخط، التباين العالي وتقليل الحركة.',
    descEn: 'Switch UI language, upload custom fonts, adjust font scale, high contrast & reduced motion.',
    keywords: ['لغة', 'كردي', 'عربي', 'خط', 'حجم', 'ليلي', 'تباين', 'language', 'kurdish', 'font', 'display', 'theme', 'accessibility'],
  },
  {
    id: 'hub-currency',
    tab: 'currency',
    isAdvanced: false,
    categoryAr: 'العملة والفوترة',
    categoryEn: 'Currency & Billing',
    titleAr: 'العملة الأساسية للعيادة (الدينار العراقي د.ع وعملات العالم)',
    titleEn: 'Primary Clinic Currency (IQD & ISO 4217 World Currencies)',
    descAr: 'اختيار العملة الافتراضية مع عرض رمز العملة بعد الرقم (25,000 د.ع).',
    descEn: 'Select default currency with post-number symbol formatting (25,000 IQD).',
    keywords: ['عملة', 'دينار', 'عراقي', 'دولار', 'currency', 'iqd', 'dinar', 'usd', 'money'],
  },
  {
    id: 'hub-modules-essential',
    tab: 'modules',
    isAdvanced: false,
    categoryAr: 'الأقسام والميزات السريرية',
    categoryEn: 'Clinical & Operational Modules',
    titleAr: 'تفعيل أو إخفاء أقسام العيادة (الزيارات المنزلية، الأقساط، المشاركة، القوالب)',
    titleEn: 'Toggle Clinic Modules (Home Visits, Installments, Sharing, Templates)',
    descAr: 'التحكم بتفعيل مكتبة التمارين، الزيارات المنزلية، خطط الأقساط، مشاركة التقارير وقياس الصور.',
    descEn: 'Enable or hide HEP library, home visits, installment plans, Web Share, .ics export & photo tools.',
    keywords: ['أقسام', 'وحدات', 'تمارين', 'منزلية', 'أقساط', 'مشاركة', 'modules', 'features', 'hep', 'installments', 'share'],
  },
  {
    id: 'adv-staff-roster',
    tab: 'staff',
    isAdvanced: true,
    categoryAr: 'إدارة الكادر والصلاحيات (متقدم)',
    categoryEn: 'Staff Roster & RBAC (Advanced)',
    titleAr: 'أعضاء الكادر وتعدد المعالجين وصلاحيات الاستقبال',
    titleEn: 'Multi-Staff Roster, Therapists & Reception Role Permissions',
    descAr: 'إضافة معالجين وموظفي استقبال وتخصيص الصلاحيات في وضع الفريق.',
    descEn: 'Manage multiple therapists and receptionists in Team Workspace mode.',
    keywords: ['كادر', 'معالجين', 'موظفين', 'صلاحيات', 'فريق', 'staff', 'team', 'roles', 'rbac'],
  },
  {
    id: 'adv-crypto-rotation',
    tab: 'security',
    isAdvanced: true,
    categoryAr: 'التشفير المتقدم وتدوير المفاتيح',
    categoryEn: 'Advanced Cryptography & Key Rotation',
    titleAr: 'تدوير مفتاح التشفير (DEK Rotation) وإحصاءات AES-GCM',
    titleEn: 'Manual DEK Key Rotation & AES-GCM Invocation Telemetry',
    descAr: 'إعادة تشفير جميع السجلات بمفتاح جديد ومراقبة عداد عمليات التشفير.',
    descEn: 'Re-encrypt all records under a fresh AES-GCM key and inspect invocation counters.',
    keywords: ['تدوير', 'مفتاح', 'تشفير', 'خزنة', 'dek', 'rotation', 'aes', 'gcm', 'crypto'],
  },
  {
    id: 'adv-widget-studio',
    tab: 'modules',
    isAdvanced: true,
    categoryAr: 'استوديو المقاييس المخصصة (متقدم)',
    categoryEn: 'Custom Widget Studio (Advanced)',
    titleAr: 'تصميم مقاييس واستبيانات سريرية مخصصة (Custom Widget Studio)',
    titleEn: 'Custom Clinical Outcome & Assessment Widget Builder',
    descAr: 'إنشاء بطاقات فحص ومقاييس رقمية مخصصة داخل جلسة العلاج.',
    descEn: 'Build custom numeric/checklist clinical assessment widgets for SOAP notes.',
    keywords: ['استوديو', 'مقاييس', 'مخصصة', 'ويدجت', 'widget', 'studio', 'custom', 'builder'],
  },
  {
    id: 'adv-developer-demo',
    tab: 'developer',
    isAdvanced: true,
    categoryAr: 'المطور والبيانات التجريبية (CC0)',
    categoryEn: 'Developer & Synthetic Demo Data (CC0)',
    titleAr: 'مولد البيانات التجريبية العراقية (CC0) ووضع العرض العام (Public Demo)',
    titleEn: 'Iraqi Synthetic Data Generator (CC0) & Public Demo Mode',
    descAr: 'توليد حالات سريرية عراقية وهمية للتجربة والعروض وحذفها بنقرة واحدة.',
    descEn: 'Seed fictional Iraqi clinical cases for demos/testing and purge in one click.',
    keywords: ['مطور', 'تجريبي', 'بيانات', 'ديمو', 'developer', 'demo', 'synthetic', 'seed', 'cc0'],
  },
];

export function matchesSettingsSearch(query: string, ...texts: Array<string | undefined>): boolean {
  const cleanQuery = normalizeArabicSearchText(query || '').trim();
  if (!cleanQuery) return true;
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  const haystack = normalizeArabicSearchText(texts.filter(Boolean).join(' '));
  return tokens.every((tok) => haystack.includes(tok));
}

export function filterSettingsCatalog(
  query: string,
  mode: SettingsViewMode
): SettingsSearchableItem[] {
  const hasSearch = Boolean(query && query.trim());
  return SETTINGS_SEARCHABLE_CATALOG.filter((item) => {
    // When user actively types a search query, search across ALL items (even advanced) so nothing is hidden from search
    if (!hasSearch && mode === 'simple' && item.isAdvanced) {
      return false;
    }
    return matchesSettingsSearch(
      query,
      item.categoryAr,
      item.categoryEn,
      item.titleAr,
      item.titleEn,
      item.descAr,
      item.descEn,
      ...item.keywords
    );
  });
}

// -----------------------------------------------------------------------
// F2: Dismissible 4-Step Onboarding Checklist Computation
// -----------------------------------------------------------------------
export function computeOnboardingChecklistSummary(params: {
  clinicProfile: ClinicProfileData;
  patientCount: number;
  backupMeta: BackupStateMetadata;
  lastRecoveryDrillAt?: string | null;
  isDismissed?: boolean;
}): OnboardingChecklistSummary {
  const { clinicProfile, patientCount, backupMeta, lastRecoveryDrillAt, isDismissed = false } =
    params;

  const hasCustomProfile = Boolean(
    (clinicProfile.clinicNameAr &&
      clinicProfile.clinicNameAr.trim() !== '' &&
      clinicProfile.clinicNameAr.trim() !== 'عيادة العلاج الطبيعي والتأهيل') ||
      (clinicProfile.clinicNameEn &&
        clinicProfile.clinicNameEn.trim() !== '' &&
        clinicProfile.clinicNameEn.trim() !== 'Physical Therapy & Rehab Clinic') ||
      (clinicProfile.phone && clinicProfile.phone.trim() !== '') ||
      (clinicProfile.addressAr && clinicProfile.addressAr.trim() !== '') ||
      (clinicProfile.logoDataUrl && clinicProfile.logoDataUrl.trim() !== '') ||
      (clinicProfile.version && clinicProfile.version > 1)
  );

  const hasFirstPatient = patientCount > 0;
  const hasFirstBackup = Boolean(backupMeta.lastBackupAt || backupMeta.lastVerifiedBackupAt);
  const hasVerifiedRecoveryKey = Boolean(
    lastRecoveryDrillAt || backupMeta.lastVerifiedBackupAt || backupMeta.lastBackupVerified
  );

  const steps: OnboardingChecklistStepStatus[] = [
    {
      id: 'clinic_profile',
      completed: hasCustomProfile,
      titleAr: 'إعداد ملف العيادة والوصولات',
      titleEn: 'Create Clinic Profile',
      titleCkb: 'ڕێکخستنی پڕۆفایلی کلینیک',
      descAr: 'أدخل اسم العيادة، اسم المعالج، ورقم الهاتف لتظهر في التقارير والوصولات.',
      descEn: 'Add your clinic name, therapist title, and phone for printed receipts & reports.',
      ctaAr: 'إعداد ملف العيادة',
      ctaEn: 'Setup Profile',
    },
    {
      id: 'first_patient',
      completed: hasFirstPatient,
      titleAr: 'إضافة أول مريض في السجل',
      titleEn: 'Add First Patient',
      titleCkb: 'زیادکردنی یەکەم نەخۆش',
      descAr: 'سجّل أول مراجع فعلي أو استورد قائمة مرضى للبدء بتوثيق الجلسات.',
      descEn: 'Register your first patient or walk-in to start documenting sessions.',
      ctaAr: 'إضافة مريض',
      ctaEn: 'Add Patient',
    },
    {
      id: 'first_backup',
      completed: hasFirstBackup,
      titleAr: 'حفظ أول نسخة احتياطية مشفرة',
      titleEn: 'Take First Backup',
      titleCkb: 'هەڵگرتنی یەکەم کۆپی یەدەگ',
      descAr: 'احفظ ملف نسخة احتياطية (.ptbackup) لحماية بيانات العيادة على جهازك.',
      descEn: 'Download an encrypted .ptbackup file to safeguard clinic records offline.',
      ctaAr: 'نسخ احتياطي الآن',
      ctaEn: 'Backup Now',
    },
    {
      id: 'verify_recovery_key',
      completed: hasVerifiedRecoveryKey,
      titleAr: 'التحقق من مفتاح استرداد الطوارئ',
      titleEn: 'Verify Recovery Key',
      titleCkb: 'پشتڕاستکردنەوەی کلیلی فریاگوزاری',
      descAr: 'نفّذ تمرين التحقق السريع للتأكد من جاهزية مفتاح الطوارئ (32 حرفاً).',
      descEn: 'Run a 15-second recovery drill to confirm your 32-character emergency key works.',
      ctaAr: 'تأكيد المفتاح',
      ctaEn: 'Verify Key',
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;

  return {
    steps,
    completedCount,
    totalCount: steps.length,
    allCompleted: completedCount === steps.length,
    isDismissed,
  };
}

// -----------------------------------------------------------------------
// F3: Bundled Semantic Versioning CHANGELOG & Dexie v1–v10 Migration Guide
// -----------------------------------------------------------------------
export const BUNDLED_CHANGELOG_RELEASES: ReadonlyArray<ChangelogReleaseEntry> = [
  {
    version: '1.1.0',
    date: '2026-11-14',
    tagAr: 'الإصدار الحالي · مراحل الإضافة السريرية والعراقية (A–F)',
    tagEn: 'Current Release · Clinical & Iraqi Operations Addendum (Phases A–F)',
    titleAr: 'مرونة انقطاع الكهرباء، سرعة التوثيق، العمليات العراقية، جودة البيانات، والمشاركة المحلية',
    titleEn: 'Power-Cut Resilience, Clinical Speed, Iraqi Clinic Ops, Data Quality & Sharing Interop',
    highlightsAr: [
      'المرحلة A (الأداء وحفظ المسودات): حفظ تلقائي فوري للمسودات المشفرة في IndexedDB (Dexie v10) كل 2 ثانية وعند إخفاء التبويب لمنع ضياع أي حرف عند انقطاع الكهرباء، مع قوائم افتراضية سريعة لآلاف السجلات.',
      'المرحلة B (السرعة والسلامة السريرية): قوالب فحص بضغطة واحدة لـ 9 مناطق تشريحية، قائمة المشاكل والأهداف مع حساب التغير المهم سريرياً (MCID)، تنبيهات إعادة التقييم، فحص أمان أجهزة العلاج الطبيعي (TENS/US/Laser...) مع المراجع، العلامات الحيوية، وضوابط طب الأطفال.',
      'المرحلة C (عمليات العيادات في العراق): دعم الزيارات المنزلية مع العنوان العراقي وأجور التنقل، تعدد فروع العيادة، أيام العطل وأوقات الاستراحة والتاريخ الهجري، خطط الأقساط وتقادم الديون (30/60/90 يوماً)، المصاريف المتكررة (المولدة/الإيجار)، سجل الأطباء المحيلين وقوائم المتابعة.',
      'المرحلة D (جودة البيانات والاستيراد): كاشف تكرار المرضى والدمج الآمن مع لقطة تراجع مشفرة، معالج استيراد CSV/XLSX مع المعاينة التجريبية والتراجع الكامل، سلة مهملات لمدة 30 يوماً، شاشة صحة البيانات، ومعجم المصطلحات ثنائي اللغة.',
      'المرحلة E (المشاركة والتصدير): مشاركة التقارير والوصولات عبر نظام الجهاز أو واتساب (+964)، تصدير المواعيد لتقويم الهاتف (.ics) مع خيارات الخصوصية، طباعة جدول الغد وبطاقة مواعيد المريض، وأدوات قياس الزوايا والشاقول على الصور.',
      'المرحلة F (الإعدادات المبسطة، دليل البدء، والمجتمع مفتوح المصدر): بحث فوري في الإعدادات مع مفتاح الوضع المبسط/المتقدم، قائمة خطوات البدء للعيادة، نافذة "ما الجديد" ودليل ترقيات Dexie (v1–v10)، ووضع العرض العام (Public Demo).',
    ],
    highlightsEn: [
      'Phase A (Resilience & Speed): Power-cut durable encrypted draft store (Dexie v10) flushing on 2s debounce & visibilitychange, plus windowed virtualization and strict 6x CPU performance budgets.',
      'Phase B (Clinical Workflow & Safety): 1-tap regional exam presets across 9 regions, Problem List & Goals linked to MCID outcome deltas, re-evaluation nudges, cited modality contraindication safety rules, vitals alerts, and pediatric safeguards.',
      'Phase C (Iraq-Specific Operations): Home-visit scheduling with Iraqi address fields & travel fees, multi-location filter, closed days/breaks & optional Hijri date, installment plans & 30/60/90+ day debt aging, recurring expenses (generator/rent), referring doctors & retention lists.',
      'Phase D (Data Quality & Safe Import): Duplicate patient guard + transactional merge with encrypted undo snapshot, CSV/XLSX import wizard with dry-run & rollback, 30-day non-clinical recycle bin, Data Health scanner, and bilingual terminology glossary.',
      'Phase E (Sharing & Interop): Web Share API & +964 WhatsApp fallbacks, privacy-first .ics calendar export, tomorrow schedule & patient visit card printing, and 3-point photo angle & plumb-line studio.',
      'Phase F (Settings, Onboarding & Open Source): Searchable Settings with Simple/Advanced switch, dismissible 4-step onboarding checklist, in-app What\'s New & Dexie v1–v10 migration guide, and badged Public Demo Mode.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-13',
    tagAr: 'الإصدار الأساسي الأول (Phases 0–7)',
    tagEn: 'Initial Core Release (Phases 0–7)',
    titleAr: 'الخزنة المحلية المشفرة (AES-256-GCM)، دعم العربية والكردية والإنجليزية، وتخصيصات العيادات العراقية',
    titleEn: 'Local Encrypted Vault (AES-256-GCM), Trilingual AR/CKB/EN UI & Iraqi Clinic Customizations',
    highlightsAr: [
      'تشفير محلي كامل (AES-256-GCM + PBKDF2-SHA256 بـ 600,000 تكرار + HKDF-SHA256 لكل سجل) بدون أي خادم خارجي أو تتبع.',
      'دعم الحجز المتزامن لأكثر من مريض في نفس الوقت، اللغة الكردية السورانية (کوردی)، وتخصيص الخطوط والعرض.',
      'الفوترة بالدينار العراقي (25,000 د.ع بعد الرقم) مع بدايات صفرية وطرق الدفع العراقية (نقداً، زين كاش، كي كارد، أخرى).',
      'نافذة المعاينة السريعة لملف المريض، المرفقات وتقارير الأشعة والرنين المتعددة، ومخطط الجسم مع أنواع وألوان ألم مخصصة.',
    ],
    highlightsEn: [
      'Zero-server WebCrypto vault (AES-256-GCM + 600,000-iteration PBKDF2-SHA256 + per-record HKDF-SHA256) with zero external network requests.',
      'Concurrent multi-patient slot booking, complete Kurdish Sorani (ckb) localization, and custom font upload & display preferences.',
      'Iraqi Dinar post-number formatting (25,000 IQD), blank financial defaults, and Iraqi payment methods (Cash, ZainCash, QiCard, Other).',
      'Read-only Patient Quick-View modal, multi-report MRI/X-Ray queue, and Body Chart custom pain types & colors.',
    ],
  },
];

export const DEXIE_MIGRATION_GUIDE_V1_TO_V10: ReadonlyArray<DexieMigrationVersionEntry> = [
  {
    version: 1,
    storesAdded: ['patients', 'episodes', 'sessions', 'soapNotes', 'vaultMeta'],
    summaryAr: 'القاعدة السريرية المشفرة الأساسية للمرضى والحلقات العلاجية والجلسات وملاحظات SOAP.',
    summaryEn: 'Initial encrypted core clinical database for patients, episodes, sessions, and SOAP notes.',
    upgradeBehaviorAr: 'إنشاء الجداول الأساسية ومفاتيح التشفير المغلفة.',
    upgradeBehaviorEn: 'Initializes core clinical stores and wrapped vault metadata.',
  },
  {
    version: 2,
    storesAdded: ['patients (isArchived index)'],
    summaryAr: 'إضافة فهرس الأرشفة الآمنة للمرضى مع الحفاظ على توافق بيانات الخزنة.',
    summaryEn: 'Added soft-archive indexing for patients and vault metadata upgrade hook.',
    upgradeBehaviorAr: 'ترقية غيرتلافية تحافظ على جميع سجلات الإصدار الأول.',
    upgradeBehaviorEn: 'Non-destructive upgrade preserving all v1 encrypted records.',
  },
  {
    version: 3,
    storesAdded: ['clinicalAddenda'],
    summaryAr: 'إضافة جدول الملاحق الطبية غير القابلة للحذف (Append-Only Clinical Addenda).',
    summaryEn: 'Added append-only clinicalAddenda store enforcing immutable finalized SOAP notes.',
    upgradeBehaviorAr: 'منع حذف أي جلسة أو مريض مرتبط بملحق طبي معتمد.',
    upgradeBehaviorEn: 'Permanently protects sessions and patients that have signed clinical addenda.',
  },
  {
    version: 4,
    storesAdded: ['episodeSequences'],
    summaryAr: 'عدادات تسلسل الجلسات المستقلة لكل حلقة علاجية لمنع تكرار أرقام الجلسات.',
    summaryEn: 'Added monotonic per-episode session sequence counters safe against draft deletion.',
    upgradeBehaviorAr: 'يُعاد بناؤه تلقائياً من أعلى رقم جلسة عند استعادة النسخ الاحتياطية.',
    upgradeBehaviorEn: 'Device-local counter automatically reconstructed from max(sessionNumber) on restore.',
  },
  {
    version: 5,
    storesAdded: [
      'appointments',
      'waitingList',
      'invoices',
      'payments',
      'expenses',
      'auditLogs',
      'staffState',
      'episodeClinical',
      'migrationState',
    ],
    summaryAr: 'إضافة جداول إدارة العيادة والمواعيد والفواتير وسجل التدقيق والتقييمات السريرية.',
    summaryEn: 'Added full clinic operations, billing, hash-chained audit logs, and episode clinical stores.',
    upgradeBehaviorAr: 'نقل البيانات القديمة من localStorage إلى IndexedDB المشفر مع التحقق الذري.',
    upgradeBehaviorEn: 'Idempotent transactional localStorage-to-Dexie migration with zero PHI left in localStorage.',
  },
  {
    version: 6,
    storesAdded: ['waitingList (patientId)', 'auditLogs (patientId, episodeId)'],
    summaryAr: 'إضافة فهارس ربط قائمة الانتظار وسجل التدقيق بمعرف المريض.',
    summaryEn: 'Added patientId/episodeId indexes on waitingList and auditLogs for fast lookups.',
    upgradeBehaviorAr: 'تحديث الفهارس تلقائياً دون المساس بالحمولة المشفرة.',
    upgradeBehaviorEn: 'Index-only schema expansion; encrypted payloads remain untouched.',
  },
  {
    version: 7,
    storesAdded: [
      'customWidgets',
      'migrationReports',
      'recurringSchedules',
      'recurringSkippedDates',
      'clinicSettings',
      'patientMedications',
      'fsHandles',
    ],
    summaryAr: 'إضافة إعدادات العيادة المشفرة، الجداول المتكررة، الأدوية، والمقاييس المخصصة.',
    summaryEn: 'Added encrypted clinicSettings, recurring schedules, medications, and custom widgets.',
    upgradeBehaviorAr: 'تخزين جميع إعدادات العيادة مشفرة داخل clinicSettings.',
    upgradeBehaviorEn: 'Persists all clinic configuration encrypted inside clinicSettings.',
  },
  {
    version: 8,
    storesAdded: ['consents', 'cashCloses'],
    summaryAr: 'إضافة جدول الموافقات المستنيرة الموقعة وتقارير الإغلاق اليومي للصندوق (Z-Reports).',
    summaryEn: 'Added signed informed consents and daily cash close Z-Report stores.',
    upgradeBehaviorAr: 'تضمين الموافقات وتقارير الصندوق تلقائياً في النسخ الاحتياطية .ptbackup.',
    upgradeBehaviorEn: 'Automatically registered in CLINICAL_STORES_REGISTRY for portable backups.',
  },
  {
    version: 9,
    storesAdded: ['attachments', 'noteTemplates'],
    summaryAr: 'إضافة المرفقات السريرية وصور القوام المشفرة وقوالب الملاحظات السريرية (CC0).',
    summaryEn: 'Added encrypted binary patient attachments and CC0 clinical note template packs.',
    upgradeBehaviorAr: 'دعم النسخ الاحتياطي المجزأ والمضغوط (.ptbackup V3.0) للملفات الكبيرة.',
    upgradeBehaviorEn: 'Paired with chunked gzipped .ptbackup V3.0 format for large attachment vaults.',
  },
  {
    version: 10,
    storesAdded: ['drafts'],
    summaryAr: 'جدول المسودات المشفرة المقاوم لانقطاع التيار الكهربائي أو إغلاق المتصفح المفاجئ (Phase A).',
    summaryEn: 'Power-cut resilient encrypted in-progress form drafts store (Phase A).',
    upgradeBehaviorAr: 'محلي للجهاز (مستثنى من النسخ الاحتياطية الخارجية) ويُستعاد فور فتح الخزنة.',
    upgradeBehaviorEn: 'Device-local store recovered automatically on vault unlock via RecoveredWorkBanner.',
  },
];

// -----------------------------------------------------------------------
// F4: Public Demo Mode Detection
// -----------------------------------------------------------------------
export function isPublicDemoUrlOrEnv(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_DEMO === 'true') {
      return true;
    }
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const demoParam = params.get('demo') || params.get('publicDemo');
      if (demoParam === '1' || demoParam === 'true') {
        return true;
      }
    }
  } catch {
    // Ignore environment access errors in isolated test runners
  }
  return false;
}

// -----------------------------------------------------------------------
// F5: Community Content Pack Repository Convention Validator
// -----------------------------------------------------------------------
export const ALLOWED_CONTENT_PACK_LICENSES = [
  'CC0-1.0',
  'CC-BY-4.0',
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
] as const;

export function validateCommunityContentPackMetadata(
  rawJson: string
): CommunityContentPackValidationResult {
  const errors: string[] = [];
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return {
      valid: false,
      errors: ['Invalid JSON syntax / صيغة ملف JSON غير صالحة'],
      snippetCount: 0,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      errors: ['Root element must be a JSON object / يجب أن يكون الجذر كائن JSON'],
      snippetCount: 0,
    };
  }

  const packId = typeof parsed.packId === 'string' ? parsed.packId.trim() : '';
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
  const license = typeof parsed.license === 'string' ? parsed.license.trim() : '';
  const source = typeof parsed.source === 'string' ? parsed.source.trim() : '';
  const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
  const snippets = Array.isArray(parsed.snippets) ? parsed.snippets : [];

  if (!packId) {
    errors.push('Missing required "packId" identifier.');
  }
  if (!name) {
    errors.push('Missing required "name" field.');
  }
  if (!version) {
    errors.push('Missing required semantic "version" field (e.g. "1.0.0").');
  }
  if (!source) {
    errors.push('Missing required "source" attribution/provenance field.');
  }
  if (
    !license ||
    !(ALLOWED_CONTENT_PACK_LICENSES as readonly string[]).includes(license)
  ) {
    errors.push(
      `Invalid or missing SPDX "license". Allowed: ${ALLOWED_CONTENT_PACK_LICENSES.join(', ')}.`
    );
  }
  if (snippets.length === 0) {
    errors.push('Content pack must contain at least one snippet in "snippets".');
  }

  return {
    valid: errors.length === 0,
    errors,
    packId: packId || undefined,
    license: license || undefined,
    source: source || undefined,
    snippetCount: snippets.length,
  };
}
