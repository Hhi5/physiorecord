// =======================================================================
// PhysioRecord — Comprehensive Onboarding, Full-App Walkthrough,
// Per-Page Spotlight Tours & Separated Desktop/Mobile Offline Guide
// - 100% offline, persisted under physiorecord_* (auto-wiped on vault wipe)
// - First-entry Welcome & Platform Overview + 5-Stage Full-App Walkthrough
// - Per-page contextual Spotlight Tours across all 11 screens/modules
// - Explicitly separated Desktop/Laptop vs Mobile/Phone UI explanations
// - Trilingual (Arabic RTL primary, English LTR, Sorani Kurdish RTL)
// =======================================================================

export type PageTourId =
  | 'today'
  | 'reception'
  | 'schedule'
  | 'directory'
  | 'finance'
  | 'patient_chart'
  | 'session_soap'
  | 'settings'
  | 'backup_restore'
  | 'exercises'
  | 'analytics'
  | 'activity_log';

export type DeviceGuideMode = 'desktop' | 'mobile' | 'all';

export interface SpotlightStepDef {
  id: string;
  /** Fallback CSS selectors checked in order if device-specific selectors are omitted. */
  selectors: string[];
  /** Selectors specifically targeting Desktop/Laptop (>= 768px) layout elements. */
  desktopSelectors?: string[];
  /** Selectors specifically targeting Mobile/Phone (< 768px) layout elements. */
  mobileSelectors?: string[];
  titleAr: string;
  titleEn: string;
  titleCkb: string;
  bodyAr: string;
  bodyEn: string;
  bodyCkb: string;
  /** Practical usage tip shown neatly below the explanation. */
  tipAr?: string;
  tipEn?: string;
  tipCkb?: string;
  /** Optional mobile-specific override so Phone UI explanations stay 100% accurate. */
  mobileTitleAr?: string;
  mobileTitleEn?: string;
  mobileTitleCkb?: string;
  mobileBodyAr?: string;
  mobileBodyEn?: string;
  mobileBodyCkb?: string;
  mobileTipAr?: string;
  mobileTipEn?: string;
  mobileTipCkb?: string;
  /** Preferred popover side on desktop (auto-flips if near viewport edge). */
  preferredSide?: 'bottom' | 'top' | 'start' | 'end';
  /** Optional patient chart tab to activate automatically while highlighting this step. */
  chartTab?: 'overview' | 'evaluation' | 'history' | 'profile';
  /** Optional Settings tab to activate automatically while highlighting this step on Desktop. */
  settingsTab?: 'clinic' | 'display' | 'currency' | 'staff' | 'modules' | 'security' | 'developer';
}

export interface ResolvedStepContent {
  selectors: string[];
  titleAr: string;
  titleEn: string;
  titleCkb: string;
  bodyAr: string;
  bodyEn: string;
  bodyCkb: string;
  tipAr?: string;
  tipEn?: string;
  tipCkb?: string;
}

export function resolveStepForDevice(
  step: SpotlightStepDef,
  isMobile: boolean
): ResolvedStepContent {
  const selectors = isMobile
    ? step.mobileSelectors && step.mobileSelectors.length > 0
      ? step.mobileSelectors
      : step.selectors
    : step.desktopSelectors && step.desktopSelectors.length > 0
      ? step.desktopSelectors
      : step.selectors;

  return {
    selectors,
    titleAr: isMobile && step.mobileTitleAr ? step.mobileTitleAr : step.titleAr,
    titleEn: isMobile && step.mobileTitleEn ? step.mobileTitleEn : step.titleEn,
    titleCkb: isMobile && step.mobileTitleCkb ? step.mobileTitleCkb : step.titleCkb,
    bodyAr: isMobile && step.mobileBodyAr ? step.mobileBodyAr : step.bodyAr,
    bodyEn: isMobile && step.mobileBodyEn ? step.mobileBodyEn : step.bodyEn,
    bodyCkb: isMobile && step.mobileBodyCkb ? step.mobileBodyCkb : step.bodyCkb,
    tipAr: isMobile && step.mobileTipAr ? step.mobileTipAr : step.tipAr,
    tipEn: isMobile && step.mobileTipEn ? step.mobileTipEn : step.tipEn,
    tipCkb: isMobile && step.mobileTipCkb ? step.mobileTipCkb : step.tipCkb,
  };
}

export interface PageTourDef {
  id: PageTourId;
  pageLabelAr: string;
  pageLabelEn: string;
  pageLabelCkb: string;
  summaryAr: string;
  summaryEn: string;
  summaryCkb: string;
  /** True if this page requires a patient file or module to be open before launching directly. */
  contextualOnly?: boolean;
  steps: SpotlightStepDef[];
}

export interface FullAppWalkthroughStage {
  pageId: PageTourId;
  /** Target navigation tab, patient chart, or 'settings_modal' to switch to automatically. */
  targetAction: 'nav' | 'patient_chart' | 'settings_modal';
  navTab?: 'today' | 'reception' | 'schedule' | 'directory' | 'finance';
  stageTitleAr: string;
  stageTitleEn: string;
  stageTitleCkb: string;
}

export interface PageToursState {
  welcomeSeen: boolean;
  fullTourCompleted: boolean;
  autoEnabled: boolean;
  seenPages: PageTourId[];
  updatedAt: string;
}

export interface PlatformPillar {
  id: string;
  titleAr: string;
  titleEn: string;
  titleCkb: string;
  bodyAr: string;
  bodyEn: string;
  bodyCkb: string;
}

export interface QuickGuideTopic {
  id: string;
  device: DeviceGuideMode;
  category: 'interface' | 'workflow' | 'clinical' | 'finance' | 'security' | 'modules' | 'shortcuts';
  titleAr: string;
  titleEn: string;
  titleCkb: string;
  summaryAr: string;
  summaryEn: string;
  summaryCkb: string;
  stepsAr: string[];
  stepsEn: string[];
  stepsCkb: string[];
  keywords: string;
  tourId?: PageTourId;
}

export interface DesktopShortcutItem {
  keys: string;
  labelAr: string;
  labelEn: string;
  labelCkb: string;
  detailAr: string;
  detailEn: string;
  detailCkb: string;
}

// skipcq: SCT-A000 - localStorage key identifier, not a secret
export const PAGE_TOURS_STORAGE_KEY = 'physiorecord_page_tours_v1';

const VALID_PAGE_TOUR_IDS: ReadonlySet<PageTourId> = new Set([
  'today',
  'reception',
  'schedule',
  'directory',
  'finance',
  'patient_chart',
  'session_soap',
  'settings',
  'backup_restore',
  'exercises',
  'analytics',
  'activity_log',
]);

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // ignore private browsing restrictions
  }
  return null;
}

export function createDefaultPageToursState(nowMs = Date.now()): PageToursState {
  return {
    welcomeSeen: false,
    fullTourCompleted: false,
    autoEnabled: true,
    seenPages: [],
    updatedAt: new Date(nowMs).toISOString(),
  };
}

export function loadPageToursState(nowMs = Date.now()): PageToursState {
  const storage = getStorage();
  if (!storage) return createDefaultPageToursState(nowMs);
  try {
    const raw = storage.getItem(PAGE_TOURS_STORAGE_KEY);
    if (!raw) return createDefaultPageToursState(nowMs);
    const parsed = JSON.parse(raw) as Partial<PageToursState>;
    const seen = Array.isArray(parsed.seenPages)
      ? Array.from(
          new Set(
            parsed.seenPages.filter(
              (id): id is PageTourId =>
                typeof id === 'string' && VALID_PAGE_TOUR_IDS.has(id as PageTourId)
            )
          )
        )
      : [];
    return {
      welcomeSeen: typeof parsed.welcomeSeen === 'boolean' ? parsed.welcomeSeen : false,
      fullTourCompleted:
        typeof parsed.fullTourCompleted === 'boolean' ? parsed.fullTourCompleted : false,
      autoEnabled: typeof parsed.autoEnabled === 'boolean' ? parsed.autoEnabled : true,
      seenPages: seen,
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(nowMs).toISOString(),
    };
  } catch {
    return createDefaultPageToursState(nowMs);
  }
}

export function savePageToursState(state: PageToursState): PageToursState {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(PAGE_TOURS_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('physiorecord-page-tours-updated'));
  }
  return state;
}

export function shouldShowWelcomeOnboarding(state = loadPageToursState()): boolean {
  return !state.welcomeSeen;
}

export function markWelcomeSeen(nowMs = Date.now()): PageToursState {
  const current = loadPageToursState(nowMs);
  if (current.welcomeSeen) return current;
  return savePageToursState({
    ...current,
    welcomeSeen: true,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export function markFullTourCompleted(
  completedPageIds: PageTourId[] = [],
  nowMs = Date.now()
): PageToursState {
  const current = loadPageToursState(nowMs);
  const mergedSeen = Array.from(new Set([...current.seenPages, ...completedPageIds]));
  return savePageToursState({
    ...current,
    welcomeSeen: true,
    fullTourCompleted: true,
    seenPages: mergedSeen,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export function isPageTourSeen(pageId: PageTourId, state = loadPageToursState()): boolean {
  return state.seenPages.includes(pageId);
}

export function shouldAutoTriggerPageTour(
  pageId: PageTourId,
  state = loadPageToursState()
): boolean {
  if (!state.autoEnabled) return false;
  return !state.seenPages.includes(pageId);
}

export function markPageTourSeen(pageId: PageTourId, nowMs = Date.now()): PageToursState {
  const current = loadPageToursState(nowMs);
  if (current.seenPages.includes(pageId)) return current;
  return savePageToursState({
    ...current,
    seenPages: [...current.seenPages, pageId],
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export function setAutoPageToursEnabled(enabled: boolean, nowMs = Date.now()): PageToursState {
  const current = loadPageToursState(nowMs);
  return savePageToursState({
    ...current,
    autoEnabled: enabled,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export function resetAllPageTours(nowMs = Date.now()): PageToursState {
  return savePageToursState(createDefaultPageToursState(nowMs));
}

export function getFullAppWalkthroughStages(
  isSoloMode: boolean,
  includePatientChart = false
): FullAppWalkthroughStage[] {
  const stages: FullAppWalkthroughStage[] = [
    isSoloMode
      ? {
          pageId: 'today',
          targetAction: 'nav',
          navTab: 'today',
          stageTitleAr: 'شاشة اليوم والتنقل الرئيسي',
          stageTitleEn: 'Today Desk & Navigation',
          stageTitleCkb: 'پەڕەی ئەمڕۆ و گەڕانی سەرەکی',
        }
      : {
          pageId: 'reception',
          targetAction: 'nav',
          navTab: 'reception',
          stageTitleAr: 'الاستقبال والطابور والتنقل',
          stageTitleEn: 'Reception Queue & Navigation',
          stageTitleCkb: 'پێشوازی و گەڕانی سەرەکی',
        },
    {
      pageId: 'schedule',
      targetAction: 'nav',
      navTab: 'schedule',
      stageTitleAr: 'جدول المواعيد والحجز المتكرر',
      stageTitleEn: 'Schedule & Recurring Visits',
      stageTitleCkb: 'خشتەی نۆرە و کۆرسە هەفتانەکان',
    },
    {
      pageId: 'directory',
      targetAction: 'nav',
      navTab: 'directory',
      stageTitleAr: 'قائمة المرضى والبحث والتصفية',
      stageTitleEn: 'Patient Directory & Filters',
      stageTitleCkb: 'تۆماری نەخۆش و پاڵاوتن',
    },
  ];

  if (includePatientChart) {
    stages.push({
      pageId: 'patient_chart',
      targetAction: 'patient_chart',
      stageTitleAr: 'سجل المريض السريري (التبويبات الأربعة)',
      stageTitleEn: 'Patient Clinical Record (4 Tabs)',
      stageTitleCkb: 'دۆسیەی کلینیکیی نەخۆش (٤ بەش)',
    });
  }

  stages.push(
    {
      pageId: 'finance',
      targetAction: 'nav',
      navTab: 'finance',
      stageTitleAr: 'الحسابات والفواتير العراقية',
      stageTitleEn: 'Finance & Iraqi Billing',
      stageTitleCkb: 'ژمێریاری و پسوولەکان',
    },
    {
      pageId: 'settings',
      targetAction: 'settings_modal',
      stageTitleAr: 'الإعدادات، الأمان والوحدات الإضافية',
      stageTitleEn: 'Settings, Security & Modules',
      stageTitleCkb: 'ڕێکخستن، ئاسایش و بەشە زیادەکان',
    }
  );

  return stages;
}

export const PLATFORM_OVERVIEW_PILLARS: PlatformPillar[] = [
  {
    id: 'pillar_clinical',
    titleAr: 'سجل سريري متخصص بالعلاج الطبيعي',
    titleEn: 'Dedicated Physiotherapy Clinical Workspace',
    titleCkb: 'تۆماری کلینیکیی تایبەت بە چارەسەری سروشتی',
    bodyAr:
      'يجمع ملف المريض، حلقات الرعاية، جلسات SOAP المقفلة للأمانة السريرية مع الملاحق، خريطة الألم التفاعلية، فحص القوة العضلية MMT والمدى الحركي ROM، الاختبارات الخاصة لـ 9 مفاصل، والمقاييس الوظيفية.',
    bodyEn:
      'Unifies patient charts, care episodes, immutable SOAP sessions with append-only addenda, interactive pain map, free-text MMT, ROM, 9-region special tests, and outcome calculators.',
    bodyCkb:
      'دۆسیەی نەخۆش، قۆناغەکانی چارەسەر، تۆماری SOAP لەگەڵ پاشکۆکان، نەخشەی ئازار، MMT و ROM و تاقیکردنەوە تایبەتەکان و پێوەرەکان لە یەک شوێندا کۆدەکاتەوە.',
  },
  {
    id: 'pillar_operations',
    titleAr: 'إدارة يومية ومالية مصمّمة لعيادات العراق',
    titleEn: 'Daily Clinic Ops & Iraqi Financial Ledger',
    titleCkb: 'بەڕێوەبردنی ڕۆژانە و ژمێریاری کلینیک',
    bodyAr:
      'استقبال مراجع سريع خلال 10 ثوانٍ، حجز جلسات مفردة أو كورسات أسبوعية متكررة بمدة يدوية، وفواتير بدون أسعار مفروضة تدعم الدينار العراقي (أو أي عملة) مع نقداً وZainCash وQiCard والمصاريف.',
    bodyEn:
      '10-second walk-in registration, single or weekly recurring schedules with manual duration, and blank-default invoicing for sessions, courses, and exams with Cash, ZainCash, QiCard, and expenses.',
    bodyCkb:
      'تۆمارکردنی خێرای نەخۆش لە ١٠ چرکەدا، نۆرەی تاک و هەفتانەی دووبارەبووەوە، و پسوولە بە نەقد و ZainCash و QiCard و خەرجییەکان.',
  },
  {
    id: 'pillar_privacy',
    titleAr: 'تشفير محلي 100% بدون إنترنت ولا اشتراك',
    titleEn: '100% Offline Local Encryption — Zero Cloud',
    titleCkb: 'کۆدکردنی ناوخۆیی ١٠٠٪ بێ ئینتەرنێت',
    bodyAr:
      'كل بيانات مرضاك مشفّرة ومحفوظة على جهازك فقط ولا تُرسل لأي خادم خارجي. ومع 4 طبقات أمان (البصمة/Passkey، مفتاح الطوارئ، التذكير الذكي، ومدير كلمات المرور) تبقى بياناتك محمية وآمنة من النسيان.',
    bodyEn:
      'All clinical records stay AES-GCM encrypted strictly on your device with zero external servers, backed by 4 anti-lockout layers: Biometrics/Passkey, Recovery Key, spaced reminders, and OS Password Manager.',
    bodyCkb:
      'هەموو زانیارییەکان تەنها لەسەر ئامێرەکەت بە کۆدکراوی هەڵدەگیرێن بێ هیچ سێرڤەرێکی دەرەکی و بە ٤ چینی پاراستنی وشەی نهێنی.',
  },
];

export const PAGE_SPOTLIGHT_TOURS: Record<PageTourId, PageTourDef> = {
  today: {
    id: 'today',
    pageLabelAr: 'شاشة اليوم',
    pageLabelEn: 'Today Desk',
    pageLabelCkb: 'پەڕەی ئەمڕۆ',
    summaryAr: 'مركز العمل اليومي: استقبال المراجعين، متابعة الطابور، وإغلاق صندوق نهاية اليوم.',
    summaryEn: 'Daily command desk for walk-ins, live queue, and end-of-day cash closing.',
    summaryCkb: 'ناوەندی کاری ڕۆژانە بۆ پێشوازی، نۆرە و داخستنی سندووقی کۆتایی ڕۆژ.',
    steps: [
      {
        id: 'today_nav_shell',
        selectors: ['[data-testid="desktop-rail"]', '[data-testid="mobile-dock-trigger"]'],
        desktopSelectors: ['[data-testid="desktop-rail"]'],
        mobileSelectors: ['[data-testid="mobile-dock-trigger"]'],
        titleAr: 'الشريط الجانبي الذكي',
        titleEn: 'Collapsible Side Rail',
        titleCkb: 'شریتی تەنیشت',
        bodyAr:
          'تتنقّل بين أقسام العيادة الأساسية (اليوم، المواعيد، المرضى، الحسابات) من هذا الشريط الجانبي. يمكنك طيّه لأيقونات فقط لتوسيع مساحة الشاشة، والوصول منه للبحث الشامل والإضافة السريعة.',
        bodyEn:
          'Switch between Today, Schedule, Patients, and Finance from this side rail. You can collapse it into a compact icon rail anytime to maximize clinical chart width.',
        bodyCkb:
          'لەم شریتەی تەنیشتەوە لە نێوان ئەمڕۆ، نۆرەکان، نەخۆشەکان و ژمێریاری بگەڕێ و دەتوانیت کۆیبکەیتەوە بۆ فراوانکردنی شاشە.',
        tipAr: 'اضغط Ctrl + K في أي وقت لفتح البحث الشامل والأوامر السريعة دون لمس الفأرة.',
        tipEn: 'Press Ctrl + K anytime to search patients or trigger any action from your keyboard.',
        tipCkb: 'لە هەر کاتێکدا Ctrl + K دابگرە بۆ گەڕانی خێرا بە کیبۆرد.',
        mobileTitleAr: 'مقبض التنقل العائم بيد واحدة',
        mobileTitleEn: 'One-Handed Floating Dock',
        mobileTitleCkb: 'شریتی گەڕانی خێرا',
        mobileBodyAr:
          'يختفي شريط التنقل تلقائياً خلف هذا المقبض الهادئ أسفل الشاشة لإعطائك أكبر مساحة للقراءة والتوثيق. عند لمسه يظهر شريط عائم أنيق يضم الأقسام الأربعة + البحث السريع + زر (+) للإضافة، ثم يختفي وحده بعد ثوانٍ.',
        mobileBodyEn:
          'Navigation tucks behind this quiet bottom handle to keep your screen spacious. Tap it to reveal the one-handed floating pill with all 4 sections, Search, and (+) Quick Add—it auto-hides after a few seconds.',
        mobileBodyCkb:
          'شریتی گەڕان لە پشت ئەم دەسکەی خوارەوە دەشاردرێتەوە بۆ فراوانیی شاشە. دەستی لێبدە بۆ پیشاندانی بەشەکان و گەڕان و (+).',
        mobileTipAr: 'اضغط خارج الشريط العائم في أي مكان لإخفائه فوراً والعودة للمحتوى.',
        mobileTipEn: 'Tap anywhere outside the floating pill to dismiss it immediately.',
        mobileTipCkb: 'لە دەرەوەی شریتەکە کرتە بکە بۆ شاردنەوەی دەستبەجێ.',
        preferredSide: 'end',
      },
      {
        id: 'today_walkin',
        selectors: ['[data-testid="today-walkin-btn"]'],
        titleAr: 'تسجيل مراجع سريع خلال 10 ثوانٍ',
        titleEn: '10-Second Walk-In Registration',
        titleCkb: 'تۆمارکردنی خێرای نەخۆش لە ١٠ چرکەدا',
        bodyAr:
          'عند دخول مريض جديد بدون حجز مسبق، اضغط هنا وأدخل الاسم ورقم الهاتف فقط. سيقوم النظام تلقائياً بإنشاء ملف سريري كامل، وفتح حلقة علاج، وتجهيز جلسة SOAP لتبدأ الفحص فوراً دون تأخير.',
        bodyEn:
          'When a walk-in arrives without a prior appointment, tap here and enter just Name & Phone. PhysioRecord automatically creates their chart, opens a care episode, and prepares a ready SOAP session.',
        bodyCkb:
          'کاتێک نەخۆشێکی نوێ بێ نۆرە دێت، لێرە ناو و ژمارەکەی بنووسە؛ دۆسیە و قۆناغی چارەسەر و دانیشتنەکەی خۆکارانە ئامادە دەبێت.',
        tipAr: 'يمكنك استكمال بقية التفاصيل الطبية والتشخيص لاحقاً من داخل ملف المريض.',
        tipEn: 'You can always fill in detailed medical history later inside the patient chart.',
        tipCkb: 'دەتوانیت دواتر زانیارییە پزیشکییەکانی تر لەناو دۆسیەکەدا تەواو بکەیت.',
        preferredSide: 'bottom',
      },
      {
        id: 'today_eod',
        selectors: ['[data-testid="today-subtab-eod"]'],
        titleAr: 'صندوق اليوم وإغلاق نهاية الدوام',
        titleEn: 'Daily Cashbox & End-of-Day Closing',
        titleCkb: 'سندووقی ئەمڕۆ و داخستنی کۆتایی ڕۆژ',
        bodyAr:
          'تابع إجمالي مقبوضات اليوم لحظة بلحظة، وعند نهاية الدوام افتح تبويب «إغلاق اليوم» لمطابقة المبالغ حسب طريقة الدفع (نقداً، ZainCash، QiCard)، ومراجعة المصاريف وأخذ نسخة احتياطية مشفّرة.',
        bodyEn:
          'Monitor today’s net collections in real time. At shift end, switch to "Close Day" to reconcile Cash, ZainCash, and QiCard totals, review expenses, and export an encrypted backup.',
        bodyCkb:
          'چاودێری داهاتی ئەمڕۆ بکە و لە کۆتایی کاردا «کۆتایی ڕۆژ» بکەرەوە بۆ جیاکردنەوەی نەقد و ZainCash و QiCard و پاشەکەوت.',
        tipAr: 'أخذ نسخة احتياطية أسبوعية (أو يومية) يضمن عدم ضياع أي بيانات حتى لو تلف الجهاز.',
        tipEn: 'Exporting a routine encrypted backup protects your clinic even if a device is lost.',
        tipCkb: 'وەرگرتنی پاشەکەوتی کۆدکراو بە بەردەوامی زانیارییەکانت لە تێکچوونی ئامێر دەپارێزێت.',
        preferredSide: 'bottom',
      },
      {
        id: 'today_account',
        selectors: ['[data-testid="rail-account-btn"]', '[data-testid="mobile-account-btn"]'],
        desktopSelectors: ['[data-testid="rail-account-btn"]'],
        mobileSelectors: ['[data-testid="mobile-account-btn"]'],
        titleAr: 'قائمة العيادة، الإعدادات والأمان (أسفل الشريط)',
        titleEn: 'Clinic Menu, Settings & Security (Rail Footer)',
        titleCkb: 'مێنووی کلینیک، ڕێکخستن و ئاسایش',
        bodyAr:
          'تضم هذه القائمة كل أدوات التحكم بدون إزعاج: حالة آخر نسخة احتياطية، التبديل بين وضع «معالج منفرد» و«عيادة بفريق»، ستار الخصوصية الفوري، المظهر الليلي واللغة، الإعدادات، إعادة تشغيل الدليل، وقفل الخزينة.',
        bodyEn:
          'Everything you need in one tidy menu: backup status, Solo vs Clinic mode switch, instant Privacy Cover, dark/light theme & language, Settings, Tour & Guide, and Vault Lock.',
        bodyCkb:
          'ئەم مێنووە هەموو کۆنترۆڵەکان لەخۆدەگرێت: دۆخی پاشەکەوت، گۆڕینی دۆخی تاک/کلینیک، داپۆشەری نهێنی، زمان، ڕێکخستن، ڕێبەر و قوفڵ.',
        tipAr: 'من هذه القائمة يمكنك دائماً إعادة تشغيل الدليل الكامل أو جولة أي صفحة.',
        tipEn: 'Reopen the Full Guide or replay any page tour from this menu anytime.',
        tipCkb: 'لێرەوە هەر کاتێک بتەوێت دەتوانیت ڕێبەر یان گەشتی پەڕەکان دووبارە بکەیتەوە.',
        mobileTitleAr: 'قائمة العيادة والإعدادات (أعلى الشاشة)',
        mobileTitleEn: 'Clinic & Settings Menu (Top Corner)',
        mobileTitleCkb: 'مێنووی کلینیک و ڕێکخستن (سەرەوەی شاشە)',
        mobileBodyAr:
          'تجد كل أدوات العيادة في هذه الأيقونة العلوية: النسخ الاحتياطي، التبديل بين وضع الفردي والعيادة، الأقسام الإضافية (مثل التمارين والتحليلات عند تفعيلها)، ستار الخصوصية، الإعدادات، الدليل الشامل، وقفل الخزينة.',
        mobileBodyEn:
          'Tap this top-corner menu for Backups, Solo/Clinic mode, optional modules (Exercises/Analytics/Kiosk), Privacy Cover, Settings, Full Guide, and Vault Lock.',
        mobileBodyCkb:
          'لەم ئایکۆنەی سەرەوەوە پاشەکەوت، دۆخی تاک/کلینیک، بەشە زیادەکان، ڕێکخستن، ڕێبەر و قوفڵکردن دەکەیتەوە.',
        mobileTipAr: 'النقطة البرتقالية على الأيقونة تنبّهك بلطف عند وجود بيانات DEMO أو تأخر النسخ الاحتياطي.',
        mobileTipEn: 'An amber indicator gently reminds you when backup is overdue or DEMO data is active.',
        mobileTipCkb: 'خاڵە پرتەقاڵییەکە ئاگادارت دەکاتەوە کاتێک پاشەکەوت دواکەوتووە یان داتای DEMO هەیە.',
        preferredSide: 'end',
      },
      {
        id: 'today_more_tools',
        selectors: ['[data-testid="today-more-menu-btn"]'],
        titleAr: 'أدوات اليوم الإضافية: الاحتفاظ بالمرضى وصحة البيانات',
        titleEn: 'More Daily Tools: Retention Lists & Data Health',
        titleCkb: 'ئامرازە زیادەکانی ئەمڕۆ: بەدواداچوون و تەندروستیی داتا',
        bodyAr:
          'من هذه القائمة تصل إلى أدوات المتابعة الاحترافية: «الإحالات والاحتفاظ بالمرضى» (لمتابعة المتغيبين وتقييم ما بعد التخريج 4/12 أسبوع) و«صحة البيانات وسلة المهملات» لفحص سلامة السجلات واسترجاع المحذوفات.',
        bodyEn:
          'Open Referrals & Patient Retention (missed-visit follow-ups and 4w/12w post-discharge check-ins), Data Health & Trash recovery, and quick schedule views right from this menu.',
        bodyCkb:
          'لەم مێنووەوە بگە بە لیستی بەدواداچوونی نەخۆشەکان، تەندروستیی داتا و سەلەی سڕاوەکان.',
        preferredSide: 'bottom',
      },
    ],
  },

  reception: {
    id: 'reception',
    pageLabelAr: 'شاشة الاستقبال والطابور',
    pageLabelEn: 'Reception Queue',
    pageLabelCkb: 'پەڕەی پێشوازی و نۆرە',
    summaryAr: 'إدارة استقبال العيادة، توزيع المراجعين على المعالجين، وحماية خصوصية الشاشة.',
    summaryEn: 'Manage front-desk arrivals, assign visits to therapists, and protect screen privacy.',
    summaryCkb: 'بەڕێوەبردنی هاتنی نەخۆشان، دابەشکردن بەسەر چارەسەرکاران و پاراستنی نهێنی.',
    steps: [
      {
        id: 'reception_nav_shell',
        selectors: ['[data-testid="desktop-rail"]', '[data-testid="mobile-dock-trigger"]'],
        desktopSelectors: ['[data-testid="desktop-rail"]'],
        mobileSelectors: ['[data-testid="mobile-dock-trigger"]'],
        titleAr: 'التنقل السريع في وضع العيادة',
        titleEn: 'Clinic Navigation Rail',
        titleCkb: 'شریتی گەڕانی کلینیک',
        bodyAr:
          'في وضع العيادة تمنحك القائمة الجانبية وصولاً فورياً للاستقبال، جدول المواعيد، سجل المرضى، والحسابات، مع بحث فوري (Ctrl+K) وإضافة سريعة (+) لكل كادر العيادة.',
        bodyEn:
          'In Clinic mode, this collapsible side rail gives reception and therapists instant access to Reception, Schedule, Patients, Finance, Search (Ctrl+K), and (+) Quick Add.',
        bodyCkb:
          'لە دۆخی کلینیکدا ئەم شریتە دەستگەیشتنی خێرا دەدات بە پێشوازی، خشتە، نەخۆشەکان، ژمێریاری و گەڕان (Ctrl+K).',
        mobileTitleAr: 'التنقل السريع بيد واحدة',
        mobileTitleEn: 'One-Handed Floating Dock',
        mobileTitleCkb: 'شریتی گەڕانی خێرا',
        mobileBodyAr:
          'المس المقبض السفلي لإظهار شريط الأقسام والبحث وزر (+)، وسيختفي تلقائياً ليبقي شاشة الاستقبال واضحة ومريحة.',
        mobileBodyEn:
          'Tap the bottom handle to reveal Reception, Schedule, Patients, Finance, Search, and (+) Quick Add—then it tucks away automatically.',
        mobileBodyCkb:
          'دەست لە دەسکەی خوارەوە بدە بۆ پیشاندانی بەشەکان و گەڕان و (+).',
        preferredSide: 'end',
      },
      {
        id: 'reception_privacy',
        selectors: ['[data-tour="reception-privacy-btn"]'],
        titleAr: 'تمويه الخصوصية الفوري أمام المراجعين',
        titleEn: 'Instant Front-Desk Privacy Blur',
        titleCkb: 'لێڵکردنی خێرای نهێنی لە پێشوازی',
        bodyAr:
          'عند وقوف مراجعين قرب مكتب الاستقبال، اضغط هنا لإخفاء أسماء المرضى والمبالغ المالية فوراً عن الأنظار، مع بقاء العمل جاهزاً للعودة بنقرة واحدة.',
        bodyEn:
          'When visitors stand near the reception desk, tap here to instantly blur patient names and financial balances while keeping your workflow ready.',
        bodyCkb:
          'کاتێک سەردانیکەر لە نزیک شاشەی پێشوازییە، لێرە کرتە بکە بۆ شاردنەوەی ناوی نەخۆش و بڕە پارەکان.',
        tipAr: 'يمكنك أيضاً الضغط على مفتاح Esc مرتين لإظهار ستار الخصوصية الكامل فوراً.',
        tipEn: 'You can also press Esc twice to toggle the full Privacy Cover screen instantly.',
        tipCkb: 'هەروەها دەتوانیت دوو جار Esc دابگریت بۆ داپۆشینی تەواوی شاشە.',
        mobileTipAr: 'يمكنك تفعيل ستار الخصوصية الكامل من قائمة الحساب العلوية في أي لحظة.',
        mobileTipEn: 'You can also toggle the full Privacy Cover from the top account menu anytime.',
        mobileTipCkb: 'لە مێنووی سەرەوەش دەتوانیت داپۆشەری نهێنی چالاک بکەیت.',
        preferredSide: 'bottom',
      },
      {
        id: 'reception_book',
        selectors: ['[data-tour="reception-book-btn"]'],
        titleAr: 'حجز المواعيد وتوزيع الكادر',
        titleEn: 'Quick Booking & Therapist Assignment',
        titleCkb: 'نۆرەگرتنی خێرا و دابەشکردن بەسەر ستاف',
        bodyAr:
          'انتقل مباشرة لتسجيل موعد مفرد أو كورس جلسات أسبوعية متكررة وتخصيصه للمعالج المناسب داخل العيادة.',
        bodyEn:
          'Jump directly to book a single appointment or recurring weekly therapy course and assign it to the right clinician.',
        bodyCkb:
          'ڕاستەوخۆ نۆرەی تاک یان کۆرسی هەفتانە تۆمار بکە و بۆ چارەسەرکاری گونجاو دیاری بکە.',
        preferredSide: 'bottom',
      },
      {
        id: 'reception_account',
        selectors: ['[data-testid="rail-account-btn"]', '[data-testid="mobile-account-btn"]'],
        desktopSelectors: ['[data-testid="rail-account-btn"]'],
        mobileSelectors: ['[data-testid="mobile-account-btn"]'],
        titleAr: 'تبديل صفة الموظف وسجل النشاط',
        titleEn: 'Switch Staff Role & Audit Trail',
        titleCkb: 'گۆڕینی ڕۆڵی ستاف و تۆماری چالاکی',
        bodyAr:
          'بدّل بين صفة المدير والاستقبال والأخصائيين لنسبة التوثيق، وافتح «سجل النشاط» أو «الإعدادات» من هذه القائمة.',
        bodyEn:
          'Switch between Admin, Reception, and Therapists for record attribution, or open Audit Log and Settings from this menu.',
        bodyCkb:
          'لەم مێنووەوە ڕۆڵی بەڕێوەبەر و پێشوازی و چارەسەرکار بگۆڕە یان تۆماری چالاکی بکەرەوە.',
        preferredSide: 'end',
      },
    ],
  },

  schedule: {
    id: 'schedule',
    pageLabelAr: 'جدول المواعيد',
    pageLabelEn: 'Appointment Schedule',
    pageLabelCkb: 'خشتەی نۆرەکان',
    summaryAr: 'حجز الجلسات المفردة والكورسات الأسبوعية المتكررة بمدة يدوية وضبط العطل والاستراحات.',
    summaryEn: 'Single and weekly recurring weekday bookings with manual duration, breaks, and schedule printing.',
    summaryCkb: 'نۆرەگرتنی تاک و کۆرسی هەفتانە بە ماوەی دەستی، پشووەکان و چاپکردن.',
    steps: [
      {
        id: 'schedule_book',
        selectors: ['[data-tour="schedule-book-btn"]'],
        titleAr: 'حجز موعد مفرد أو كورس متكرر أسبوعياً',
        titleEn: 'Single Visit or Weekly Recurring Course',
        titleCkb: 'نۆرەی تاک یان کۆرسی هەفتانەی دووبارەبووەوە',
        bodyAr:
          'احجز جلسة واحدة أو جدول كورساً كاملاً بأيام أسبوعية محددة (مثل: أحد / ثلاثاء / خميس)، مع اختيار الوقت بساعة تفاعلية وإدخال مدة الجلسة يدوياً حسب نوع الحالة.',
        bodyEn:
          'Book a one-off visit or a full weekly recurring weekday series (e.g. Sun/Tue/Thu) using the interactive time picker and manual session duration entry.',
        bodyCkb:
          'دانیشتنێکی تاک یان کۆرسێکی هەفتانە (وەک یەکشەممە/سێشەممە/پێنجشەممە) تۆمار بکە بە کات و ماوەی دەستی.',
        tipAr: 'بعد الحجز يمكنك إرسال تذكير واتساب للمريض بضغطة واحدة على رقمه العراقي.',
        tipEn: 'After booking, send a ready bilingual WhatsApp appointment reminder in one tap.',
        tipCkb: 'دوای نۆرەگرتن دەتوانیت بە یەک کرتە بیرخەرەوەی واتساپ بۆ نەخۆش بنێریت.',
        preferredSide: 'bottom',
      },
      {
        id: 'schedule_options',
        selectors: ['[data-tour="schedule-options-btn"]'],
        titleAr: 'القفز لتاريخ، العطل والاستراحات، والطباعة',
        titleEn: 'Date Jump, Closed Days, Locations & Print',
        titleCkb: 'چوون بۆ بەروار، پشووەکان و چاپکردن',
        bodyAr:
          'من هذه القائمة تقفز لأي تاريخ في التقويم، وتضبط أيام الإجازات وأوقات الاستراحة وفروع/مواقع العمل، كما يمكنك تصدير المواعيد للتقويم (.ics) أو طباعة جدول اليوم.',
        bodyEn:
          'Jump to any date, define weekly breaks, closed dates, and practice locations, export privacy-filtered .ics calendar files, or print the daily schedule.',
        bodyCkb:
          'لەم مێنووەوە بچۆ هەر بەروارێک، ڕۆژانی پشوو و پشووی ناو ڕۆژ و شوێنەکان ڕێکبخە، یان خشتەی ڕۆژ چاپ بکە.',
        preferredSide: 'bottom',
      },
      {
        id: 'schedule_week',
        selectors: ['[data-tour="schedule-week-strip"]'],
        titleAr: 'شريط الأسبوع التفاعلي',
        titleEn: 'Interactive Week Strip',
        titleCkb: 'شریتی هەفتانەی کارلێککەر',
        bodyAr:
          'تنقّل سريعاً بين أيام الأسبوع بنقرة واحدة مع رؤية عدد المواعيد المجدولة لكل يوم بوضوح، لتعرف الأيام المزدحمة والفارغة فوراً.',
        bodyEn:
          'Switch smoothly across weekdays in one tap while seeing daily appointment load at a glance so you can spot open slots immediately.',
        bodyCkb:
          'بە یەک کرتە لە نێوان ڕۆژانی هەفتەدا بگەڕێ و قەرەباڵغیی هەر ڕۆژێک بە خێرایی ببینە.',
        preferredSide: 'bottom',
      },
    ],
  },

  directory: {
    id: 'directory',
    pageLabelAr: 'سجل المرضى',
    pageLabelEn: 'Patient Directory',
    pageLabelCkb: 'تۆماری نەخۆشەکان',
    summaryAr: 'إضافة المرضى مع كشف التكرار التلقائي، عدسات التصفية الذكية، والدخول لملف كل مريض.',
    summaryEn: 'Add patients with duplicate detection, smart filter lenses, DEMO controls, and clinical charts.',
    summaryCkb: 'زیادکردنی نەخۆش بە دۆزینەوەی دووبارەکان، فلتەری زیرەک و کردنەوەی دۆسیەکان.',
    steps: [
      {
        id: 'directory_add',
        selectors: ['[data-tour="directory-new-patient-btn"]'],
        titleAr: 'إنشاء ملف مريض جديد بكشف تكرار ذكي',
        titleEn: 'Create Patient Chart with Duplicate Guard',
        titleCkb: 'دروستکردنی دۆسیەی نوێ بە پاراستن لە دووبارەبوونەوە',
        bodyAr:
          'سجّل بيانات المريض هنا؛ يقوم التطبيق تلقائياً بفحص الاسم ورقم الهاتف العراقي (+964) وينبّهك فوراً إذا كان للمريض ملف سابق لتجنّب تكرار السجلات.',
        bodyEn:
          'Register a new patient here—PhysioRecord automatically checks names and normalized Iraqi phone numbers (+964) to prevent duplicate charts.',
        bodyCkb:
          'زانیاریی نەخۆشی نوێ لێرە تۆمار بکە؛ ئەپەکە خۆکارانە ناو و ژمارەی مۆبایل دەپشکنێت بۆ ڕێگری لە دووبارەبوونەوە.',
        tipAr: 'عند فتح أي مريض من القائمة ستجد ملفه مقسّماً إلى 4 تبويبات واضحة: المتابعة والجلسات، الخطة والفحوصات، السجل المرضي، والمالية والمرفقات.',
        tipEn: 'Click any patient row to open their 4-tab clinical chart (Follow-up, Plan & Assessments, History, Finance & Docs).',
        tipCkb: 'کرتە لە هەر نەخۆشێک بکە بۆ کردنەوەی دۆسیە چوار-بەشییەکەی.',
        preferredSide: 'bottom',
      },
      {
        id: 'directory_lenses',
        selectors: ['[data-testid="directory-lens-all"]'],
        titleAr: 'عدسات التصفية الفورية للمرضى',
        titleEn: 'Instant Smart Filter Lenses',
        titleCkb: 'فلتەرە زیرەکەکانی نەخۆشەکان',
        bodyAr:
          'بنقرة واحدة اعرض فقط المرضى أصحاب الذمم المالية المتبقية، أو حالات علامات الخطر السريرية (Red Flags)، أو المرضى المثبّتين في المفضلة، أو الأرشيف.',
        bodyEn:
          'Filter your entire caseload in one click: patients with unpaid balances, clinical red flags, pinned priority cases, or archived charts.',
        bodyCkb:
          'بە یەک کرتە تەنها نەخۆشە قەرزدارەکان، ئاڵای سوورەکان، چەسپێندراوەکان یان ئەرشیف ببینە.',
        preferredSide: 'bottom',
      },
      {
        id: 'directory_more',
        selectors: ['[data-testid="directory-more-menu-btn"]'],
        titleAr: 'خيارات الدليل، الدمج، وبيانات DEMO',
        titleEn: 'Merge Duplicates, Import & DEMO Data',
        titleCkb: 'یەکخستن، هاوردەکردن و داتای DEMO',
        bodyAr:
          'من هذه القائمة يمكنك التصفية حسب الجنس، دمج ملفين مكررين لنفس المريض بأمان مع الحفاظ على الجلسات، أو تحميل وحذف مرضى DEMO التجريبيين للتدريب.',
        bodyEn:
          'Filter by sex, safely merge duplicate charts while preserving clinical seals, or load/clear clearly badged DEMO practice patients.',
        bodyCkb:
          'پاڵاوتن بەپێی ڕەگەز، یەکخستنی دۆسیە دووبارەکان بە سەلامەتی، یان بارکردن و سڕینەوەی داتای تاقیکاری DEMO.',
        preferredSide: 'bottom',
      },
    ],
  },

  finance: {
    id: 'finance',
    pageLabelAr: 'الحسابات والمالية',
    pageLabelEn: 'Clinic Finance',
    pageLabelCkb: 'ژمێریاری و دارایی',
    summaryAr: 'إصدار الفواتير العراقية، تسجيل المصاريف، متابعة الأقساط والذمم، وتقارير الصندوق.',
    summaryEn: 'Iraqi invoicing (Session/Course/Exam), expenses, installments, debts, and Z-reports.',
    summaryCkb: 'پسوولەی عێراقی، خەرجییەکان، قیست و قەرزەکان و ڕاپۆرتی سندووق.',
    steps: [
      {
        id: 'finance_invoice',
        selectors: ['[data-tour="finance-new-invoice-btn"]'],
        titleAr: 'إصدار فاتورة (جلسة مفردة · كورس · فحص)',
        titleEn: 'Create Invoice (Session · Course · Exam)',
        titleCkb: 'دەرکردنی پسوولە (دانیشتن · کۆرس · پشکنین)',
        bodyAr:
          'تبدأ جميع الحقول المالية فارغة بدون أسعار مفروضة مسبقاً لتحدد تسعيرتك بحرية. يدعم طرق الدفع العراقية: نقداً، ZainCash، QiCard، أو أي وسيلة أخرى مخصصة مع طباعة وصل فوري.',
        bodyEn:
          'All billing fields start cleanly blank—no preset prices forced on you. Supports Session, Course, and Exam types with Cash, ZainCash, QiCard, or custom payment methods plus instant receipts.',
        bodyCkb:
          'هەموو خانەکان بە بەتاڵی دەستپێدەکەن بێ نرخی پێشوەختە و پشتگیری نەقد، ZainCash، QiCard و چاپکردنی پسوولە دەکەن.',
        tipAr: 'تظهر العملة بعد الرقم (مثال: 25,000 د.ع) ويمكنك تغيير العملة من الإعدادات ← العملة.',
        tipEn: 'Currency displays cleanly after the amount (e.g. 25,000 IQD) and is customizable in Settings -> Currency.',
        tipCkb: 'دراو لە دوای ژمارەکە دەردەکەوێت و لە ڕێکخستنەکان ← دراو دەگۆڕدرێت.',
        preferredSide: 'bottom',
      },
      {
        id: 'finance_expense',
        selectors: ['[data-tour="finance-new-expense-btn"]'],
        titleAr: 'تسجيل مصاريف العيادة اليومية والشهرية',
        titleEn: 'Record Clinic Expenses',
        titleCkb: 'تۆمارکردنی خەرجییەکانی کلینیک',
        bodyAr:
          'سجّل مصاريف الإيجار، الكهرباء والمولدة، المستلزمات العلاجية، أو صيانة الأجهزة؛ ليحسب النظام صافي ربح العيادة وتدفق الصندوق الحقيقي تلقائياً.',
        bodyEn:
          'Log rent, power/generator, supplies, or equipment maintenance so your real net profit and cashflow are always accurate.',
        bodyCkb:
          'کرێ، کارەبا/موەلیدە، پێداویستی و چاککردنەوە تۆمار بکە بۆ هەژمارکردنی قازانجی ڕاستەقینەی کلینیک.',
        preferredSide: 'bottom',
      },
      {
        id: 'finance_reports',
        selectors: ['[data-tour="finance-reports-btn"]'],
        titleAr: 'التقارير المالية وإغلاق الصندوق (Z-Report)',
        titleEn: 'Financial Reports & Z-Report Closing',
        titleCkb: 'ڕاپۆرتی دارایی و داخستنی سندووق',
        bodyAr:
          'استعرض تفصيل المقبوضات والمصاريف حسب كل طريقة دفع واطبع تقارير يومية أو شهرية منظمة، أو راجع خطط الأقساط وأعمار الديون (30/60/90 يوم).',
        bodyEn:
          'Review income and expense breakdowns per payment method, print daily/monthly Z-reports, and track installment plans & 30/60/90-day debt aging.',
        bodyCkb:
          'پوختەی داهات و خەرجی بەپێی شێوازی پارەدان ببینە و ڕاپۆرتی ڕۆژانە/مانگانە چاپ بکە.',
        preferredSide: 'bottom',
      },
      {
        id: 'finance_balance',
        selectors: ['[data-tour="finance-balance-strip"]'],
        titleAr: 'تصفية فورية للمقبوضات والذمم والمصاريف',
        titleEn: 'One-Tap Balance & Debt Filters',
        titleCkb: 'پاڵاوتنی خێرای داهات و قەرز و خەرجی',
        bodyAr:
          'اضغط مباشرة على بطاقة «المقبوضات» أو «الذمم» أو «المصاريف» هنا لتصفية السجل المالي أسفلها فوراً ومتابعة المتبقي على المرضى.',
        bodyEn:
          'Tap Collected, Debts, or Expenses right on this summary strip to immediately filter the ledger below.',
        bodyCkb:
          'ڕاستەوخۆ کرتە لە «وەرگیراو»، «قەرزەکان» یان «خەرجییەکان» بکە بۆ پاڵاوتنی لیستەکەی خوارەوە.',
        preferredSide: 'bottom',
      },
    ],
  },

  patient_chart: {
    id: 'patient_chart',
    pageLabelAr: 'سجل المريض السريري',
    pageLabelEn: 'Patient Clinical Record',
    pageLabelCkb: 'دۆسیەی کلینیکیی نەخۆش',
    summaryAr: 'شرح كامل لملف المريض: حلقات العلاج والتنبيهات، التبويبات الأربعة، الفحوصات، والجلسات.',
    summaryEn: 'Full walkthrough of the patient chart: care episodes, alerts, all 4 tabs, assessments, and sessions.',
    summaryCkb: 'شیکردنەوەی تەواوی دۆسیەی نەخۆش: قۆناغەکانی چارەسەر، چوار بەشەکە، پشکنین و دانیشتنەکان.',
    steps: [
      {
        id: 'chart_episode_strip',
        selectors: ['[data-tour="chart-episode-strip"]', '[data-testid="clinical-summary-collapsible"]'],
        titleAr: 'شريط حلقة العلاج والتنبيهات السريرية والمالية',
        titleEn: 'Care Episode Selector & Clinical Safety Strip',
        titleCkb: 'هەڵبژاردنی قۆناغی چارەسەر و ئاگادارکردنەوەکان',
        bodyAr:
          'من هنا تتنقّل بين «حلقات العلاج» المختلفة لنفس المريض (مثلاً إصابة ركبة سابقة مقابل ألم ظهر حالي) أو تبدأ حلقة جديدة، وترى فوراً تنبيهات علامات الخطر والمحاذير والذمة المالية المتبقية وجهة الإحالة.',
        bodyEn:
          'Switch between separate Care Episodes for the same patient (e.g. a past knee rehab vs current back pain) or start a new one, while seeing Red Flags, Precautions, unpaid balances, and referring doctors at a glance.',
        bodyCkb:
          'لێرەوە لە نێوان قۆناغە جیاوازەکانی چارەسەری نەخۆشەکەدا بگەڕێ و ئاڵا سوورەکان و قەرزی ماوە دەستبەجێ ببینە.',
        tipAr: 'كل حلقة علاج تعزل جلساتها وفحوصاتها وتقاريرها بالكامل ليبقى التقييم دقيقاً ومنظّماً.',
        tipEn: 'Each episode isolates its own sessions, assessments, and progress charts cleanly.',
        tipCkb: 'هەر قۆناغێکی چارەسەر دانیشتن و پشکنینەکانی خۆی بە جیا دەپارێزێت.',
        mobileBodyAr:
          'يختفي شريط التنقل تلقائياً هنا لترك كامل الشاشة لملف المريض. من هذا الشريط المختصر تبدّل حلقة العلاج وتطّلع على التنبيهات السريرية والذمة المالية مع إمكانية طي الملخص.',
        mobileBodyEn:
          'Navigation tucks away automatically here for full-screen charting. Use this compact strip to switch episodes, inspect safety alerts/balances, or collapse the summary.',
        mobileBodyCkb:
          'تەواوی شاشە لێرە بۆ دۆسیەکە تەرخان دەبێت؛ لێرەوە قۆناغی چارەسەر بگۆڕە و ئاگادارکردنەوەکان ببینە.',
        preferredSide: 'bottom',
        chartTab: 'overview',
      },
      {
        id: 'chart_new_session',
        selectors: ['[data-tour="chart-new-session-btn"]'],
        titleAr: 'بدء جلسة علاجية جديدة (Quick SOAP)',
        titleEn: 'Start New Treatment Session (Quick SOAP)',
        titleCkb: 'دەستپێکردنی دانیشتنی نوێ (Quick SOAP)',
        bodyAr:
          'اضغط هنا لفتح جلسة علاجية جديدة داخل الحلقة الحالية؛ ينسخ التطبيق تفاصيل الجلسة السابقة تلقائياً مع تمييزها بلون هادئ لتعديل المستجدات فقط وتوفير وقت التوثيق.',
        bodyEn:
          'Tap here to document today’s session in the active episode—previous visit details carry forward with gentle review highlights so you only update what changed.',
        bodyCkb:
          'لێرە کرتە بکە بۆ تۆمارکردنی دانیشتنی نوێ؛ زانیاریی دانیشتنی پێشوو بۆ پێداچوونەوەی خێرا دەگوازرێتەوە.',
        tipAr: 'تُحفظ المسودات مشفّرة تلقائياً أثناء الكتابة فلا يضيع أي سطر حتى عند انقطاع الكهرباء.',
        tipEn: 'Drafts auto-save encrypted as you type so nothing is lost even if power drops.',
        tipCkb: 'ڕەشنووسەکان لە کاتی نووسیندا خۆکارانە بە کۆدکراوی پاشەکەوت دەبن.',
        preferredSide: 'bottom',
        chartTab: 'overview',
      },
      {
        id: 'chart_tab_overview',
        selectors: ['[data-tour="chart-tab-overview"]', '[data-tour="chart-tabs"]'],
        titleAr: 'التبويب (1): المتابعة والجلسات والفحص السريع',
        titleEn: 'Tab 1: Follow-up, Sessions & Quick Exams',
        titleCkb: 'بەشی ١: بەدواداچوون، دانیشتن و پشکنینی خێرا',
        bodyAr:
          'يعرض لك ملخص الحالة الحالية والشكوى والأهداف، مسار الألم (NPRS)، أزرار الدخول السريع لفحوصات القوة العضلية (MMT الحر) والمدى الحركي (ROM) والفحص العصبي والاختبارات الخاصة لـ 9 مفاصل، بالإضافة إلى الخط الزمني لجميع جلسات المريض.',
        bodyEn:
          'Shows active clinical summary, pain trajectory (NPRS), one-click launchers for free-text MMT, ROM, Neuro screening, and 9-region Special Tests, plus the full chronological sessions timeline.',
        bodyCkb:
          'پوختەی حاڵەت، هێڵکاری ئازار، دوگمەی خێرای MMT و ROM و تاقیکردنەوە تایبەتەکان و لیستی هەموو دانیشتنەکان پیشان دەدات.',
        tipAr: 'اضغط على أي جلسة في القائمة لفتح تفاصيل SOAP الخاصة بها أو إضافة ملحق سريري (Addendum) للجلسات المعتمدة.',
        tipEn: 'Click any session row to review its SOAP note or append a clinical addendum if finalized.',
        tipCkb: 'کرتە لە هەر دانیشتنێک بکە بۆ کردنەوەی تۆماری SOAP یان زیادکردنی پاشکۆ.',
        preferredSide: 'bottom',
        chartTab: 'overview',
      },
      {
        id: 'chart_tab_evaluation',
        selectors: ['[data-tour="chart-tab-evaluation"]', '[data-tour="chart-tabs"]'],
        titleAr: 'التبويب (2): الخطة والتقدم والمقارنة',
        titleEn: 'Tab 2: Plan of Care, Scales & Progress Charts',
        titleCkb: 'بەشی ٢: پلان، پێوەرەکان و بەراوردی پێشکەوتن',
        bodyAr:
          'يجمع أحدث نتائج الفحص الموضوعي وخطة العلاج والأهداف وبرنامج التمارين المنزلية (عند تفعيله)، كما يضم تبويب «مقارنة التقدم» لالتقاط لقطات مقارنة للألم والمقاييس الوظيفية (ODI، NDI، QuickDASH، SPADI، LEFS، PSFS، TUG) وطباعة تقرير التقدم.',
        bodyEn:
          'Combines latest exam findings, Plan of Care, Goals, and Home Exercises (when enabled), plus a dedicated "Progress Charts" sub-view to compare snapshots across ODI, NDI, QuickDASH, SPADI, LEFS, PSFS, and TUG and print progress reports.',
        bodyCkb:
          'دوایین ئەنجامی پشکنین و پلانی چارەسەر و بەراوردی پێشکەوتنی ئازار و پێوەرەکان لەخۆدەگرێت لەگەڵ چاپکردنی ڕاپۆرت.',
        tipAr: 'التبديل بين «الحالة والخطة» و«مقارنة التقدم» يتم من الشريط الفرعي أعلى هذا التبويب.',
        tipEn: 'Switch between "Status & Plan" and "Progress Charts" right below this tab bar.',
        tipCkb: 'لە شریتە لاوەکییەکەی ژێرەوە لە نێوان «دۆخ و پلان» و «بەراوردی پێشکەوتن» بگۆڕە.',
        preferredSide: 'bottom',
        chartTab: 'evaluation',
      },
      {
        id: 'chart_tab_history',
        selectors: ['[data-tour="chart-tab-history"]', '[data-tour="chart-tabs"]'],
        titleAr: 'التبويب (3): السجل المرضي وعلامات الخطر والمحاذير',
        titleEn: 'Tab 3: Medical History, Red Flags & Precautions',
        titleCkb: 'بەشی ٣: مێژووی پزیشکی، ئاڵا سوورەکان و ئاگادارییەکان',
        bodyAr:
          'هنا توثّق الخلفية الطبية الدائمة للمريض: قائمة فحص علامات الخطر (Red Flags)، المحاذير وموانع الأجهزة الكهربائية والفيزيائية، الأمراض المزمنة، العمليات السابقة، الأدوية، تقارير الأشعة والرنين، والمرفقات والصور المشفّرة.',
        bodyEn:
          'Document the patient’s permanent clinical background: Red Flag screening checklist, contraindications & modality safety precautions, chronic history, surgeries, medications, imaging reports, and encrypted attachments.',
        bodyCkb:
          'پاشخانی پزیشکیی نەخۆش تۆمار بکە: ئاڵا سوورەکان، موانعەکانی ئامێر، نەشتەرگەری، دەرمانەکان، ڕاپۆرتی تیشک و فایلە کۆدکراوەکان.',
        tipAr: 'أي علامة خطر أو محذور تسجّله هنا يظهر تلقائياً كتنبيه واضح في أعلى ملف المريض وأثناء الجلسات.',
        tipEn: 'Any Red Flag or Precaution recorded here automatically alerts you in the chart header and sessions.',
        tipCkb: 'هەر ئاڵایەکی سوور لێرە تۆماری بکەیت خۆکارانە لە سەرەوەی دۆسیەکە ئاگادارت دەکاتەوە.',
        preferredSide: 'bottom',
        chartTab: 'history',
      },
      {
        id: 'chart_tab_profile',
        selectors: ['[data-tour="chart-tab-profile"]', '[data-tour="chart-tabs"]'],
        titleAr: 'التبويب (4): الملف الشخصي والمالية والموافقات والتقارير',
        titleEn: 'Tab 4: Personal Info, Financial Ledger, Consents & Export',
        titleCkb: 'بەشی ٤: زانیاری کەسی، دارایی، ڕەزامەندی و چاپکردن',
        bodyAr:
          'يجمع الملخص المالي الكامل للمريض (المدفوع والمتبقي والفواتير)، بيانات التواصل والطوارئ والطبيب المحوِّل، الموافقات المستنيرة بالتوقيع الرقمي، ومركز طباعة التقارير الطبية وتصدير ملف HL7 FHIR R4.',
        bodyEn:
          'Centralizes the patient’s financial summary (paid, balance, invoices), contact & emergency info, referring physician, digital consent signatures, official printable reports, and HL7 FHIR R4 export.',
        bodyCkb:
          'پوختەی دارایی نەخۆش، زانیاری پەیوەندی و فریاکەوتن، واژۆی ڕەزامەندی، چاپکردنی ڕاپۆرت و هەناردەکردنی FHIR لێرەدایە.',
        preferredSide: 'bottom',
        chartTab: 'profile',
      },
      {
        id: 'chart_more',
        selectors: ['[data-tour="chart-more-btn"]'],
        titleAr: 'قائمة الخيارات الإضافية وإعادة شرح الملف',
        titleEn: 'More Chart Actions & Replay Guide',
        titleCkb: 'بژاردە زیادەکان و دووبارەکردنەوەی ڕێبەر',
        bodyAr:
          'من هذه القائمة تبدأ حلقة رعاية جديدة، تعدّل البيانات الشخصية، تطبع تقريراً طبياً شاملاً للطبيب المحوِّل، تثبّت المريض في المفضلة، وتعيد تشغيل «شرح ملف المريض» في أي وقت.',
        bodyEn:
          'Start a new episode, edit personal details, print a comprehensive medical report for referring doctors, pin the patient, check auto-save status, or replay this Patient Chart tour anytime.',
        bodyCkb:
          'قۆناغی نوێ، دەستکاری زانیاری، چاپکردنی ڕاپۆرت، چەسپاندن و دووبارەکردنەوەی گەشتی دۆسیەی نەخۆش لەم مێنووەدایە.',
        mobileBodyAr:
          'تضم هذه القائمة (⋯) جميع الإجراءات الإضافية دون تزاحم: بدء حلقة جديدة، تعديل البيانات، تغيير صورة المريض، طباعة التقرير الطبي، التثبيت، وإعادة تشغيل «شرح ملف المريض» في أي وقت.',
        mobileBodyEn:
          'This (⋯) menu holds all secondary actions cleanly: new episode, edit info, change patient photo, print medical report, pin chart, and replay this Patient Chart guide anytime.',
        mobileBodyCkb:
          'هەموو بژاردە لاوەکییەکان (گۆڕینی وێنە، ڕاپۆرت، قۆناغی نوێ و دووبارەکردنەوەی ڕێبەر) لەم مێنووەدان.',
        preferredSide: 'bottom',
        chartTab: 'overview',
      },
    ],
  },

  session_soap: {
    id: 'session_soap',
    pageLabelAr: 'توثيق الجلسة (Quick SOAP)',
    pageLabelEn: 'Session Documentation (Quick SOAP)',
    pageLabelCkb: 'تۆمارکردنی دانیشتن (Quick SOAP)',
    summaryAr: 'شرح كامل للجلسة: الشكوى S، إضافة الفحوصات والتدخلات وسلامة الأجهزة، الخطة A&P، المؤقت، الحفظ والاعتماد.',
    summaryEn: 'Full session guide: Subjective/NPRS, exam & modality tools with safety checks, A&P, timer, save, and finish/collect/rebook.',
    summaryCkb: 'شیکردنەوەی تەواوی دانیشتن: سکاڵای نەخۆش، پشکنین و ئامێرەکان، پلان، کاتژمێر، پاشەکەوت و تەواوکردن.',
    steps: [
      {
        id: 'session_subjective',
        selectors: ['[data-testid="visit-row-subjective"]'],
        titleAr: 'الشكوى الذاتية (S) ومقياس الألم NPRS',
        titleEn: 'Subjective Complaint (S) & Pain Score (NPRS)',
        titleCkb: 'سکاڵای نەخۆش (S) و پێوەری ئازار NPRS',
        bodyAr:
          'اضغط هنا لتوثيق شكوى المريض اليوم ومستوى الألم قبل وبعد الجلسة (0–10). في الجلسات اللاحقة يُنسخ نص الجلسة السابقة تلقائياً بلون تمييز هادئ لتعديل المستجدات فقط، ويمكنك استخدام اختصارات الجمل الجاهزة أو الإملاء الصوتي.',
        bodyEn:
          'Tap here to record today’s complaint and pre/post NPRS pain scores (0–10). Follow-up visits auto-carry forward previous text with gentle highlights so you only edit what changed.',
        bodyCkb:
          'لێرە کرتە بکە بۆ تۆمارکردنی سکاڵای ئەمڕۆ و نمرەی ئازار (٠–١٠)؛ دەقی دانیشتنی پێشوو بە خۆکار دەگوازرێتەوە بۆ خێراکردنی کار.',
        tipAr: 'الملاحظات المنسوخة تبقى ملوّنة بشارة لطيفة حتى تراجعها أو تعدّلها لضمان دقة التوثيق السريري.',
        tipEn: 'Carried-forward text stays tagged until reviewed so clinical notes stay accurate.',
        tipCkb: 'دەقە گواستراوەکان نیشانە دەکرێن تا پێداچوونەوەیان بۆ دەکەیت.',
        preferredSide: 'bottom',
      },
      {
        id: 'session_add_tools',
        selectors: ['[data-testid="session-add-item-btn"]'],
        titleAr: 'إضافة الفحوصات الموضوعية والتدخلات وسلامة الأجهزة',
        titleEn: 'Add Objective Exams, Interventions & Modality Safety',
        titleCkb: 'زیادکردنی پشکنینەکان، ڕاهێنان و سەلامەتیی ئامێرەکان',
        bodyAr:
          'هذا الزر هو صندوق أدوات المعالج الكامل داخل الجلسة: افتح قوالب الفحص الإقليمي (ركبة، كتف، ظهر، رقبة...)، خريطة الألم التفاعلية، القوة العضلية MMT الحرة، المدى الحركي ROM، الاختبارات الخاصة لـ 9 مفاصل، الفحص العصبي وASIA، المقاييس الوظيفية، التمارين، العلاج اليدوي، والأجهزة الكهربائية (TENS/US/SWD/إبر...).',
        bodyEn:
          'Your full clinical toolkit inside the session: regional exam presets, interactive Pain Map, free-text MMT, ROM, 9-region Special Tests, Neuro/ASIA, Outcome Scales, therapeutic exercises, manual therapy, and physical modalities (TENS/US/SWD/Needling...).',
        bodyCkb:
          'سندووقی تەواوی ئامرازەکانی چارەسەرکار: قاڵبی پشکنین، نەخشەی ئازار، MMT و ROM و تاقیکردنەوە تایبەتەکان، پێوەرەکان، ڕاهێنان، چارەسەری دەستی و ئامێرە کارەباییەکان.',
        tipAr: 'عند تفعيل «قواعد سلامة الأجهزة»، ينبّهك التطبيق تلقائياً إذا تعارض أي جهاز كهربائي أو فيزيائي مع محاذير المريض (مثل منظم ضربات القلب أو الحمل).',
        tipEn: 'When Modality Safety Rules are enabled, PhysioRecord automatically alerts you if any modality conflicts with the patient’s recorded precautions.',
        tipCkb: 'لە کاتی چالاککردنی یاسای سەلامەتی، ئەپەکە خۆکارانە ئاگادارت دەکاتەوە لە هەر مەترسییەکی ئامێرەکان.',
        preferredSide: 'top',
      },
      {
        id: 'session_assessment_plan',
        selectors: ['[data-testid="visit-row-assessment_plan"]'],
        titleAr: 'التقييم السريري والخطة العلاجية (A & P)',
        titleEn: 'Clinical Assessment & Treatment Plan (A & P)',
        titleCkb: 'هەڵسەنگاندنی کلینیکی و پلانی چارەسەر (A & P)',
        bodyAr:
          'سجّل استجابة المريض للجلسة، حالة التقدم (تحسن / ثبات / تراجع)، وخطة الجلسة القادمة والتوصيات المنزلية؛ لتظهر كلها بوضوح في التقارير الطبية وملخص المتابعة.',
        bodyEn:
          'Record patient tolerance, progress status (improved / stable / regressed), and next-visit plan so medical reports and chart timelines stay complete.',
        bodyCkb:
          'کارلێکی نەخۆش، دۆخی پێشکەوتن و پلانی دانیشتنی داهاتوو لێرە تۆمار بکە بۆ ڕاپۆرتە پزیشکییەکان.',
        preferredSide: 'top',
      },
      {
        id: 'session_timer',
        selectors: ['[data-testid="session-timer-widget"]'],
        titleAr: 'مؤقت الجلسة التلقائي',
        titleEn: 'Automatic Session Timer',
        titleCkb: 'کاتژمێری خۆکاری دانیشتن',
        bodyAr:
          'يحسب المدة الفعلية للجلسة تلقائياً أثناء العمل مع إمكانية الإيقاف المؤقت أو الاستئناف أو التصفير، وتُوثّق المدة داخل سجل الجلسة.',
        bodyEn:
          'Automatically tracks actual hands-on treatment duration with pause/resume/reset support and saves it with the session.',
        bodyCkb:
          'ماوەی ڕاستەقینەی دانیشتنەکە خۆکارانە دەژمێرێت و لەگەڵ تۆمارەکە پاشەکەوتی دەکات.',
        preferredSide: 'bottom',
      },
      {
        id: 'session_save',
        selectors: ['[data-tour="session-save-btn"]'],
        titleAr: 'حفظ المسودة المشفّرة',
        titleEn: 'Save Encrypted Draft',
        titleCkb: 'پاشەکەوتی ڕەشنووسی کۆدکراو',
        bodyAr:
          'يُحفظ توثيقك مشفّراً محلياً أولاً بأول تلقائياً، ويمكنك الضغط هنا (أو Ctrl+S من لوحة المفاتيح) لحفظ المسودة فوراً والعودة لإكمالها لاحقاً قبل الاعتماد النهائي.',
        bodyEn:
          'Your clinical note auto-saves encrypted locally; click here (or press Ctrl+S) to save immediately and continue editing later before signing.',
        bodyCkb:
          'تۆمارەکەت بە کۆدکراوی لەسەر ئامێرەکە پاشەکەوت دەبێت؛ لێرە یان Ctrl+S دابگرە بۆ پاشەکەوتی خێرا.',
        mobileTitleAr: 'حفظ المسودة بيد واحدة',
        mobileTitleEn: 'One-Handed Draft Save',
        mobileTitleCkb: 'پاشەکەوتی ڕەشنووس بە یەک دەست',
        mobileBodyAr:
          'يثبت زر الحفظ والاعتماد في أسفل الشاشة ليصل إليه إبهامك بسهولة بجانب سرير المريض دون التمرير للأعلى.',
        mobileBodyEn:
          'Save and Finish stay anchored at the bottom edge so you can document bedside with one thumb without scrolling back up.',
        mobileBodyCkb:
          'دوگمەی پاشەکەوت و تەواوکردن لە خوارەوەی شاشە جێگیر کراون بۆ بەکارهێنانی ئاسان بە یەک دەست.',
        preferredSide: 'bottom',
      },
      {
        id: 'session_sign',
        selectors: ['[data-tour="session-sign-btn"]'],
        titleAr: 'الإنهاء والاعتماد، الملاحق، التحصيل وحجز الموعد القادم',
        titleEn: 'Finish, Seal, Addenda, Collect Payment & Rebook',
        titleCkb: 'تەواوکردن، پەسەندکردن، پارەدان و نۆرەی داهاتوو',
        bodyAr:
          'عند انتهاء الجلسة اضغط هنا لإتمام 3 خطوات بسلاسة في نافذة واحدة: (1) قفل ملاحظة SOAP نهائياً للأمانة السريرية (مع إمكانية إضافة ملحق Addendum مؤرخ عند الحاجة لاحقاً)، (2) تسجيل الدفعة المالية، و(3) حجز الموعد القادم مباشرة.',
        bodyEn:
          'Finish the visit in one unified flow: (1) permanently seal the SOAP note for clinical integrity (append-only Addenda remain available), (2) collect payment, and (3) book the next visit.',
        bodyCkb:
          'بە یەک هەنگاو تۆمارەکە قوفڵ بکە (پاشکۆ هەمیشە بەردەستە)، پارە وەربگرە و نۆرەی داهاتوو دابنێ.',
        tipAr: 'بعد الاعتماد يظهر إشعار «تراجع» لمدة 8 ثوانٍ إذا أردت تعديل الدفعة أو الموعد المحجوز.',
        tipEn: 'An 8-second Undo toast appears after finishing in case you want to tweak billing or rebooking.',
        tipCkb: 'دوای تەواوکردن بۆ ٨ چرکە دوگمەی پاشگەزبوونەوە دەردەکەوێت بۆ هەڵوەشاندنەوەی پارەدان یان نۆرەکە.',
        preferredSide: 'bottom',
      },
    ],
  },

  settings: {
    id: 'settings',
    pageLabelAr: 'الإعدادات والأمان والوحدات',
    pageLabelEn: 'Settings, Security & Modules',
    pageLabelCkb: 'ڕێکخستن، ئاسایش و بەشەکان',
    summaryAr: 'هوية العيادة والدوام، تفعيل الوحدات المخفية، حماية كلمة المرور، العملة، والمظهر.',
    summaryEn: 'Clinic identity, hidden modules, anti-lockout security, currency, and appearance settings.',
    summaryCkb: 'ناسنامەی کلینیک، چالاککردنی بەشە شاراوەکان، ئاسایش، دراو و ڕووکار.',
    steps: [
      {
        id: 'settings_clinic',
        selectors: ['[data-testid="settings-tab-clinic"]'],
        titleAr: 'هوية العيادة، الشعار والختم، وقوالب واتساب',
        titleEn: 'Clinic Identity, Logo/Stamp & WhatsApp Templates',
        titleCkb: 'ناسنامەی کلینیک، لۆگۆ و داڕشتەی واتساپ',
        bodyAr:
          'أدخل اسم العيادة والمعالج، العنوان والهاتف، الشعار والختم الرقمي، أيام الدوام، وعدّل نصوص تذكيرات واتساب لتظهر تلقائياً في كل الإيصالات والتقارير الطبية المطبوعة.',
        bodyEn:
          'Set your clinic and clinician name, address/phone, logo & stamp, working schedule, and bilingual WhatsApp templates printed automatically on receipts and medical reports.',
        bodyCkb:
          'ناوی کلینیک، لۆگۆ، کاتی کار و داڕشتەی نامەکانی واتساپ لێرە دابنێ بۆ پسوولە و ڕاپۆرتەکان.',
        preferredSide: 'end',
        settingsTab: 'clinic',
      },
      {
        id: 'settings_modules',
        selectors: ['[data-testid="settings-tab-modules"]'],
        titleAr: 'الوحدات والأقسام المتقدمة (المخفية افتراضياً)',
        titleEn: 'Optional Clinical Modules (Hidden by Default)',
        titleCkb: 'بەشە کلینیکییە زیادەکان (شاراوە بە بنەڕەت)',
        bodyAr:
          'لإبقاء الواجهة هادئة وبسيطة، أُخفيت الأدوات المتقدمة افتراضياً. من هنا تفعّل ما تحتاجه فقط: مكتبة التمارين (HEP)، التحليلات المحلية، الموافقات بالتوقيع الرقمي، المرفقات ومقارنة القوام، قواعد سلامة الأجهزة الـ 12، الإحالات والاحتفاظ، الأقساط، الإملاء الصوتي، وكشك التابلت.',
        bodyEn:
          'To keep the workspace calm, advanced tools stay off by default. Enable only what your clinic needs: Exercise Library (HEP), Local Analytics, Digital Consents, Posture Photos, 12 Modality Safety Rules, Referrals & Retention, Installments, Voice Dictation, and Tablet Kiosk.',
        bodyCkb:
          'بۆ سادەیی ڕووکار، بەشە پێشکەوتووەکان بە شاراوەیی دانراون؛ لێرەوە کتێبخانەی ڕاهێنان، شیکاری، واژۆی ڕەزامەندی، یاسای سەلامەتی و کیۆسک چالاک بکە.',
        tipAr: 'إخفاء أي وحدة لاحقاً لا يحذف بياناتها المحفوظة أبداً.',
        tipEn: 'Turning a module off hides it from menus without deleting any saved data.',
        tipCkb: 'شاردنەوەی هەر بەشێک هیچ زانیارییەکی پاشەکەوتکراو ناسڕێتەوە.',
        preferredSide: 'end',
        settingsTab: 'modules',
      },
      {
        id: 'settings_security',
        selectors: ['[data-testid="settings-tab-security"]'],
        titleAr: 'الأمان وحماية كلمة المرور من النسيان',
        titleEn: 'Security & 4-Layer Anti-Lockout Protection',
        titleCkb: 'ئاسایش و ٤ چینی پاراستنی وشەی نهێنی',
        bodyAr:
          'فعّل البصمة/Passkey لفتح القفل وتعيين كلمة مرور جديدة بدون القديمة عند النسيان، واضبط التذكير الذكي المتباعد (أسلوب Signal)، وحفظ كلمة المرور بمدير كلمات مرور النظام، وتمرين مفتاح الطوارئ، ومؤقت القفل التلقائي (بما فيه خيار «أبداً»).',
        bodyEn:
          'Enroll Biometrics/Passkey to unlock or reset a forgotten password without the old one, configure spaced-repetition password reminders, OS Password Manager sync, Recovery Key drills, and auto-lock timing (including "Never").',
        bodyCkb:
          'پەنجەمۆر/Passkey، بیرخەرەوەی زیرەکی وشەی نهێنی، بەڕێوەبەری وشەی نهێنیی سیستەم، کلیلی فریاگوزاری و کاتی قوفڵی خۆکار لێرە ڕێکبخە.',
        preferredSide: 'end',
        settingsTab: 'security',
      },
      {
        id: 'settings_currency',
        selectors: ['[data-testid="settings-tab-currency"]'],
        titleAr: 'اختيار العملة المعتمدة في العيادة',
        titleEn: 'Global Clinic Currency (ISO 4217)',
        titleCkb: 'هەڵبژاردنی دراوی کلینیک',
        bodyAr:
          'العملة الافتراضية هي الدينار العراقي (د.ع) وتظهر دائماً بعد الرقم (مثل: 25,000 د.ع)، ويمكنك تغييرها لأي عملة عالمية أخرى (دولار، ريال، درهم...) في أي وقت.',
        bodyEn:
          'Defaults to Iraqi Dinar (IQD) rendered cleanly after the amount (e.g. 25,000 IQD), with full ISO 4217 switching whenever needed.',
        bodyCkb:
          'دراوی بنەڕەتی دیناری عێراقییە و دەتوانیت هەر کاتێک بیگۆڕیت بۆ هەر دراوێکی تری جیهانی.',
        preferredSide: 'end',
        settingsTab: 'currency',
      },
      {
        id: 'settings_display',
        selectors: ['[data-testid="settings-tab-display"]'],
        titleAr: 'اللغة، المظهر الليلي، الألوان ووضع الأجهزة الضعيفة',
        titleEn: 'Language, Dark Mode, Accent Color & Low-End Mode',
        titleCkb: 'زمان، دۆخی شەو، ڕەنگەکان و دۆخی ئامێری لاواز',
        bodyAr:
          'بدّل بين العربية والكردية والإنجليزية، اختر المظهر النهاري أو الليلي، عدّل لون الواجهة وحجم الخط، وفعّل وضع «الأجهزة الضعيفة» لتسريع العمل على الهواتف أو الحواسيب القديمة.',
        bodyEn:
          'Switch between Arabic, Kurdish, and English, pick Light/Dark theme, tune accent colors & font scale, or enable Low-End Device Mode for snappy performance on older devices.',
        bodyCkb:
          'زمان بگۆڕە، دۆخی شەو و ڕۆژ و قەبارەی فۆنت ڕێکبخە یان دۆخی خێراکردنی ئامێری لاواز چالاک بکە.',
        preferredSide: 'end',
        settingsTab: 'display',
      },
    ],
  },

  backup_restore: {
    id: 'backup_restore',
    pageLabelAr: 'النسخ الاحتياطي والاستعادة',
    pageLabelEn: 'Backup & Restore (.ptbackup)',
    pageLabelCkb: 'پاشەکەوت و گەڕاندنەوە (.ptbackup)',
    summaryAr: 'تصدير نسخة مشفّرة كاملة لبيانات عيادتك واستعادتها بأمان بالاستبدال أو الدمج.',
    summaryEn: 'Export encrypted full-clinic .ptbackup archives and restore safely via Replace or Smart Merge.',
    summaryCkb: 'هەناردەکردنی کۆپی یەدەگی کۆدکراو و گەڕاندنەوەی بە سەلامەتی.',
    steps: [
      {
        id: 'backup_export_tab',
        selectors: ['[data-tour="backup-export-tab"]'],
        titleAr: 'تصدير نسخة احتياطية مشفّرة بالكامل (.ptbackup)',
        titleEn: 'Export Full Encrypted Clinic Backup (.ptbackup)',
        titleCkb: 'هەناردەکردنی کۆپی یەدەگی کۆدکراو (.ptbackup)',
        bodyAr:
          'احمِ بيانات عيادتك بتصدير ملف (.ptbackup) مشفّر بكلمة مرور تختارها؛ يشمل كل المرضى والجلسات والصور والمرفقات والفواتير والمواعيد والإعدادات، ويمكنك أيضاً ربط مجلد حفظ مباشر للنسخ التلقائي السريع.',
        bodyEn:
          'Export a password-encrypted .ptbackup archive containing every patient, SOAP note, attachment, invoice, schedule, and setting, or link a local folder for one-click backups.',
        bodyCkb:
          'هەموو نەخۆشەکان، دانیشتنەکان، وێنە و پسوولەکان لە فایلێکی کۆدکراودا (.ptbackup) هەناردە بکە و لەسەر فلاش یان هەڵگرتنی سەلامەت بیپارێزە.',
        mobileBodyAr:
          'احمِ بيانات عيادتك بتصدير ملف (.ptbackup) مشفّر بكلمة مرور تختارها؛ يشمل كل المرضى والجلسات والصور والمرفقات والفواتير والمواعيد والإعدادات، ويمكنك حفظه أو مشاركته مباشرة لتخزينك الآمن.',
        mobileBodyEn:
          'Export a password-encrypted .ptbackup archive containing every patient, SOAP note, attachment, invoice, schedule, and setting, then save or share it safely to your secure storage.',
        mobileBodyCkb:
          'فایلی کۆدکراوی (.ptbackup) هەناردە بکە و ڕاستەوخۆ پاشەکەوتی بکە یان بینێرە بۆ شوێنێکی سەلامەت.',
        tipAr: 'يُفضّل حفظ النسخة الاحتياطية على فلاش USB أو قرص خارجي مرة أسبوعياً على الأقل.',
        tipEn: 'Save an encrypted copy to a USB drive or external storage at least weekly.',
        tipCkb: 'باشترە لانیکەم هەفتەی جارێک کۆپی یەدەگ لەسەر فلاش یان ئامێرێکی تر هەڵبگریت.',
        preferredSide: 'bottom',
      },
      {
        id: 'backup_restore_tab',
        selectors: ['[data-tour="backup-restore-tab"]'],
        titleAr: 'الاستعادة الآمنة (استبدال كامل أو دمج ذكي)',
        titleEn: 'Safe Restoration (Replace or Smart Merge)',
        titleCkb: 'گەڕاندنەوەی سەلامەت (جێگۆڕکێ یان یەکخستنی زیرەک)',
        bodyAr:
          'عند نقل بياناتك لجهاز جديد أو استرجاع نسخة سابقة، يعرض لك التطبيق معاينة لمحتوى النسخة أولاً، ويتيح «الاستبدال الكامل» أو «الدمج الذكي» الذي يحمي الجلسات المعتمدة من التغيير، مع إنشاء نسخة طوارئ تلقائية قبل الاستبدال.',
        bodyEn:
          'Before restoring, PhysioRecord previews exact counts inside the archive and lets you choose Full Replace or Smart Merge (preserving sealed clinical notes), plus an automatic pre-restore emergency snapshot.',
        bodyCkb:
          'پێش گەڕاندنەوە ناوەڕۆکی کۆپی یەدەگ پیشان دەدرێت و دەتوانیت جێگۆڕکێی تەواو یان یەکخستنی زیرەک هەڵبژێریت بە پاراستنی تۆمارە قوفڵکراوەکان.',
        preferredSide: 'bottom',
      },
    ],
  },

  exercises: {
    id: 'exercises',
    pageLabelAr: 'مكتبة التمارين (HEP)',
    pageLabelEn: 'Exercise Library (HEP)',
    pageLabelCkb: 'کتێبخانەی ڕاهێنانەکان (HEP)',
    summaryAr: 'بناء برنامج التمارين المنزلية للمريض، التصفية حسب المفصل، والطباعة أو الإرسال عبر واتساب.',
    summaryEn: 'Build patient Home Exercise Programs filtered by joint/goal, print A4 sheets, or share via WhatsApp.',
    summaryCkb: 'دروستکردنی بەرنامەی ڕاهێنانی ماڵەوە و چاپکردن یان ناردن بە واتساپ.',
    contextualOnly: true,
    steps: [
      {
        id: 'hep_filters',
        selectors: ['[data-tour="hep-filters"]'],
        titleAr: 'تصفية التمارين حسب المفصل والهدف العلاجي',
        titleEn: 'Filter by Joint Region & Therapeutic Goal',
        titleCkb: 'پاڵاوتن بەپێی جومگە و ئامانج',
        bodyAr:
          'ابحث باسم التمرين أو صفِّ المكتبة حسب المنطقة التشريحية (رقبة، كتف، ظهر، ركبة...) والهدف العلاجي (تقوية، مدى حركي، استطالة، ثبات).',
        bodyEn:
          'Search by name or filter exercises by anatomical region (neck, shoulder, lumbar, knee, etc.) and therapeutic goal.',
        bodyCkb:
          'بە ناو بگەڕێ یان بەپێی ناوچەی جەستە و ئامانجی چارەسەر ڕاهێنانەکان بپاڵێوە.',
        preferredSide: 'bottom',
      },
      {
        id: 'hep_builder',
        selectors: ['[data-tour="hep-builder"]'],
        titleAr: 'تخصيص الجرعة العلاجية للبرنامج المنزلي',
        titleEn: 'Customize Sets, Reps & Precautions',
        titleCkb: 'دیاریکردنی ژمارەی دووبارەکردنەوە و سێتەکان',
        bodyAr:
          'كل تمرين تضيفه يظهر هنا مع إمكانية تعديل عدد المجموعات والتكرارات والثبات والملاحظات الخاصة بالمريض.',
        bodyEn:
          'Every assigned exercise appears here where you can fine-tune sets, reps, hold times, and custom instructions.',
        bodyCkb:
          'هەر ڕاهێنانێک زیادی دەکەیت لێرە دەردەکەوێت و دەتوانیت سێت و دووبارەکردنەوەکان بگۆڕیت.',
        preferredSide: 'start',
      },
      {
        id: 'hep_print',
        selectors: ['[data-tour="hep-print-btn"]'],
        titleAr: 'معاينة، طباعة، وإرسال عبر واتساب',
        titleEn: 'Preview, Official Print & WhatsApp Share',
        titleCkb: 'پێشبینین، چاپکردن و ناردن بە واتساپ',
        bodyAr:
          'اعرض ورقة التمارين النهائية لطباعتها بشعار عيادتك أو انسخها وأرسلها مباشرة لواتساب المريض بضغطة واحدة.',
        bodyEn:
          'Preview the printable bilingual exercise sheet with your clinic header, export PDF, or send directly to the patient on WhatsApp.',
        bodyCkb:
          'وەرەقەی ڕاهێنانەکان بە لۆگۆی کلینیکەکەت چاپ بکە یان ڕاستەوخۆ بە واتساپ بۆ نەخۆش بینێرە.',
        preferredSide: 'bottom',
      },
    ],
  },

  analytics: {
    id: 'analytics',
    pageLabelAr: 'التحليلات المحلية للعيادة',
    pageLabelEn: 'Local Clinic Analytics',
    pageLabelCkb: 'شیکاریی ناوخۆیی کلینیک',
    summaryAr: 'إحصائيات الحالات والالتزام وتحسّن المقاييس (MCID) والتدفق النقدي 100% محلياً.',
    summaryEn: '100% local KPIs for active caseload, attendance, MCID clinical improvement, and cashflow.',
    summaryCkb: 'ئاماری نەخۆشەکان، پابەندبوون، باشبوونی پێوەرەکان و داهات ١٠٠٪ بە ناوخۆیی.',
    contextualOnly: true,
    steps: [
      {
        id: 'analytics_header',
        selectors: ['[data-tour="analytics-header"]'],
        titleAr: 'تحليلات محلية 100% بدون خروج أي بيانات',
        titleEn: '100% On-Device Analytics — Zero Telemetry',
        titleCkb: 'شیکاری ١٠٠٪ لەسەر ئامێرەکەت',
        bodyAr:
          'تُحسب جميع الأرقام والرسوم البيانية مباشرة من خزينتك المشفرة على جهازك بدون إرسال أي بيانات للإنترنت.',
        bodyEn:
          'Every metric and chart is computed locally inside your encrypted browser vault with zero external network calls.',
        bodyCkb:
          'هەموو ژمارە و هێڵکارییەکان ڕاستەوخۆ لەسەر ئامێرەکەت هەژمار دەکرێن بێ هیچ پەیوەندییەکی دەرەکی.',
        preferredSide: 'bottom',
      },
      {
        id: 'analytics_kpis',
        selectors: ['[data-tour="analytics-kpi-grid"]'],
        titleAr: 'مؤشرات الأداء السريري والمالي',
        titleEn: 'Clinical & Financial KPIs',
        titleCkb: 'پێوەرە کلینیکی و داراییەکان',
        bodyAr:
          'تابع عدد الحالات النشطة، نسبة الحضور مقابل عدم الحضور، متوسط الجلسات لكل حلقة علاج، تحسّن مقاييس المرضى (MCID)، وصافي التدفق النقدي.',
        bodyEn:
          'Track active caseload, attendance vs no-show rates, average sessions per episode, outcome MCID improvements, and monthly cashflow.',
        bodyCkb:
          'چاودێری حاڵەتە چالاکەکان، ڕێژەی ئامادەبوون، باشبوونی پێوەرەکان و داهاتی مانگانە بکە.',
        preferredSide: 'bottom',
      },
    ],
  },

  activity_log: {
    id: 'activity_log',
    pageLabelAr: 'سجل النشاط والكادر',
    pageLabelEn: 'Audit & Staff Roles',
    pageLabelCkb: 'تۆماری چالاکی و ستاف',
    summaryAr: 'التبديل بين الكادر، التحقق من سلسلة النزاهة المحلية، ومراقبة حالة التخزين الدائم.',
    summaryEn: 'Switch staff attribution profiles, verify local audit integrity, and check persistent storage.',
    summaryCkb: 'گۆڕینی ستاف، پشکنینی دروستی تۆمارەکان و دۆخی هەڵگرتن.',
    contextualOnly: true,
    steps: [
      {
        id: 'activity_storage',
        selectors: ['[data-tour="activity-storage-badge"]'],
        titleAr: 'حالة التخزين الدائم على المتصفح',
        titleEn: 'Persistent Local Storage Status',
        titleCkb: 'دۆخی هەڵگرتنی هەمیشەیی',
        bodyAr:
          'توضح هذه الشارة هل منح المتصفح التطبيق تخزيناً دائماً محمياً من التنظيف التلقائي، ومع ذلك يبقى النسخ الاحتياطي الدوري (.ptbackup) أساسياً.',
        bodyEn:
          'Shows whether your browser granted persistent storage protection against automatic eviction—routine .ptbackup exports remain essential.',
        bodyCkb:
          'نیشانی دەدات کە ئایا وێبگەڕەکە هەڵگرتنی هەمیشەیی پێداوە یان نا.',
        preferredSide: 'bottom',
      },
      {
        id: 'activity_staff',
        selectors: ['[data-tour="activity-staff-cards"]'],
        titleAr: 'بطاقات تبديل هوية الكادر',
        titleEn: 'Staff Attribution Profile Cards',
        titleCkb: 'کارتی گۆڕینی ناسنامەی ستاف',
        bodyAr:
          'اختر اسم الموظف أو المعالج العامل حالياً لتنسب الجلسات والمواعيد والفواتير باسمه في سجل النشاط المحلي.',
        bodyEn:
          'Select the currently active clinician or receptionist so sessions, bookings, and invoices are attributed cleanly in the local audit trail.',
        bodyCkb:
          'ناوی چارەسەرکار یان کارمەندی چالاک هەڵبژێرە بۆ ئەوەی تۆمارەکان بە ناویەوە بنووسرێن.',
        preferredSide: 'bottom',
      },
    ],
  },
};

export const DESKTOP_SHORTCUTS: DesktopShortcutItem[] = [
  {
    keys: 'Ctrl + K',
    labelAr: 'البحث الشامل ولوحة الأوامر',
    labelEn: 'Global Search & Command Palette',
    labelCkb: 'گەڕانی گشتی و پانێڵی فەرمانەکان',
    detailAr: 'ابحث عن أي مريض بالاسم أو الهاتف أو MRN، أو نفّذ أي إجراء (حجز، فاتورة، إعدادات، دليل) فوراً.',
    detailEn: 'Find any patient by name, phone, or MRN, or run any action (booking, invoice, settings, guide).',
    detailCkb: 'بە ناو یان مۆبایل بۆ هەر نەخۆشێک بگەڕێ یان هەر فەرمانێک بە خێرایی جێبەجێ بکە.',
  },
  {
    keys: 'Ctrl + S',
    labelAr: 'حفظ مسودة الجلسة فوراً',
    labelEn: 'Instant Save SOAP Draft',
    labelCkb: 'پاشەکەوتی خێرای ڕەشنووسی SOAP',
    detailAr: 'يحفظ ملاحظة SOAP الجارية مشفّرة فوراً أثناء الكتابة داخل الجلسة.',
    detailEn: 'Saves the active SOAP session draft encrypted immediately while charting.',
    detailCkb: 'ڕەشنووسی دانیشتنی SOAP لە کاتی نووسیندا دەستبەجێ پاشەکەوت دەکات.',
  },
  {
    keys: 'Esc × 2',
    labelAr: 'ستار الخصوصية الفوري',
    labelEn: 'Instant Privacy Cover',
    labelCkb: 'داپۆشەری خێرای نهێنی',
    detailAr: 'اضغط Esc مرتين لإخفاء شاشة العيادة كاملة فوراً عند دخول مراجع أو زائر قرب الحاسبة.',
    detailEn: 'Double-press Esc to cover the entire clinical screen immediately when visitors approach.',
    detailCkb: 'دوو جار Esc دابگرە بۆ داپۆشینی تەواوی شاشەکە کاتێک سەردانیکەر نزیک دەبێتەوە.',
  },
  {
    keys: 'Ctrl + L',
    labelAr: 'قفل الخزينة المشفّرة فوراً',
    labelEn: 'Instant Vault Lock',
    labelCkb: 'قوفڵکردنی خێرای خەزێنە',
    detailAr: 'يقفل التطبيق ويفرّغ مفتاح التشفير من الذاكرة فوراً عند مغادرة المكتب.',
    detailEn: 'Locks the app and clears the encryption key from memory immediately when stepping away.',
    detailCkb: 'ئەپەکە قوفڵ دەکات و کلیلی کۆدکردن لە میمۆری دەسڕێتەوە.',
  },
  {
    keys: '← / → / Esc',
    labelAr: 'التنقل داخل الجولات الإرشادية',
    labelEn: 'Spotlight Tour Navigation',
    labelCkb: 'گەڕان لەناو گەشتە ڕێنوێنییەکان',
    detailAr: 'استخدم الأسهم للتقدم والرجوع بين خطوات الشرح، وEsc لإغلاق الجولة بأي لحظة.',
    detailEn: 'Use Arrow keys to step forward/back through spotlight explanations, and Esc to exit anytime.',
    detailCkb: 'تیرەکان بەکاربهێنە بۆ چوونە پێش و دواوە لە هەنگاوەکان و Esc بۆ داخستن.',
  },
];

export const DESKTOP_GUIDE_TOPICS: QuickGuideTopic[] = [
  {
    id: 'desktop_interface_nav',
    device: 'desktop',
    category: 'interface',
    titleAr: 'التنقل السريع: الشريط الجانبي والبحث (Ctrl+K)',
    titleEn: 'Navigation: Side Rail & Command Palette (Ctrl+K)',
    titleCkb: 'گەڕانی خێرا: شریتی تەنیشت و گەڕان',
    summaryAr: 'تعرّف على الشريط الجانبي القابل للطي، زر الإضافة السريعة (+)، وقائمة العيادة السفلية.',
    summaryEn: 'Master the collapsible side rail (224px / 68px), permanent Ctrl+K search, (+) Quick Add, and rail account menu.',
    summaryCkb: 'چۆنیەتی بەکارهێنانی شریتی تەنیشت، گەڕانی Ctrl+K، زیادکردنی خێرا و مێنووی هەژمار.',
    stepsAr: [
      'الشريط الجانبي يثبت على يمين الشاشة (بالعربية والكردية) أو يسارها (بالإنجليزية) ويضم الأقسام الأربعة الرئيسية + الوحدات الإضافية عند تفعيلها.',
      'اضغط أيقونة «طي القائمة» أعلى الشريط لتحويله إلى شريط أيقونات نحيف (68px) يمنحك أوسع مساحة لقراءة ملف المريض ومقارنة النتائج.',
      'استخدم زر «+ إضافة سريعة» في أعلى الشريط لفتح مريض جديد أو حجز موعد أو إصدار فاتورة من أي شاشة كنت فيها.',
      'قائمة الحساب أسفل الشريط تجمع: حالة النسخ الاحتياطي، التبديل بين وضع الفردي والعيادة، ستار الخصوصية، الإعدادات، الدليل، وقفل الخزينة.',
    ],
    stepsEn: [
      'The side rail stays docked on the edge with your 4 core tabs plus optional modules when enabled.',
      'Click the Collapse icon at the top of the rail to toggle between labeled (224px) and compact icon-only (68px) mode.',
      'Use "+ Quick Add" at the top of the rail to create a patient, appointment, or invoice from any screen.',
      'The Account Menu at the bottom holds Backup status, Solo/Clinic toggle, Privacy Cover, Settings, Guide, and Vault Lock.',
    ],
    stepsCkb: [
      'شریتی تەنیشت بەشە سەرەکییەکان و بەشە زیادە چالاککراوەکان لەخۆدەگرێت.',
      'دوگمەی کۆکردنەوە لە سەرەوەی شریتەکە دابگرە بۆ فراوانکردنی ڕووبەری کارکردن.',
      'لە «+ زیادکردنی خێرا» نەخۆش یان نۆرە یان پسوولە لە هەر شاشەیەکەوە زیاد بکە.',
      'مێنووی هەژمار لە خوارەوەی شریتەکە هەموو ئامرازەکانی ڕێکخستن و پاشەکەوت و قوفڵی تێدایە.',
    ],
    keywords: 'desktop laptop sidebar rail collapse search ctrl k حاسبة لابتوب شريط جانبي تنقل بحث کۆمپیوتەر',
    tourId: 'today',
  },
  {
    id: 'desktop_patient_chart',
    device: 'desktop',
    category: 'clinical',
    titleAr: 'سجل المريض السريري (التبويبات الأربعة وحلقات العلاج)',
    titleEn: 'Patient Clinical Record (4 Tabs & Care Episodes)',
    titleCkb: 'دۆسیەی کلینیکیی نەخۆش (٤ بەش و قۆناغەکانی چارەسەر)',
    summaryAr: 'شرح مفصّل لمحتوى ملف المريض: شريط الحلقات والتنبيهات، المتابعة، الخطة والتقدم، السجل المرضي، والمالية.',
    summaryEn: 'Detailed breakdown of the patient record: episode switcher, safety alerts, Follow-up, Plan & Progress, History, and Finance & Docs.',
    summaryCkb: 'شیکردنەوەی وردی دۆسیەی نەخۆش: قۆناغەکانی چارەسەر، بەدواداچوون، پلان، مێژووی پزیشکی و دارایی.',
    stepsAr: [
      'أعلى ملف المريض يظهر شريط «حلقة الرعاية» والتنبيهات السريرية والمالية؛ يمكنك التبديل بين إصابات/حلقات مختلفة لنفس المريض أو فتح حلقة جديدة معزولة تماماً، كما يظهر زر «+ جلسة جديدة» وقائمة الخيارات (⋯) التي تتيح طباعة التقرير الطبي الشامل أو إعادة تشغيل جولة الملف.',
      'تبويب (1) المتابعة والجلسات: يعرض الشكوى والتشخيص، منحنى الألم (NPRS)، اختصارات الفحوصات الموضوعية (MMT الحر مع زر +، ROM، الفحص العصبي، والاختبارات الخاصة لـ 9 مفاصل)، والخط الزمني لكل الجلسات.',
      'تبويب (2) الخطة والتقدم: يضم أحدث حالة فحص وخطة العلاج والأهداف وبرنامج التمارين المنزلية (عند تفعيله)، مع تبويب فرعي «مقارنة التقدم» لمتابعة تحسّن الألم والمقاييس الوظيفية (ODI، NDI، QuickDASH، SPADI، LEFS، PSFS، TUG) وطباعة تقرير التقدم.',
      'تبويب (3) السجل المرضي: مخصّص للخلفية الطبية الدائمة — قائمة علامات الخطر (Red Flags)، محاذير وموانع الأجهزة، الأمراض المزمنة، العمليات، الأدوية، تقارير الأشعة، والمرفقات المشفّرة.',
      'تبويب (4) الملف والمالية: يعرض الذمة المالية والفواتير الخاصة بالمريض، بيانات الطوارئ والطبيب المحوِّل، الموافقات المستنيرة بالتوقيع الرقمي، وطباعة المستندات وتصدير HL7 FHIR R4.',
    ],
    stepsEn: [
      'The top strip lets you switch or create isolated Care Episodes, see Red Flags/Precautions/debts instantly, start "+ New Session", or open the (⋯) menu for comprehensive reports and chart guide replay.',
      'Tab 1 — Follow-up & Sessions: active clinical summary, NPRS trajectory, quick launchers for free-text MMT, ROM, Neuro, and 9-region Special Tests, plus the full sessions timeline.',
      'Tab 2 — Plan & Progress: latest exam status, treatment plan, goals, optional HEP, and a "Progress Charts" sub-view comparing outcome scales (ODI, NDI, QuickDASH, SPADI, LEFS, PSFS, TUG) with printable progress reports.',
      'Tab 3 — Medical History: permanent safety & background face-sheet covering Red Flags, modality precautions/contraindications, chronic history, surgeries, medications, imaging reports, and encrypted files.',
      'Tab 4 — Financial & Docs: patient-level invoices & balance, emergency/referring physician details, digital consents, printable forms, and HL7 FHIR R4 export.',
    ],
    stepsCkb: [
      'لە سەرەوەی دۆسیەکە قۆناغی چارەسەر بگۆڕە، ئاڵا سوور و قەرزەکان ببینە، یان «+ دانیشتنی نوێ» بکەرەوە.',
      'بەشی ١ (بەدواداچوون): پوختەی حاڵەت، هێڵکاری ئازار، MMT و ROM و تاقیکردنەوە تایبەتەکان و لیستی دانیشتنەکان.',
      'بەشی ٢ (پلان و پێشکەوتن): پلانی چارەسەر، ئامانجەکان، بەراوردی پێوەرەکان و چاپکردنی ڕاپۆرتی پێشکەوتن.',
      'بەشی ٣ (مێژووی پزیشکی): ئاڵا سوورەکان، موانعەکانی ئامێر، دەرمان، نەشتەرگەری و ڕاپۆرتی تیشک.',
      'بەشی ٤ (دارایی و دۆکیومێنت): پسوولەکانی نەخۆش، واژۆی ڕەزامەندی، زانیاری کەسی و هەناردەکردنی FHIR.',
    ],
    keywords: 'patient chart record tabs episode history red flags finance mmt rom سجل المريض ملف المريض تبويبات حلقة علاج علامات خطر مالية دۆسیەی نەخۆش',
    tourId: 'patient_chart',
  },
  {
    id: 'desktop_clinical_workflow',
    device: 'desktop',
    category: 'clinical',
    titleAr: 'دورة الفحص وتوثيق SOAP على الشاشة العريضة',
    titleEn: 'Wide-Screen Clinical Charting, Assessments & SOAP',
    titleCkb: 'پشکنین و تۆمارکردنی SOAP لەسەر شاشەی گەورە',
    summaryAr: 'استفد من عرض الملف السريري بـ 4 تبويبات، الشريط العلوي للجلسة، الفحوصات، والطباعة الرسمية A4.',
    summaryEn: 'Chart faster with 4 structured tabs, top sticky SOAP controls (Ctrl+S), 9-region tests, and direct A4 printing.',
    summaryCkb: 'بەکارهێنانی دۆسیەی چوار بەشی، شریتی سەرەوەی SOAP، پشکنینەکان و چاپکردنی A4.',
    stepsAr: [
      'من شاشة اليوم اضغط «+ مراجع سريع» أو افتح أي مريض من سجل المرضى للدخول لملفه السريري ذي التبويبات الأربعة (المتابعة والجلسات، الخطة والتقدم، السجل المرضي، المالية والمرفقات).',
      'داخل «الخطة والتقدم» تتوفر خريطة الألم التفاعلية، بطاقات MMT الحرة مع زر (+)، قياسات ROM، الاختبارات الخاصة لـ 9 مفاصل، وحاسبات المقاييس (ODI، NDI، QuickDASH، SPADI، LEFS، NPRS، PSFS، TUG).',
      'أثناء جلسة Quick SOAP يختفي الشريط الجانبي تلقائياً (وضع التركيز) ويظهر شريط علوي ثابت يحوي المؤقت وزر الحفظ (Ctrl+S) وزر «إنهاء واعتماد».',
      'بعد اعتماد ملاحظة SOAP تُقفل نهائياً للأمانة السريرية؛ وإذا احتجت تعديلاً لاحقاً أضف «ملحقاً سريرياً» (Addendum) موثقاً بالوقت والتاريخ.',
      'يمكنك طباعة التقارير الطبية، الإيصالات، جدول اليوم، وبرنامج التمارين (HEP) بصيغة A4 نظيفة بشعار وختم عيادتك مباشرة من المتصفح.',
    ],
    stepsEn: [
      'Use "+ Walk-In" on Today or click any patient to enter the 4-tab clinical chart (Follow-up, Plan & Progress, History, Finance & Docs).',
      'Inside "Plan & Progress", access the interactive Pain Map, free-text MMT cards, ROM, 9-region Special Tests, and Outcome Calculators.',
      'During Quick SOAP, Focus Mode hides the side rail while keeping Timer, Save (Ctrl+S), and "Finish & Sign" anchored at the top.',
      'Sealed SOAP notes are immutable; record corrections cleanly via timestamped Clinical Addenda.',
      'Print A4 clinical reports, receipts, daily schedules, and HEP handouts with your clinic header and stamp.',
    ],
    stepsCkb: [
      'لە پەڕەی ئەمڕۆ یان تۆماری نەخۆشەکان دۆسیەی چوار بەشی نەخۆش بکەرەوە.',
      'لە «پلان و پێشکەوتن» نەخشەی ئازار، MMT، ROM، تاقیکردنەوە تایبەتەکان و پێوەرەکان بەردەستن.',
      'لە کاتی نووسینی SOAP شریتی تەنیشت دەشاردرێتەوە و کاتژمێر و پاشەکەوت (Ctrl+S) لە سەرەوە جێگیر دەبن.',
      'دوای پەسەندکردنی SOAP تۆمارەکە قوفڵ دەبێت و بۆ هەر زیادکردنێک پاشکۆی کلینیکی بەکاربهێنە.',
    ],
    keywords: 'soap mmt rom special tests odi ndi print a4 chart addendum حاسبة فحص سريري طباعة تقرير توثيق',
    tourId: 'patient_chart',
  },
  {
    id: 'desktop_schedule_finance',
    device: 'desktop',
    category: 'finance',
    titleAr: 'جدول المواعيد المتكرر والحسابات العراقية',
    titleEn: 'Recurring Schedule & Iraqi Financial Ledger',
    titleCkb: 'خشتەی نۆرەی هەفتانە و ژمێریاری',
    summaryAr: 'جدولة الكورسات الأسبوعية، فواتير الجلسة/الكورس/الفحص، الأقساط، والمصاريف وتقارير الصندوق.',
    summaryEn: 'Schedule weekly weekday courses, issue blank-default invoices (Cash/ZainCash/QiCard), and print Z-reports.',
    summaryCkb: 'تۆمارکردنی کۆرسی هەفتانە، پسوولە بە نەقد و ZainCash و QiCard و ڕاپۆرتی سندووق.',
    stepsAr: [
      'في تبويب «المواعيد» احجز جلسة مفردة أو كورساً بأيام أسبوعية متكررة (مثل أحد/ثلاثاء/خميس) وحدّد مدة الجلسة يدوياً، واضبط العطل والاستراحات من قائمة الخيارات.',
      'في تبويب «الحسابات» أصدر فاتورة (جلسة مفردة / كورس / فحص) بمبالغ تبدأ فارغة تماماً لتضع تسعيرتك، واختر طريقة الدفع (نقداً، ZainCash، QiCard، أو أخرى).',
      'سجّل مصاريف العيادة وتابع الذمم والأقساط (30/60/90 يوم) بضغطة واحدة من شريط الملخص العلوي، ثم اطبع تقرير إغلاق الصندوق (Z-Report) نهاية اليوم.',
    ],
    stepsEn: [
      'In Schedule, book single visits or weekly recurring weekday courses with manual duration, and manage closed days/breaks.',
      'In Finance, issue Session, Course, or Exam invoices starting from blank amounts using Cash, ZainCash, QiCard, or Other.',
      'Log clinic expenses, filter unpaid balances & installment plans, and print End-of-Day Z-Reports.',
    ],
    stepsCkb: [
      'لە خشتەی نۆرەکان دانیشتنی تاک یان کۆرسی هەفتانە بە ماوەی دەستی تۆمار بکە.',
      'لە ژمێریاری پسوولەی دانیشتن/کۆرس/پشکنین بە نەقد و ZainCash و QiCard دەربکە.',
      'خەرجییەکان تۆمار بکە و لە کۆتایی ڕۆژدا ڕاپۆرتی داخستنی سندووق چاپ بکە.',
    ],
    keywords: 'schedule recurring finance invoice iqd zaincash qicard z-report مواعيد كورس فاتورة حسابات دينار زين كاش',
    tourId: 'finance',
  },
  {
    id: 'desktop_security_backup',
    device: 'desktop',
    category: 'security',
    titleAr: 'الأمان، البصمة (Windows Hello / Touch ID)، والنسخ الاحتياطي',
    titleEn: 'Security, Passkey Unlock & .ptbackup Archives',
    titleCkb: 'ئاسایش، پەنجەمۆر و فایلی پاشەکەوت',
    summaryAr: 'احمِ كلمة المرور من النسيان، وصدّر نسخاً مشفّرة (.ptbackup) على القرص أو الفلاش الخارجي.',
    summaryEn: 'Set up Windows Hello / Touch ID password reset, spaced reminders, OS Password Manager, and external .ptbackup files.',
    summaryCkb: 'چالاککردنی پەنجەمۆر، بیرخەرەوەی وشەی نهێنی و هەناردەکردنی فایلی کۆدکراوی .ptbackup.',
    stepsAr: [
      'افتح الإعدادات ← الأمان لتفعيل البصمة / Passkey (مثل Windows Hello أو Touch ID) حتى تتمكن من فتح الخزينة أو تعيين كلمة مرور جديدة بدون القديمة إذا نسيتها.',
      'احفظ «مفتاح الطوارئ» (32 خانة) مطبوعاً أو في مكان آمن كخطة استرداد نهائية، واقبل حفظ كلمة المرور في مدير كلمات مرور المتصفح (Google / iCloud).',
      'أبقِ «التذكير الذكي المتباعد» مفعّلاً لتثبيت كلمة المرور بذاكرتك بهدوء أثناء عملك.',
      'من قائمة الحساب ← «النسخ الاحتياطي» صدّر ملف (.ptbackup) مشفّراً واحفظه على فلاش USB أو قرص خارجي أسبوعياً، ويمكنك أيضاً تصدير CSV أو HL7 FHIR R4.',
    ],
    stepsEn: [
      'Open Settings -> Security to enroll Windows Hello / Touch ID Passkey for fast unlock and forgotten-password reset.',
      'Store your 32-character Recovery Key offline and allow browser Password Manager saving.',
      'Keep spaced-repetition password reminders enabled so your passphrase stays fresh without risking lockout.',
      'Export encrypted .ptbackup files weekly to a USB drive or external folder via Account Menu -> Backup & Restore.',
    ],
    stepsCkb: [
      'لە ڕێکخستنەکان ← ئاسایش پەنجەمۆر/Passkey چالاک بکە بۆ کردنەوە و گۆڕینی وشەی نهێنی.',
      'کلیلی فریاگوزاری (٣٢ خانە) لە شوێنێکی سەلامەت هەڵبگرە.',
      'هەفتانە فایلی کۆدکراوی .ptbackup لە ڕێگەی مێنووی هەژمارەوە هەناردە بکە.',
    ],
    keywords: 'security passkey windows hello touch id backup ptbackup recovery password أمان بصمة نسخ احتياطي نسيت كلمة المرور',
    tourId: 'settings',
  },
  {
    id: 'desktop_hidden_modules',
    device: 'desktop',
    category: 'modules',
    titleAr: 'الوحدات المتقدمة (المخفية افتراضياً لإبقاء الواجهة هادئة)',
    titleEn: 'Optional Advanced Modules (Hidden by Default)',
    titleCkb: 'بەشە پێشکەوتووە شاراوەکان',
    summaryAr: 'فعّل مكتبة التمارين، التحليلات المحلية، الموافقات الرقمية، قواعد سلامة الأجهزة، والمرفقات متى احتجتها.',
    summaryEn: 'Enable Exercise Library (HEP), Local Analytics, Digital Consents, Posture Photos, Safety Rules, and Slash Templates.',
    summaryCkb: 'کتێبخانەی ڕاهێنان، شیکاری، واژۆی ڕەزامەندی، یاسای سەلامەتی و قاڵبەکانی (/).',
    stepsAr: [
      'افتح الإعدادات ← «الأقسام» لتفعيل أي وحدة متقدمة حسب حاجة عيادتك دون ازدحام.',
      'تشمل: مكتبة التمارين (HEP)، المرفقات المشفرة ومقارنة صور القوام قبل/بعد، الموافقات المستنيرة بالتوقيع الرقمي، التحليلات المحلية (MCID)، اختصارات الجمل (/)، وقواعد سلامة الأجهزة الكهربائية.',
      'يمكنك أيضاً استيراد قوائم المرضى من ملفات Excel (XLSX) أو CSV عبر معالج الاستيراد المدمج.',
    ],
    stepsEn: [
      'Open Settings -> Modules to toggle optional clinical tools on or off cleanly.',
      'Includes Exercise Library (HEP), Encrypted Attachments & Posture Comparison, Digital Consents, Local Analytics, Slash Snippets (/), and 12 Modality Safety Rules.',
      'You can also bulk-import existing patients from CSV or Excel (XLSX) files offline.',
    ],
    stepsCkb: [
      'لە ڕێکخستنەکان ← بەشەکان هەر ئامرازێکی پێشکەوتوو کە پێویستت پێیەتی چالاک بکە.',
      'کتێبخانەی ڕاهێنان، وێنەی پۆستەر، واژۆی ڕەزامەندی، شیکاری و یاساکانی سەلامەتی لەخۆدەگرێت.',
    ],
    keywords: 'modules hep analytics consent safety xlsx csv templates اقسام وحدات تمارين تحليلات موافقات سلامة اجهزة استيراد',
    tourId: 'settings',
  },
];

export const MOBILE_GUIDE_TOPICS: QuickGuideTopic[] = [
  {
    id: 'mobile_interface_dock',
    device: 'mobile',
    category: 'interface',
    titleAr: 'التنقل بيد واحدة: المقبض السفلي العائم والشريط العلوي',
    titleEn: 'One-Handed Navigation: Floating Pill & Top Menu',
    titleCkb: 'گەڕان بە یەک دەست: شریتی خوارەوەی خۆشاراوە و مێنووی سەرەوە',
    summaryAr: 'كيف تتنقل بيد واحدة وتفتح البحث وزر (+) وقائمة الإعدادات دون ازدحام على الشاشة.',
    summaryEn: 'Navigate one-handed with the bottom thumb handle, centered floating pill, and top-corner clinic menu.',
    summaryCkb: 'چۆن بە یەک دەست بگەڕێیت و مێنوو و گەڕان و زیادکردن بکەیتەوە.',
    stepsAr: [
      'في أسفل الشاشة يوجد «مقبض سفلي هادئ» لإبقاء الشاشة واسعة أثناء القراءة والفحص. المس المقبض ليظهر شريط التنقل العائم (Floating Pill).',
      'يضم الشريط العائم الأقسام الأربعة الرئيسية (اليوم/الاستقبال، المواعيد، المرضى، الحسابات) + أيقونة البحث السريع + زر (+) لإضافة مريض أو موعد أو فاتورة فوراً، ثم يختفي تلقائياً بعد 4.5 ثوانٍ أو عند لمس أي مكان خارجه.',
      'في أعلى الشاشة تظهر تسمية الصفحة الحالية وعلى الطرف أيقونة «قائمة العيادة» الدائرية التي تضم: النسخ الاحتياطي، التبديل بين الفردي والعيادة، الأقسام الإضافية (التمارين/التحليلات)، ستار الخصوصية، المظهر واللغة، الإعدادات، الدليل، وقفل الخزينة.',
      'على أجهزة أندرويد، يدعم التطبيق زر الرجوع الفعلي للرجوع تدريجياً وإغلاق النوافذ أو الجولات بسلاسة.',
    ],
    stepsEn: [
      'At the bottom of the screen sits a quiet thumb handle to preserve reading space. Tap it to reveal the centered Floating Pill.',
      'The Floating Pill holds your 4 core views + Search + (+) Quick Add, and automatically tucks away after 4.5s or tapping outside.',
      'At the top bar, tap the circular Clinic Menu icon for Backups, Solo/Clinic mode, optional modules (Exercises/Analytics/Kiosk), Privacy Cover, Theme/Language, Settings, Guide, and Vault Lock.',
      'On Android, the hardware back button steps back cleanly across modals, tours, and screens.',
    ],
    stepsCkb: [
      'لە خوارەوەی شاشە دەسکێکی بچووک هەیە؛ دەستی لێبدە بۆ پیشاندانی شریتی گەڕانی خێرا.',
      'شریتەکە ٤ بەشە سەرەکییەکە + گەڕان + (+) لەخۆدەگرێت و دوای چەند چرکەیەک خۆکارانە دەشاردرێتەوە.',
      'لە سەرەوەی شاشە ئایکۆنی مێنووی کلینیک هەموو ڕێکخستن و پاشەکەوت و قوفڵی تێدایە.',
    ],
    keywords: 'mobile phone dock pill thumb header android back هاتف موبايل شريط عائم مقبض تنقل بيد واحدة مۆبایل',
    tourId: 'today',
  },
  {
    id: 'mobile_patient_chart',
    device: 'mobile',
    category: 'clinical',
    titleAr: 'سجل المريض السريري (التبويبات الأربعة وحلقات العلاج)',
    titleEn: 'Patient Clinical Record (4 Tabs & Care Episodes)',
    titleCkb: 'دۆسیەی کلینیکیی نەخۆش (٤ بەش و قۆناغەکانی چارەسەر)',
    summaryAr: 'العرض الكامل لملف المريض، التبويبات الأربعة بسطر واحد، طيّ التنبيهات، وقائمة (⋯).',
    summaryEn: 'Full-screen chart layout: collapsible episode/alerts strip, 1-line 4-tab bar, and the (⋯) menu.',
    summaryCkb: 'شاشەی تەواو بۆ دۆسیەی نەخۆش، چوار بەشەکە بە یەک ڕیز و مێنووی (⋯).',
    stepsAr: [
      'عند فتح سجل أي مريض يختفي الشريط العلوي والمقبض السفلي تلقائياً لتعمل على كامل الشاشة براحة، مع زر رجوع مباشر أعلى البطاقة (وزر الرجوع الفعلي في أندرويد).',
      'تظهر التبويبات الأربعة دائماً بسطر واحد مرتّب بدون الحاجة للتمرير الأفقي: (1) المتابعة والجلسات، (2) الخطة والتقدم، (3) السجل المرضي وعلامات الخطر، و(4) الملف والمالية والموافقات.',
      'يمكنك طيّ شريط الملخص والتنبيهات أعلى الملف بلمسة لتوسيع مساحة القراءة، والتبديل بين حلقات العلاج من القائمة المنسدلة مباشرة.',
      'قائمة النقاط الثلاث (⋯) أعلى ملف المريض تجمع الإجراءات الإضافية دون زحام: بدء حلقة جديدة، تعديل البيانات الشخصية، تغيير صورة المريض من الكاميرا/المعرض، طباعة التقرير الطبي، التثبيت في المفضلة، وإعادة تشغيل «شرح ملف المريض».',
    ],
    stepsEn: [
      'Opening a patient chart automatically hides outer chrome for full-screen focus, with a clean Back button (plus Android hardware back support).',
      'All 4 chart tabs sit cleanly on a single non-scrolling row: (1) Follow-up & Sessions, (2) Plan & Progress, (3) Medical History & Red Flags, and (4) Financial & Docs.',
      'Tap the episode/alerts strip to switch care episodes or collapse summary details for extra vertical reading space.',
      'The top-corner (⋯) menu neatly houses secondary actions: Start New Episode, Edit Personal Info, Change Patient Photo, Print Comprehensive Report, Pin Patient, and Replay Patient Chart Guide.',
    ],
    stepsCkb: [
      'کاتێک دۆسیەی نەخۆش دەکەیتەوە هەموو شاشە بۆ دۆسیەکە تەرخان دەبێت.',
      'هەر ٤ بەشەکە بە یەک ڕیز لە سەرەوە دەردەکەون: بەدواداچوون، پلان و پێشکەوتن، مێژووی پزیشکی، و دارایی و دۆکیومێنت.',
      'لە مێنووی (⋯) دەتوانیت وێنەی نەخۆش بگۆڕیت، قۆناغی نوێ بکەیتەوە، ڕاپۆرت چاپ بکەیت یان گەشتی دۆسیەکە دووبارە بکەیتەوە.',
    ],
    keywords: 'mobile phone patient chart record tabs photo more menu هاتف موبايل سجل المريض ملف المريض تبويبات صورة قائمة مۆبایل دۆسیەی نەخۆش',
    tourId: 'patient_chart',
  },
  {
    id: 'mobile_bedside_soap',
    device: 'mobile',
    category: 'clinical',
    titleAr: 'توثيق الجلسات والفحوصات بجانب سرير المريض',
    titleEn: 'Bedside Quick SOAP & Clinical Charting',
    titleCkb: 'تۆمارکردنی دانیشتن لە تەنیشت نەخۆش',
    summaryAr: 'استخدام الشريط السفلي الثابت داخل جلسة SOAP، الفحوصات اللمسية، والإملاء الصوتي.',
    summaryEn: 'Use the thumb-friendly bottom SOAP bar, touch pain map/scales, and optional on-device voice dictation.',
    summaryCkb: 'شریتی خوارەوەی SOAP بە یەک دەست، نەخشەی ئازاری لەمس و نووسینی دەنگی.',
    stepsAr: [
      'عند فتح ملف مريض أو بدء جلسة SOAP يختفي الشريط العلوي والمقبض السفلي تلقائياً لتعمل على كامل الشاشة بدون أي تشتيت.',
      'داخل جلسة SOAP تثبت أزرار «حفظ المسودة» و«إنهاء واعتماد» في شريط سفلي مريح للإبهام حتى لا تضطر للتمرير للأعلى.',
      'خريطة الألم التفاعلية، مقياس الألم NPRS، وبطاقات القوة العضلية MMT والمدى الحركي ROM مصمّمة بأزرار لمس واسعة (44px+) لتسهيل الإدخال أثناء الفحص.',
      'عند تفعيل «الإملاء الصوتي المحلي» من الإعدادات ← الأقسام (في الأجهزة الداعمة)، يمكنك إملاء ملاحظات الجلسة بصوتك مباشرة.',
    ],
    stepsEn: [
      'Inside a Patient Chart or SOAP Session, top and bottom chrome hide automatically so you get full-screen clinical focus.',
      'Save Draft and Finish & Sign stay pinned at the bottom of the screen for effortless one-thumb bedside tapping.',
      'The Pain Map, NPRS selector, MMT cards, and ROM inputs use 44px+ touch targets tuned for fingers.',
      'Enable On-Device Voice Dictation in Settings -> Modules on supported devices to dictate notes hands-free.',
    ],
    stepsCkb: [
      'لە ناو دۆسیەی نەخۆش و SOAP تەواوی شاشە بۆ نووسین تەرخان دەکرێت.',
      'دوگمەکانی پاشەکەوت و تەواوکردن لە خوارەوەی شاشە جێگیر کراون بۆ بەکارهێنان بە یەک پەنجە.',
      'نەخشەی ئازار و پێوەرەکان بە دوگمەی گەورە و گونجاو بۆ لەمس دروست کراون.',
    ],
    keywords: 'mobile soap bedside touch sticky bar voice dictation pain map هاتف جلسة توثيق لمس املاء صوتي مۆبایل',
    tourId: 'session_soap',
  },
  {
    id: 'mobile_whatsapp_schedule',
    device: 'mobile',
    category: 'workflow',
    titleAr: 'التواصل المباشر عبر واتساب وإدارة المواعيد',
    titleEn: 'One-Tap WhatsApp Reminders & Touch Scheduling',
    titleCkb: 'ناردنی واتساپ و بەڕێوەبردنی نۆرە',
    summaryAr: 'إرسال تذكيرات المواعيد وبرنامج التمارين للرقم العراقي (+964) مباشرة بلمسة واحدة.',
    summaryEn: 'Send Iraqi (+964) WhatsApp appointment reminders and HEP sheets directly in one tap.',
    summaryCkb: 'ناردنی بیرخەرەوەی نۆرە و ڕاهێنان بە واتساپ بۆ ژمارەی عێراقی بە یەک لمس.',
    stepsAr: [
      'ينسّق التطبيق أرقام الهواتف العراقية تلقائياً بصيغة (+964) لفتح محادثة واتساب مباشرة مع المريض من ملفه أو من جدول المواعيد.',
      'يمكنك إرسال تذكير بالموعد القادم أو إرسال برنامج التمارين المنزلية (HEP) بنص مرتّب وجاهز بالعربية أو الإنجليزية.',
      'في شاشة «المواعيد» تنقّل بين أيام الأسبوع بلمسة واحدة من شريط الأسبوع، واحجز المواعيد المفردة أو الكورسات المتكررة باستخدام منتقي الوقت اللمسي.',
    ],
    stepsEn: [
      'Iraqi phone numbers auto-normalize to +964 so tapping WhatsApp opens the patient chat directly.',
      'Send ready bilingual appointment reminders or full Home Exercise Programs (HEP) in one tap.',
      'Use the touch Week Strip in Schedule to flip across days and book single or recurring courses effortlessly.',
    ],
    stepsCkb: [
      'ژمارە عێراقییەکان خۆکارانە بە +964 ڕێکدەخرێن بۆ کردنەوەی ڕاستەوخۆی واتساپ.',
      'بە یەک لمس بیرخەرەوەی نۆرە یان بەرنامەی ڕاهێنانی ماڵەوە بۆ نەخۆش بنێرە.',
      'لە شریتی هەفتانەدا بە خێرایی لە نێوان ڕۆژەکاندا بگەڕێ.',
    ],
    keywords: 'whatsapp 964 mobile schedule hep reminder هاتف واتساب مواعيد تذكير تمارين مۆبایل',
    tourId: 'schedule',
  },
  {
    id: 'mobile_pwa_biometrics',
    device: 'mobile',
    category: 'security',
    titleAr: 'التثبيت كتطبيق (PWA)، البصمة، وحفظ كلمة المرور',
    titleEn: 'Install as App (PWA), Biometrics & Password Manager',
    titleCkb: 'دامەزراندن وەک ئەپ (PWA)، پەنجەمۆر و وشەی نهێنی',
    summaryAr: 'ثبّت PhysioRecord على شاشتك الرئيسية ليعمل أوفلاين بالكامل وافتحه ببصمة الوجه أو الإصبع.',
    summaryEn: 'Add to Home Screen for full offline app experience, unlock/reset via Face ID or Fingerprint, and sync via iCloud/Google.',
    summaryCkb: 'لەسەر شاشەی سەرەکی دایبمەزرێنە و بە پەنجەمۆر یان Face ID بیکەرەوە.',
    stepsAr: [
      'للتثبيت على أندرويد (Chrome): افتح قائمة العيادة العلوية واضغط «تثبيت التطبيق»، أو من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية».',
      'للتثبيت على آيفون (Safari): اضغط زر المشاركة (Share) أسفل المتصفح ثم «إضافة إلى الشاشة الرئيسية» (Add to Home Screen) ليعمل كتطبيق مستقل أوفلاين.',
      'فعّل البصمة / Face ID (Passkey) من الإعدادات ← الأمان لفتح الخزينة بلمسة، وتعيين كلمة مرور جديدة بدون القديمة في حال نسيتها بعد أشهر.',
      'عند إنشاء أو تغيير كلمة المرور، اقبل حفظها في Google Password Manager أو iCloud Keychain لتتذكرها دائماً حتى لو بدّلت جهازك.',
    ],
    stepsEn: [
      'Android (Chrome): Tap "Install App" inside the top Clinic Menu, or choose "Add to Home screen" from browser menu.',
      'iPhone (Safari): Tap the Share icon -> "Add to Home Screen" for a full-screen offline clinical app.',
      'Enable Fingerprint / Face ID (Passkey) in Settings -> Security to unlock fast and reset a forgotten password safely.',
      'Accept saving your password in Google Password Manager or iCloud Keychain so you stay protected across device upgrades.',
    ],
    stepsCkb: [
      'لە ئەندرۆید لە مێنووی سەرەوە «دامەزراندن» دابگرە؛ لە ئایفۆن لە Safari «Add to Home Screen» هەڵبژێرە.',
      'پەنجەمۆر یان Face ID لە ڕێکخستنەکان ← ئاسایش چالاک بکە بۆ کردنەوەی خێرا و گۆڕینی وشەی نهێنی.',
      'پاشەکەوتکردنی وشەی نهێنی لە Google Password Manager یان iCloud Keychain پەسەند بکە.',
    ],
    keywords: 'pwa install ios iphone android face id fingerprint passkey icloud google password هاتف تثبيت تطبيق بصمة ايفون اندرويد مۆبایل',
    tourId: 'settings',
  },
  {
    id: 'mobile_kiosk_backup',
    device: 'mobile',
    category: 'modules',
    titleAr: 'وضع كشك المريض ومشاركة النسخة الاحتياطية',
    titleEn: 'Patient Kiosk Mode & Backup Sharing',
    titleCkb: 'دۆخی کیۆسکی نەخۆش و هاوبەشکردنی پاشەکەوت',
    summaryAr: 'سلّم التابلت للمريض في صالة الانتظار بأمان، واحفظ نسختك المشفّرة (.ptbackup) في مكان آمن.',
    summaryEn: 'Hand a locked intake/consent tablet to waiting patients safely, and save encrypted .ptbackup files securely.',
    summaryCkb: 'تابلێت بە قوفڵکراوی بدە بە نەخۆش بۆ پڕکردنەوەی زانیاری و پاشەکەوتەکەت بە سەلامەتی هەڵبگرە.',
    stepsAr: [
      'عند تفعيل «وضع كشك المريض» من الإعدادات ← الأقسام، يمكنك تسليم الآيباد أو التابلت للمريض ليدخل بياناته ويوقّع الموافقة المستنيرة ومقياس الألم PSFS دون أن يرى أي مريض آخر، ولا يُغلق الكشك إلا برمزك.',
      'لأخذ نسخة احتياطية: افتح قائمة العيادة العلوية ← «النسخ الاحتياطي» وصدّر ملف (.ptbackup) المشفّر ثم احفظه في مجلد الملفات أو أرسله لنفسك في تخزينك الآمن (الملف مشفّر بالكامل بكلمة مرورك).',
    ],
    stepsEn: [
      'Enable "Patient Kiosk Mode" in Settings -> Modules to let patients complete self-intake, consent signatures, and PSFS on a locked tablet with zero access to other records.',
      'To back up: open Top Clinic Menu -> Backup & Restore, export the encrypted .ptbackup file, and save it to Files or your safe personal storage.',
    ],
    stepsCkb: [
      'دۆخی کیۆسک لە ڕێکخستنەکان ← بەشەکان چالاک بکە بۆ تۆمارکردنی خۆیی نەخۆش لەسەر تابلێت بە سەلامەتی.',
      'لە مێنووی سەرەوە ← پاشەکەوت فایلی کۆدکراوی .ptbackup هەناردە بکە و لای خۆت هەڵیبگرە.',
    ],
    keywords: 'kiosk tablet ipad backup share phone mobile كشك تابلت ايباد نسخ احتياطي مشاركة هاتف مۆبایل',
    tourId: 'settings',
  },
];

/**
 * Complete 8-Chapter Therapist Playbook ("كيف أشتغل بالمنصة — كل الميزات خطوة بخطوة").
 * Explains EVERY clinical, scheduling, financial, safety, and operational feature in order.
 */
export const THERAPIST_WORKFLOW_CHAPTERS: QuickGuideTopic[] = [
  {
    id: 'workflow_01_start_day',
    device: 'all',
    category: 'workflow',
    titleAr: '1. بداية اليوم واستقبال المراجعين (وضع فردي أو عيادة)',
    titleEn: '1. Starting Your Day & Patient Intake (Solo or Clinic Mode)',
    titleCkb: '١. دەستپێکردنی ڕۆژ و پێشوازی لە نەخۆشان',
    summaryAr: 'كيف تستقبل مريضاً بـ 10 ثوانٍ، تقرأ ملخص ما قبل الجلسة، وتتحكم بطابور اليوم والخصوصية.',
    summaryEn: '10-second walk-ins, pre-session clinical briefs, daily queue actions, Solo vs Team modes, and Privacy Cover.',
    summaryCkb: 'تۆمارکردنی خێرا لە ١٠ چرکەدا، پوختەی پێش دانیشتن، نۆرەی ئەمڕۆ و داپۆشەری نهێنی.',
    stepsAr: [
      'اختر وضع العمل المناسب لك من قائمة العيادة: «معالج منفرد» (شاشة اليوم المبسطة لك مباشرة) أو «عيادة بفريق» (شاشة الاستقبال والطابور مع توزيع المراجعين على المعالجين وصلاحيات لكل موظف).',
      'عند دخول مريض جديد بدون حجز مسبق، اضغط «+ مراجع سريع» واكتب الاسم ورقم الهاتف فقط — يُنشئ النظام ملفه ويفتح حلقة علاج وجلسة SOAP جاهزة خلال ثوانٍ، كما يكشف تكرار رقم الهاتف العراقي (+964) تلقائياً.',
      'من كل صف مريض في طابور اليوم يمكنك بضغطة واحدة: قراءة ملخص ما قبل الجلسة (آخر ألم، علامات الخطر، الذمة المتبقية)، بدء الجلسة مباشرة، فتح ملفه، تحصيل دفعة، أو مراسلته عبر واتساب.',
      'عند وقوف زائر أو مراجع قرب شاشتك، فعّل «ستار الخصوصية» فوراً من قائمة العيادة (أو بالضغط على Esc مرتين) لإخفاء الأسماء والمبالغ.',
    ],
    stepsEn: [
      'Switch anytime between Solo Therapist mode (streamlined Today desk) and Clinic Team mode (Reception queue + therapist assignment + staff permissions).',
      'Use "+ Walk-In" with just Name & Phone to create a chart, care episode, and ready SOAP session in 10 seconds with automatic +964 duplicate detection.',
      'From any queue row, preview the Pre-Session Brief (last pain, red flags, balance), launch the session, open the chart, collect payment, or send a WhatsApp message.',
      'Toggle the Privacy Cover immediately whenever visitors approach your screen (from the Clinic Menu or by pressing Esc twice).',
    ],
    stepsCkb: [
      'لە نێوان دۆخی «چارەسەرکاری تاک» و «کلینیک بە تیم» بەپێی قەبارەی کارەکەت بگۆڕە.',
      'بە «+ سەردانیکەری خێرا» بە تەنها ناو و مۆبایل لە ١٠ چرکەدا دۆسیە و دانیشتن دروست بکە.',
      'لە هەر ڕیزێکی ئەمڕۆوە دانیشتن دەستپێبکە، دۆسیە بکەرەوە، پارە وەربگرە یان واتساپ بنێرە.',
      'کاتێک سەردانیکەر نزیک دەبێتەوە داپۆشەری نهێنی (Privacy Cover) دەستبەجێ چالاک بکە.',
    ],
    keywords: 'today reception walkin solo team queue privacy brief استقبال اليوم مراجع سريع طابور فردي عيادة خصوصية',
    tourId: 'today',
  },
  {
    id: 'workflow_02_scheduling',
    device: 'all',
    category: 'workflow',
    titleAr: '2. حجز المواعيد، الكورسات الأسبوعية، وقائمة الانتظار',
    titleEn: '2. Scheduling Single Visits, Weekly Courses & Waitlist',
    titleCkb: '٢. نۆرەگرتن، کۆرسی هەفتانە و لیستی چاوەڕوانی',
    summaryAr: 'جدولة جلسة مفردة أو كورس بأيام أسبوعية متكررة، إدخال المدة يدوياً، العطل، والواتساب.',
    summaryEn: 'Single or recurring weekday courses, manual duration, breaks/closed days, waitlist matching, .ics & WhatsApp.',
    summaryCkb: 'نۆرەی تاک و هەفتانە، ماوەی دەستی، پشووەکان، لیستی چاوەڕوانی و واتساپ.',
    stepsAr: [
      'افتح «المواعيد» واضغط «حجز موعد»: يمكنك حجز جلسة واحدة أو كورس أسبوعي متكرر بأيام محددة (مثلاً: أحد / ثلاثاء / خميس لـ 6 أو 12 جلسة) مع اختيار الوقت بالساعة التفاعلية وإدخال مدة الجلسة يدوياً.',
      'من قائمة خيارات الجدول (⋯) اضبط أيام العطل والإجازات وأوقات الاستراحة وفروع/مواقع العيادة، واطبع جدول اليوم أو صدّره كملف تقويم (.ics) بدون كشف أسماء المرضى.',
      'إذا ألغى مريض موعده أو تغيّب، سجّل السبب ليقترح النظام تلقائياً أنسب مراجع من «قائمة الانتظار» (Waitlist) لملء الوقت الشاغر.',
      'أرسل تذكير موعد مرتّب لواتساب المريض بنقرة واحدة باستخدام قوالب واتساب القابلة للتخصيص في الإعدادات.',
    ],
    stepsEn: [
      'Book single visits or weekly recurring weekday courses (e.g. Sun/Tue/Thu) with the interactive time picker and manual session duration entry.',
      'Configure closed dates, daily breaks, and clinic locations from Schedule Options, print daily sheets, or export privacy-safe .ics files.',
      'Log cancellation/no-show reasons so the built-in Waitlist ranks matching patients to fill freed slots.',
      'Send one-tap bilingual WhatsApp appointment reminders customized in Clinic Settings.',
    ],
    stepsCkb: [
      'نۆرەی تاک یان کۆرسی هەفتانە بە ڕۆژە دیاریکراوەکان و ماوەی دەستی تۆمار بکە.',
      'ڕۆژانی پشوو و کاتی پشوودان ڕێکبخە و خشتەی ڕۆژ چاپ بکە یان وەک .ics هەناردەی بکە.',
      'لە کاتی هەڵوەشاندنەوەدا لیستی چاوەڕوانی باشترین نەخۆشی گونجاو پێشنیار دەکات.',
      'بە یەک کرتە بیرخەرەوەی واتساپ بە قاڵبی تایبەتی کلینیکەکەت بۆ نەخۆش بنێرە.',
    ],
    keywords: 'schedule appointment recurring course weekday manual duration waitlist ics whatsapp مواعيد كورس متكرر مدة قائمة انتظار واتساب',
    tourId: 'schedule',
  },
  {
    id: 'workflow_03_patient_record',
    device: 'all',
    category: 'clinical',
    titleAr: '3. إدارة سجل المريض السريري وحلقات العلاج (التبويبات الأربعة)',
    titleEn: '3. Managing the Patient Record & Care Episodes (4 Tabs)',
    titleCkb: '٣. بەڕێوەبردنی دۆسیەی نەخۆش و قۆناغەکانی چارەسەر (٤ بەش)',
    summaryAr: 'كيف تعزل الإصابات بحلقات رعاية، تتابع التنبيهات، وتستخدم التبويبات الأربعة ودمج الملفات.',
    summaryEn: 'Isolate injuries via Care Episodes, track Red Flags & precautions, master all 4 chart tabs, and merge duplicates safely.',
    summaryCkb: 'جیاکردنەوەی پێکانەکان بە قۆناغی چارەسەر، چوار بەشەکەی دۆسیە و یەکخستنی دۆسیە دووبارەکان.',
    stepsAr: [
      '«حلقة الرعاية» (Episode of Care) تعزل كل إصابة عن الأخرى: إذا تعالج المريض سابقاً من ألم ركبة وعاد اليوم بألم كتف، افتح «حلقة رعاية جديدة» من قائمة (⋯) أعلى ملفه لتبقى فحوصات ومقاييس كل إصابة منفصلة ودقيقة.',
      'التبويب (1) المتابعة والجلسات: يعرض الشكوى والتشخيص، منحنى الألم، أزرار الدخول السريع لفحوصات MMT/ROM/العصبي/الاختبارات الخاصة، وكل جلسات الحلقة.',
      'التبويب (2) الخطة والتقدم: يجمع أحدث نتائج الفحص وخطة العلاج والأهداف، وتبويب «مقارنة التقدم» لمتابعة تحسّن الألم والمقاييس الوظيفية وطباعة تقرير التقدم.',
      'التبويب (3) السجل المرضي: توثّق فيه علامات الخطر (Red Flags)، محاذير وموانع الأجهزة، الأمراض المزمنة والعمليات والأدوية والأشعة والمرفقات المشفّرة — وأي خطر مسجّل ينبّهك تلقائياً في أعلى الملف والجلسات.',
      'التبويب (4) الملف والمالية: يعرض فواتير وذمة هذا المريض، الموافقات بالتوقيع الرقمي، بيانات الطوارئ والطبيب المحوِّل، ومركز طباعة التقارير الطبية وتصدير HL7 FHIR R4.',
      'إذا تكرر تسجيل مريض بملفين بالخطأ، استخدم «دمج مريضين» من قائمة (⋯) في دليل المرضى لدمجهما بأمان دون فقدان أي جلسة معتمدة.',
    ],
    stepsEn: [
      'Care Episodes isolate separate injuries cleanly—start a New Episode from the chart (⋯) menu whenever a patient returns for a different condition.',
      'Tab 1 (Follow-up & Sessions): active summary, pain trajectory, quick exam modals (MMT/ROM/Neuro/Special Tests), and full session history.',
      'Tab 2 (Plan & Progress): latest exam status, treatment plan, goals, optional HEP, and Progress Comparison charts & reports.',
      'Tab 3 (Medical History): permanent Red Flags checklist, contraindications/precautions (auto-alerted across the chart), chronic history, surgeries, medications, imaging, and files.',
      'Tab 4 (Financial & Docs): patient balance/invoices, digital consents, emergency/referring doctor, official printouts, and HL7 FHIR R4 export.',
      'Use Safe Merge in Patient Directory (⋯) to combine accidental duplicate charts without losing sealed sessions.',
    ],
    stepsCkb: [
      'بۆ هەر پێکانێکی نوێی هەمان نەخۆش «قۆناغێکی نوێی چارەسەر» بکەرەوە تا پشکنین و دانیشتنەکان تێکەڵ نەبن.',
      'بەشی ١ (بەدواداچوون) و بەشی ٢ (پلان و پێشکەوتن): پوختەی حاڵەت، MMT/ROM، دانیشتنەکان و بەراوردی پێوەرەکان.',
      'بەشی ٣ (مێژووی پزیشکی) و بەشی ٤ (دارایی و دۆکیومێنت): ئاڵا سوورەکان، موانع، تیشک، پسوولە و واژۆی ڕەزامەندی.',
      'بۆ دۆسیە دووبارەکان بژاردەی «یەکخستنی دۆسیەکان» لە لیستی نەخۆشەکان بەکاربهێنە بێ لەدەستدانی دانیشتنەکان.',
    ],
    keywords: 'patient chart record episode red flags tabs history merge سجل المريض ملف المريض حلقة علاج تبويبات دمج علامات خطر',
    tourId: 'patient_chart',
  },
  {
    id: 'workflow_04_soap_assessments',
    device: 'all',
    category: 'clinical',
    titleAr: '4. توثيق الجلسة (Quick SOAP)، أدوات الفحص، وسلامة الأجهزة',
    titleEn: '4. Quick SOAP Charting, Full Assessment Suite & Modality Safety',
    titleCkb: '٤. تۆمارکردنی دانیشتنی SOAP، پشکنینەکان و سەلامەتیی ئامێر',
    summaryAr: 'كل ما يحدث داخل الجلسة: النسخ الذكي، MMT الحر، ROM، الاختبارات الخاصة، المقاييس، سلامة الأجهزة، والقفل مع الملاحق.',
    summaryEn: 'Carry-forward SOAP, exam presets, Pain Map, free-text MMT, ROM, 9-region tests, outcome calculators, 12 modality safety rules, Addenda & Finish flow.',
    summaryCkb: 'گواستنەوەی زیرەکی SOAP، نەخشەی ئازار، MMT و ROM و تاقیکردنەوە تایبەتەکان، پێوەرەکان، یاسای سەلامەتی و پاشکۆ.',
    stepsAr: [
      'اضغط «+ جلسة جديدة» من ملف المريض لفتح Quick SOAP: يبدأ المؤقت تلقائياً، وتُنسخ ملاحظات الجلسة السابقة بلون هادئ لتعديل المستجدات فقط مع حفظ مشفّر مستمر (Ctrl+S).',
      'اضغط «+ إضافة فحص أو تدخل» داخل الجلسة للوصول لكل أدوات العلاج الطبيعي: قوالب الفحص الإقليمي (ركبة/كتف/ظهر/رقبة...)، خريطة الألم التفاعلية (أمامي/خلفي)، بطاقات MMT الحرة مع زر (+) للإضافة، قياسات ROM النظيفة، الاختبارات الخاصة لـ 9 مفاصل، الفحص العصبي وجدول ASIA، القوام والمشية، والعلامات الحيوية.',
      'استخدم حاسبات المقاييس الوظيفية المدمجة (ODI، NDI، QuickDASH، SPADI، LEFS) والاختبارات الوظيفية المفتوحة (NPRS، PSFS، TUG، 30s-CST، 5xSTS) أو اصنع مقياسك الخاص في «منشئ المقاييس المخصصة».',
      'عند تسجيل الأجهزة الكهربائية والفيزيائية (TENS، NMES، IFC، Ultrasound، SWD، حرارة، برودة، شد، إبر جافة)، تطابق «قواعد سلامة الأجهزة الـ 12» (عند تفعيلها) كل جهاز مع محاذير المريض وتنبّهك فوراً عند وجود تعارض.',
      'عند انتهاء الجلسة اضغط «إنهاء واعتماد»: يُقفل سجل SOAP نهائياً للأمانة السريرية، وتحصّل الدفعة المالية وتحجز الموعد القادم في خطوة واحدة (مع زر تراجع لمدة 8 ثوانٍ). ولأي تصحيح أو إضافة بعد القفل استخدم «إضافة ملحق سريري» (Addendum) المؤرخ.',
    ],
    stepsEn: [
      'Start "+ New Session" for Quick SOAP: automatic timer, highlighted carry-forward from last visit, and continuous encrypted auto-save (Ctrl+S).',
      'Tap "+ Add Exam or Intervention" for regional presets, interactive front/back Pain Map, free-text MMT cards (+), clean ROM inputs, 9-region Special Tests, Neuro/ASIA table, Gait/Posture, and Vitals.',
      'Score outcome calculators (ODI, NDI, QuickDASH, SPADI, LEFS), open functional tests (NPRS, PSFS, TUG, 30s-CST, 5xSTS), or build your own in Custom Widget Studio.',
      'Logging physical agents (TENS, NMES, IFC, Ultrasound, SWD, heat, cold, traction, dry needling) checks the 12 Modality Safety Rules against patient precautions automatically when enabled.',
      'Click "Finish & Sign" to seal the SOAP note permanently (append-only Addenda remain available), collect payment, and rebook the next visit in one unified flow with an 8-second Undo toast.',
    ],
    stepsCkb: [
      'بە «+ دانیشتنی نوێ» کاتژمێر و گواستنەوەی زانیاریی پێشوو و پاشەکەوتی خۆکار (Ctrl+S) دەستپێدەکات.',
      'لە «+ زیادکردنی پشکنین یان چارەسەر» نەخشەی ئازار، MMT و ROM، تاقیکردنەوەی ٩ جومگە و پێوەرەکان بەردەستن.',
      'یاساکانی سەلامەتیی ئامێر (١٢ یاسا) خۆکارانە مەترسیی ئامێرە کارەباییەکان لەگەڵ موانعی نەخۆش دەپشکنن.',
      'لە کۆتاییدا بە «تەواوکردن و پەسەندکردن» تۆمار قوفڵ دەکرێت (پاشکۆ بەردەستە) و پارە وەردەگیرێت و نۆرەی داهاتوو دادەنرێت.',
    ],
    keywords: 'soap session mmt rom special tests asia pain map odi ndi quickdash spadi lefs psfs tug modality safety tens ultrasound addendum جلسة فحص قوة مدى حركي اختبارات مقايس اجهزة كهربائية سلامة ملحق',
    tourId: 'session_soap',
  },
  {
    id: 'workflow_05_hep_photos_consents',
    device: 'all',
    category: 'modules',
    titleAr: '5. التمارين المنزلية (HEP)، قياس القوام، والموافقات الرقمية',
    titleEn: '5. Home Exercises (HEP), Posture Measurement & Digital Consents',
    titleCkb: '٥. ڕاهێنانی ماڵەوە (HEP)، پێوانی پۆستەر و واژۆی ڕەزامەندی',
    summaryAr: 'كيفية تفعيل واستخدام مكتبة التمارين، مقارنة صور القوام قبل/بعد، وتوقيع الموافقات المستنيرة.',
    summaryEn: 'Activate and use the HEP builder, encrypted imaging/posture angle comparison studio, and canvas consent signatures.',
    summaryCkb: 'چالاککردن و بەکارهێنانی کتێبخانەی ڕاهێنان، پێوانی گۆشەی وێنەی پۆستەر و واژۆی ئەلیکترۆنی.',
    stepsAr: [
      'لتبقى الواجهة بسيطة، هذه الأدوات مخفية افتراضياً وتُفعّل متى احتجتها من «الإعدادات ← الأقسام» (وإخفاؤها لاحقاً لا يحذف أي بيانات).',
      'مكتبة التمارين (HEP): صفِّ التمارين حسب المفصل والهدف، أضفها لبرنامج المريض وعدّل المجموعات والتكرارات، ثم اطبعها بشعار عيادتك أو أرسلها فوراً عبر واتساب.',
      'المرفقات ومقارنة القوام: من تبويب «السجل المرضي» ارفع تقارير الأشعة والرنين أو صور القوام (مشفّرة بالكامل محلياً)، واستخدم «استوديو قياس الصور» لرسم خطوط وزوايا القوام والمقارنة قبل وبعد العلاج.',
      'الموافقات المستنيرة بالتوقيع الرقمي: من تبويب «الملف والمالية» (أو عبر كشك التابلت) يوقّع المريض بأصبعه أو القلم على موافقة العلاج الطبيعي وتُحفظ مشفّرة ومؤرخة داخل ملفه.',
    ],
    stepsEn: [
      'All optional tools stay neatly hidden until enabled in Settings -> Modules (disabling never deletes saved data).',
      'Exercise Library (HEP): filter by joint and goal, customize sets/reps/holds, print branded A4 handouts, or send directly via WhatsApp.',
      'Encrypted Attachments & Posture Studio: upload imaging reports or posture photos inside Medical History and draw clinical angles/lines for before-and-after comparisons.',
      'Digital Informed Consents: capture touch/stylus patient signatures inside Financial & Docs (or Tablet Kiosk), stored encrypted in the chart.',
    ],
    stepsCkb: [
      'ئەم بەشانە لە «ڕێکخستنەکان ← بەشەکان» چالاک دەکرێن بێ هیچ قەرەباڵغییەک لە ڕووکاردا.',
      'بەرنامەی ڕاهێنان (HEP) بەپێی جومگە دروست بکە و بە لۆگۆی کلینیک چاپی بکە یان بە واتساپ بینێرە.',
      'وێنەی تیشک و پۆستەر بە کۆدکراوی بار بکە و گۆشەکانی پێش و دوای چارەسەر لە ستۆدیۆی وێنەدا بەراورد بکە.',
      'واژۆی ئەلیکترۆنیی ڕەزامەندیی نەخۆش بە پەنجە یان قەڵەم تۆمار بکە و لە دۆسیەکەدا بە کۆدکراوی بیپارێزە.',
    ],
    keywords: 'hep exercise posture photo angle measurement consent signature imaging تمارين منزلية قوام صور اشعة زوايا موافقة توقيع رقمي',
    tourId: 'settings',
  },
  {
    id: 'workflow_06_finance_billing',
    device: 'all',
    category: 'finance',
    titleAr: '6. الحسابات العراقية، الأقساط، المصاريف، وإغلاق الصندوق',
    titleEn: '6. Iraqi Invoicing, Installments, Expenses & Daily Z-Report',
    titleCkb: '٦. ژمێریاری، قیستەکان، خەرجییەکان و داخستنی سندووق',
    summaryAr: 'إصدار الفواتير بدون أسعار مفروضة، طرق الدفع العراقية، الأقساط والديون، الإشعار الدائن، وتقرير الصندوق.',
    summaryEn: 'Blank-default invoices (Session/Course/Exam), Cash/ZainCash/QiCard/Other, installments & debt aging, Credit Notes, and Z-Report.',
    summaryCkb: 'پسوولە بێ نرخی پێشوەختە، نەقد/ZainCash/QiCard، قیست و قەرز، ئاگادارنامەی کرێدیت و ڕاپۆرتی سندووق.',
    stepsAr: [
      'إصدار فاتورة (جلسة مفردة / كورس / فحص): تبدأ كل الحقول المالية فارغة تماماً لتحدد تسعيرتك والخصم بحرية، مع دعم نقداً، ZainCash، QiCard، أو وسيلة «أخرى» بنص مخصّص، وتظهر العملة بعد الرقم (25,000 د.ع).',
      'الأمانة المحاسبية (لا حذف عشوائي): الفواتير المرقّمة تسلسلياً لا تُحذف نهائياً؛ بل يُصدر «إشعار دائن» (Credit Note) أو «عكس دفعة» لتبقى حساباتك دقيقة وخالية من الثغرات.',
      'المصاريف والأقساط: سجّل مصاريف العيادة اليومية أو المصاريف الشهرية المتكررة (إيجار، كهرباء، مولدة)، وتابع خطط الأقساط وأعمار الذمم (30/60/90 يوم) بنقرة واحدة من شريط الملخص.',
      'إغلاق نهاية اليوم (Z-Report): في نهاية الدوام افتح «إغلاق اليوم» (من شاشة اليوم أو الحسابات) لمطابقة الصندوق حسب كل طريقة دفع وطباعة تقرير يومي أو شهري منظم.',
    ],
    stepsEn: [
      'Issue Session, Course, or Exam invoices starting from blank amounts using Cash, ZainCash, QiCard, or Other—currency renders cleanly after the number (e.g. 25,000 IQD).',
      'Audit-safe ledger: numbered invoices cannot be silently deleted; use Credit Notes or Payment Reversals to preserve gap-free financial numbering.',
      'Log daily and recurring monthly expenses (rent, generator, supplies), and monitor installment plans & 30/60/90-day debt aging from the top balance strip.',
      'Run End-of-Day Closing (Z-Report) to reconcile every payment method and print daily or monthly financial summaries.',
    ],
    stepsCkb: [
      'پسوولەی دانیشتن/کۆرس/پشکنین بە بەتاڵی دەستپێدەکات و پشتگیری نەقد، ZainCash، QiCard و شێوازی تر دەکات.',
      'بۆ ڕاستکردنەوەی پسوولە ئاگادارنامەی کرێدیت یان گەڕاندنەوەی پارە بەکاربهێنە بێ تێکدانی زنجیرەی ژمارەکان.',
      'خەرجی ڕۆژانە و مانگانەی دووبارە (کرێ، کارەبا، موەلیدە) و قیست و قەرزی ٣٠/٦٠/٩٠ ڕۆژ تۆمار بکە.',
      'لە کۆتایی ڕۆژدا ڕاپۆرتی داخستنی سندووق (Z-Report) بەپێی هەر شێوازێکی پارەدان چاپ بکە.',
    ],
    keywords: 'finance invoice iqd zaincash qicard expense recurring installment aging credit note z-report فاتورة حسابات اقساط ديون مصاريف اشعار دائن اغلاق صندوق',
    tourId: 'finance',
  },
  {
    id: 'workflow_07_retention_analytics_kiosk',
    device: 'all',
    category: 'modules',
    titleAr: '7. الإحالات الطبية، الاحتفاظ بالمرضى، التحليلات، وكشك التابلت',
    titleEn: '7. Doctor Referrals, Patient Retention, Local Analytics & Kiosk',
    titleCkb: '٧. ناردنی پزیشک، بەدواداچوونی نەخۆش، شیکاری و کیۆسکی تابلێت',
    summaryAr: 'تنمية عيادتك بمتابعة الأطباء المحوّلين والمرضى المتغيبين وتحسّن النتائج (MCID) واستقبال التابلت.',
    summaryEn: 'Track referring doctors & report-back letters, missed visits, 4w/12w post-discharge follow-ups, MCID analytics, and locked waiting-room Kiosk.',
    summaryCkb: 'پەیوەندی لەگەڵ پزیشکان، بەدواداچوونی دوای دەرچوون، شیکاریی ناوخۆیی و کیۆسکی چاوەڕوانی.',
    stepsAr: [
      'الإحالات وتقارير الرد للطبيب: اربط المريض بالطبيب المحوِّل في ملفه، واطبع له «تقرير متابعة للطبيب المحوِّل» من أعلى الملف لتعزيز الثقة المهنية واستمرار الإحالات.',
      'قوائم الاحتفاظ والمتابعة (من قائمة أدوات اليوم): تذكّرك تلقائياً بالمرضى الذين انقطعوا عن جلساتهم، أو الذين حان موعد متابعتهم بعد التخريج بـ 4 و12 أسبوعاً لتسجيل NPRS/PSFS ومراسلتهم.',
      'التحليلات المحلية (100% أوفلاين): عند تفعيلها تعرض مؤشرات الأداء السريري والمالي (نسبة الحضور، متوسط الجلسات، تحسّن المقاييس MCID، وصافي التدفق النقدي) دون خروج أي رقم للإنترنت.',
      'كشك المريض على التابلت: سلّم التابلت مقفلاً للمريض في صالة الانتظار ليدخل بياناته ويوقّع الموافقة ويسجّل مقياس PSFS بأمان تام دون إمكانية رؤية أي مريض آخر.',
    ],
    stepsEn: [
      'Referrals & Doctor Report-Back: link referring physicians on the chart and print polished progress letters back to them.',
      'Retention Action Lists (Today -> More): surfaces missed-visit drop-offs and due 4-week / 12-week post-discharge follow-ups.',
      'Local Analytics (100% offline): computes attendance, caseload, outcome MCID improvement, and net cashflow strictly on-device.',
      'Tablet Patient Kiosk: hand a locked tablet to waiting patients for self-intake, digital consent, and PSFS with zero access to other records.',
    ],
    stepsCkb: [
      'پزیشکی نێرەر بە دۆسیەی نەخۆشەوە ببەستەرەوە و ڕاپۆرتی بەدواداچوونی پیشەیی بۆ چاپ بکە.',
      'لە لیستی بەدواداچوون نەخۆشە دابڕاوەکان و کاتی بەدواداچوونی ٤ و ١٢ هەفتەی دوای دەرچوون ببینە.',
      'شیکاریی ناوخۆیی (MCID و داهات و ڕێژەی ئامادەبوون) ١٠٠٪ لەسەر ئامێرەکەت هەژمار دەکرێت.',
      'دۆخی کیۆسکی تابلێت بە قوفڵکراوی بدە بە نەخۆش بۆ تۆمارکردنی زانیاری و واژۆی خۆیی لە هۆڵی چاوەڕوانی.',
    ],
    keywords: 'referrals doctor retention follow up 4w 12w mcid analytics kiosk tablet احالات طبيب احتفاظ متابعة تخريج تحليلات كشك تابلت',
    tourId: 'settings',
  },
  {
    id: 'workflow_08_security_backup_import',
    device: 'all',
    category: 'security',
    titleAr: '8. الأمان، منع نسيان كلمة المرور، النسخ الاحتياطي، والاستيراد',
    titleEn: '8. Security, Anti-Lockout Password Layers, Backups & Import/Export',
    titleCkb: '٨. ئاسایش، پاراستن لە بیرچوونەوەی وشەی نهێنی، پاشەکەوت و هاوردەکردن',
    summaryAr: 'طبقات حماية كلمة المرور الأربع، النسخ المشفّر .ptbackup، سلة المهملات، واستيراد مرضى Excel/CSV.',
    summaryEn: '4 anti-lockout layers (Passkey reset, spaced reminders, OS Password Manager, Recovery Key), .ptbackup replace/merge, Trash & Excel/CSV import.',
    summaryCkb: '٤ چینی پاراستنی وشەی نهێنی، کۆپی یەدەگی .ptbackup، سەلەی سڕاوەکان و هاوردەکردنی Excel/CSV.',
    stepsAr: [
      '4 طبقات أمان تمنع ضياع بياناتك عند نسيان كلمة المرور (من الإعدادات ← الأمان): (1) البصمة/Passkey لفتح القفل وتعيين كلمة مرور جديدة بدون القديمة، (2) التذكير الذكي المتباعد لتثبيت الكلمة بذاكرتك، (3) الحفظ التلقائي بمدير كلمات مرور Google / iCloud، و(4) مفتاح الطوارئ (32 خانة) مع تمرين التحقق الدوري.',
      'النسخ الاحتياطي المشفّر (.ptbackup): صدّر نسخة كاملة لعيادتك أسبوعياً (أو يومياً) على فلاش USB أو مجلد آمن؛ وعند الاستعادة اختر «الاستبدال الكامل» أو «الدمج الذكي» الذي يحافظ على الجلسات المعتمدة.',
      'سلة المهملات وصحة البيانات: من قائمة أدوات اليوم يمكنك فحص سلامة سجلاتك واسترجاع أي مريض حُذف خطأً خلال فترة الأمان، كما يمكنك تعديل مؤقت القفل التلقائي (بما فيه خيار «أبداً»).',
      'استيراد وتصدير البيانات: استورد قوائم مرضاك الحاليين من ملفات Excel (XLSX) أو CSV أوفلاين بالكامل عبر معالج الاستيراد، وصدّر تقارير CSV أو ملفات طبية قياسية HL7 FHIR R4 متى شئت.',
    ],
    stepsEn: [
      '4 Anti-Lockout Layers (Settings -> Security): (1) Biometrics/Passkey unlock & password reset without old password, (2) spaced-repetition reminders, (3) Google/iCloud OS Password Manager save, and (4) 32-char Recovery Key + drill.',
      'Encrypted .ptbackup Archives: export routinely to USB/external storage; restore with preview via Full Replace or Smart Merge (plus automatic emergency snapshot).',
      'Data Health & Trash: inspect vault integrity, recover accidentally deleted charts, and configure Auto-Lock timing (including "Never").',
      'Offline Import/Export: import existing patient lists from Excel (XLSX) or CSV offline, and export CSV ledgers or standard HL7 FHIR R4 clinical bundles.',
    ],
    stepsCkb: [
      '٤ چینی پاراستن لە ڕێکخستنەکان ← ئاسایش: پەنجەمۆر/Passkey، بیرخەرەوەی زیرەک، بەڕێوەبەری وشەی نهێنیی سیستەم، و کلیلی فریاگوزاری.',
      'بە بەردەوامی کۆپی یەدەگی کۆدکراوی .ptbackup هەناردە بکە و بە شێوازی گۆڕینی تەواو یان یەکخستنی زیرەک بیگەڕێنەرەوە.',
      'تەندروستیی داتا و سەلەی سڕاوەکان بۆ گەڕاندنەوەی دۆسیەی سڕاوە و کاتی قوفڵی خۆکار (تا «هەرگیز») ڕێکبخە.',
      'لیستی نەخۆشەکان لە Excel (XLSX) یان CSV بە ئۆفلاین هاوردە بکە و تۆمارەکان بە FHIR R4 هەناردە بکە.',
    ],
    keywords: 'security password forgot passkey biometric reminder recovery backup ptbackup restore merge trash xlsx csv fhir أمان نسيت كلمة المرور بصمة نسخ احتياطي استعادة استيراد اكسل سلة مهملات',
    tourId: 'backup_restore',
  },
];

/** Combined catalog across Workflow Playbook, Desktop & Mobile guides for instant global search. */
export const QUICK_GUIDE_TOPICS: QuickGuideTopic[] = [
  ...THERAPIST_WORKFLOW_CHAPTERS,
  ...DESKTOP_GUIDE_TOPICS,
  ...MOBILE_GUIDE_TOPICS,
];
