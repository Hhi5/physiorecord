import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Database,
  CheckCircle2,
  Shield,
  Tag,
  Calendar,
  RefreshCw,
  GitBranch,
  ExternalLink,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { GeometricHeaderBackdrop } from '../ui/Dialog';
import {
  APP_SEMVER_VERSION,
  BUNDLED_CHANGELOG_RELEASES,
  DEXIE_MIGRATION_GUIDE_V1_TO_V11,
} from '../../utils/settingsOnboardingPhaseF';
import {
  OFFICIAL_GITHUB_REPO,
  OFFICIAL_GITHUB_REPO_URL,
  compareSemverVersions,
  extractReleaseNotesLines,
  loadCachedGithubReleases,
  saveCachedGithubReleases,
  type SyncedGithubReleaseItem,
} from '../../utils/updateSafety';
import {
  fetchOfficialGitHubReleases,
  openSafeExternalUrl,
} from '../../platform/nativeBridge';

const CHANGELOG_CKB: Record<
  string,
  { tagCkb: string; titleCkb: string; highlightsCkb: string[] }
> = {
  '1.1.0': {
    tagCkb: 'وەشانی ئێستا · قۆناغە زیادکراوەکانی کلینیکی و عێراقی (A–F)',
    titleCkb:
      'خۆڕاگری بڕانی کارەبا، خێرایی تۆمارکردن، کارگێڕی کلینیک لە عێراق، کوالێتی داتا و هاوبەشکردنی ناوخۆیی',
    highlightsCkb: [
      'قۆناغی A (خێرایی و پاشەکەوتی ڕەشنووس): پاشەکەوتکردنی خۆکاری دەستبەجێی ڕەشنووسە نهێنیکراوەکان لە IndexedDB (Dexie v10) هەر ٢ چرکە جارێک و لە کاتی شاردنەوەی تابدا بۆ ڕێگری لە ونبوونی هەر وشەیەک لە کاتی بڕانی کارەبا، لەگەڵ لیستی خێرا بۆ هەزاران تۆمار.',
      'قۆناغی B (خێرایی و سەلامەتی کلینیکی): قاڵبی پشکنینی یەک-کرتە بۆ ٩ ناوچەی لەش، لیستی کێشە و ئامانجەکان بە هەژمارکردنی MCID، ئاگادارکەرەوەی دووبارە هەڵسەنگاندن، پشکنینی سەلامەتی ئامێرەکان (TENS/US/Laser...) بە سەرچاوەوە، نیشانە زیندووەکان و پاراستنی منداڵان.',
      'قۆناغی C (کارگێڕی کلینیکەکان لە عێراق): پشتگیری سەردانی ماڵەوە بە ناونیشانی عێراقی و کرێی هاتوچۆ، فرە-لقی کلینیک، ڕۆژانی پشوو و کاتی پشوو و بەرواری کۆچی، پلانی قیست و قەرزی ٣٠/٦٠/٩٠ ڕۆژە، خەرجییە دووبارەکان (موەلیدە/کرێ)، پزیشکانی ڕەوانەکار و لیستی بەدواداچوون.',
      'قۆناغی D (کوالێتی داتا و هاوردەکردن): دۆزەرەوەی دووبارەبوونەوەی نەخۆش و یەکگرتنەوەی سەلامەت بە وێنەی پاشگەزبوونەوەی نهێنیکراو، ڕێنیشاندەری هاوردەکردنی CSV/XLSX بە تاقیکردنەوەی پێشوەخت و گەڕانەوە، سەبەتەی سڕاوەکان بۆ ٣٠ ڕۆژ، شاشەی تەندروستی داتا و فەرهەنگی دووزمانە.',
      'قۆناغی E (هاوبەشکردن و هەناردەکردن): هاوبەشکردنی ڕاپۆرت و پسوڵە لە ڕێگەی سیستەمی ئامێر یان واتسئاپ (+964)، هەناردەکردنی کاتەکان بۆ ڕۆژژمێری مۆبایل (.ics) بە بژاردەی نهێنیپارێزی، چاپکردنی خشتەی سبەی و کارتی سەردانی نەخۆش، و ئامرازی پێوانەی گۆشە و هێڵی شاقوڵ لەسەر وێنە.',
      'قۆناغی F و Dexie v11: گەڕانی خێرا لە ڕێکخستنەکان بە دۆخی سادە/پێشکەوتوو، ڕێبەری Dexie (v1–v11)، تۆماری سڕینەوەی نهێنیکراو (deletionTombstones) بۆ ڕێگری لە گەڕانەوەی تۆمارە سڕاوەکان، و پاراستنی پێشوەخت لە کردنەوەی بنکەی نوێتر بە وەشانی کۆنتر.',
    ],
  },
  '1.0.0': {
    tagCkb: 'وەشانی بنەڕەتی یەکەم (Phases 0–7)',
    titleCkb:
      'خەزێنەی نهێنیکراوی ناوخۆیی (AES-256-GCM)، پشتگیری عەرەبی و کوردی و ئینگلیزی، و تایبەتمەندییەکانی کلینیکەکانی عێراق',
    highlightsCkb: [
      'نهێنیکردنی تەواوی ناوخۆیی (AES-256-GCM + PBKDF2-SHA256 بە 600,000 خول + HKDF-SHA256 بۆ هەر تۆمارێک) بێ هیچ سێرڤەرێکی دەرەکی یان شوێنپێهەڵگرتن.',
      'پشتگیری دانانی کاتی هاوکات بۆ زیاتر لە نەخۆشێک لە هەمان کاتدا، زمانی کوردی سۆرانی (کوردی)، و تایبەتمەندکردنی فۆنت و نیشاندان.',
      'پسوڵەکردن بە دیناری عێراقی (25,000 د.ع لە دوای ژمارە) بە نرخی سەرەتایی بەتاڵ و شێوازەکانی پارەدانی عێراقی (کاش، زەین کاش، کی کارد، هیتر).',
      'پەنجەرەی پیشاندانی خێرای پەڕاوی نەخۆش، هاوپێچ و ڕاپۆرتی فرە-تیشک و ڕەنین، و نەخشەی جەستە بە جۆر و ڕەنگی ئازاری دەستکرد.',
    ],
  },
};

const DEXIE_MIGRATION_CKB: Record<number, { summaryCkb: string; upgradeBehaviorCkb: string }> = {
  1: {
    summaryCkb:
      'بنکەی سەرەکی کلینیکی نهێنیکراو بۆ نەخۆشەکان، خولە چارەسەرییەکان، دانیشتنەکان، و تێبینییەکانی SOAP.',
    upgradeBehaviorCkb: 'خشتە سەرەکییەکان و زانیاری نهێنیکردنی پێچراو دروست دەکات.',
  },
  2: {
    summaryCkb: 'زیادکردنی پێڕستی ئەرشیفکردنی سەلامەت بۆ نەخۆشەکان و پاراستنی گونجاوی داتای خەزێنە.',
    upgradeBehaviorCkb: 'نوێکردنەوەی بێ زیان کە هەموو تۆمارە نهێنیکراوەکانی v1 دەپارێزێت.',
  },
  3: {
    summaryCkb: 'زیادکردنی خشتەی پاشکۆ پزیشکییە نەسڕاوەکان (Append-Only Clinical Addenda).',
    upgradeBehaviorCkb:
      'بە تەواوی ڕێگری دەکات لە سڕینەوەی هەر دانیشتن یان نەخۆشێک کە پاشکۆی پزیشکی واژۆکراوی هەبێت.',
  },
  4: {
    summaryCkb: 'ژمێرەری ڕیزبەندی سەربەخۆی دانیشتنەکان بۆ هەر خولێک بۆ ڕێگری لە دووبارەبوونەوەی ژمارەی دانیشتن.',
    upgradeBehaviorCkb:
      'لە کاتی گەڕاندنەوەی پاشەکەوت بە شێوەی خۆکار لە بەرزترین ژمارەی دانیشتنەوە دروست دەکرێتەوە.',
  },
  5: {
    summaryCkb:
      'زیادکردنی خشتەکانی بەڕێوەبردنی کلینیک، کاتەکان، پسوڵەکان، تۆماری وردبینی و هەڵسەنگاندنی کلینیکی.',
    upgradeBehaviorCkb:
      'گواستنەوەی داتا کۆنەکان لە localStorage بۆ IndexedDBی نهێنیکراو بە پشکنینی دروستی.',
  },
  6: {
    summaryCkb: 'زیادکردنی پێڕستی ناسنامەی نەخۆش/خول لەسەر لیستی چاوەڕوانی و تۆماری وردبینی بۆ گەڕانی خێرا.',
    upgradeBehaviorCkb: 'نوێکردنەوەی پێڕستەکان بە تەنها؛ داتا نهێنیکراوەکان وەک خۆیان دەمێننەوە.',
  },
  7: {
    summaryCkb:
      'زیادکردنی ڕێکخستنی کلینیکی نهێنیکراو، خشتەی دووبارەبووەوە، دەرمانەکان و پێوەرە تایبەتەکان.',
    upgradeBehaviorCkb: 'هەموو ڕێکخستنەکانی کلینیک بە نهێنیکراوی لەناو clinicSettings هەڵدەگرێت.',
  },
  8: {
    summaryCkb: 'زیادکردنی خشتەی ڕەزامەندی ئاگادارانەی واژۆکراو و ڕاپۆرتی داخستنی سندوقی ڕۆژانە (Z-Reports).',
    upgradeBehaviorCkb: 'بە شێوەی خۆکار لە پاشەکەوتە گواستراوەکانی .ptbackup تۆمار دەکرێت.',
  },
  9: {
    summaryCkb: 'زیادکردنی هاوپێچە کلینیکییە نهێنیکراوەکان، وێنەی شێوازی لەش و قاڵبی تێبینییە کلینیکییەکان (CC0).',
    upgradeBehaviorCkb: 'پشتگیری شێوازی .ptbackup V3.0ی پەستێنراو و بەش بەش کراو دەکات بۆ فایلی گەورە.',
  },
  10: {
    summaryCkb:
      'خشتەی ڕەشنووسە نهێنیکراوەکانی خۆڕاگر بەرامبەر بڕانی کارەبا یان داخستنی لەناکاوی وێبگەڕ (Phase A).',
    upgradeBehaviorCkb:
      'تایبەتە بە ئامێرەکە (لە پاشەکەوتی دەرەکی جیا دەکرێتەوە) و لەگەڵ کردنەوەی خەزێنە خۆکارانە دەگەڕێنرێتەوە.',
  },
  11: {
    summaryCkb:
      'خشتەی شۆهیدەکانی سڕینەوەی نهێنیکراو (deletionTombstones) بۆ ڕێگری لە گەڕانەوەی تۆمارە سڕاوەکان لە کاتی یەکگرتنەوەی پاشەکەوت یان هاوکاتکردندا.',
    upgradeBehaviorCkb:
      'لە پاشەکەوتی .ptbackup V3.0 و هاوکاتکردندا گواستراوەیە؛ لەگەڵ پشکنینی پێشوەختی دابەزاندنی وەشان و بەڕێوەبردنی فرە-تاب (versionchange/blocked).',
  },
};

export interface WhatsNewChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'changelog' | 'migrations';
}

export const WhatsNewChangelogModal: React.FC<WhatsNewChangelogModalProps> = ({
  isOpen,
  onClose,
  initialView = 'changelog',
}) => {
  const { isRtl, bi } = useLanguage();
  const [view, setView] = useState<'changelog' | 'migrations'>(initialView);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedReleases, setSyncedReleases] = useState<SyncedGithubReleaseItem[]>(
    () => loadCachedGithubReleases()?.releases ?? []
  );

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      const cached = loadCachedGithubReleases();
      if (cached?.releases) {
        setSyncedReleases(cached.releases);
      }
      void ClinicOperationsService.setLastSeenChangelogVersionAsync(APP_SEMVER_VERSION).catch(
        () => undefined
      );
    }
  }, [isOpen, initialView]);

  const handleSyncReleases = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetchOfficialGitHubReleases();
      if (!res.ok) {
        setSyncError(
          res.error ||
            bi(
              'تعذر الاتصال بمستودع GitHub حالياً.',
              'Could not sync releases from GitHub right now.'
            )
        );
        return;
      }
      if (res.releases.length > 0) {
        const cached = saveCachedGithubReleases(res.releases);
        setSyncedReleases(cached.releases);
      }
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="whats-new-modal"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border border-card-line rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative overflow-hidden px-5 pt-3 sm:pt-4 pb-4 bg-primary text-primary-foreground flex flex-col gap-2.5 shrink-0 shadow-xs">
          <GeometricHeaderBackdrop />
          <div className="relative z-10 w-10 h-1 bg-primary-foreground/40 rounded-full mx-auto sm:hidden shrink-0" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 rounded-xl bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 flex items-center justify-center shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-primary-foreground">
                    {bi(
                      'ما الجديد ودليل ترقيات قاعدة البيانات',
                      "What's New & Database Migration Guide",
                      'چی نوێ هەیە و ڕێبەری نوێکردنەوەی بنکەی داتا'
                    )}
                  </h2>
                  <span
                    data-testid="whats-new-semver-badge"
                    dir="ltr"
                    className="px-2 py-0.5 rounded-md bg-primary-foreground/15 text-primary-foreground border border-primary-foreground/25 text-xs font-mono font-bold"
                  >
                    v{APP_SEMVER_VERSION} · SemVer
                  </span>
                </div>
                <p className="text-xs text-primary-foreground/85 mt-0.5">
                  {bi(
                    'سجل التحديثات المدمج مع مزامنة إصدارات مستودع GitHub وسلسلة ترقيات الخزنة (Dexie v1–v11)',
                    'Bundled & GitHub-synced release notes plus append-only Dexie v1–v11 schema lineage',
                    'تۆماری نوێکارییەکان و هاوکاتکردن لەگەڵ گیتهەب و ڕێڕەوی نوێکردنەوەی Dexie (v1–v11)'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="whats-new-close-btn"
              onClick={onClose}
              aria-label={bi('إغلاق', 'Close', 'داخستن')}
              className="size-9 !p-0 rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 text-primary-foreground inline-flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-5 py-2.5 border-b border-card-divider bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="whats-new-tab-changelog"
              onClick={() => setView('changelog')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                view === 'changelog'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
              }`}
            >
              <Sparkles className="size-3.5" />
              <span>
                {bi(
                  'سجل التحديثات (CHANGELOG)',
                  'Release Notes (CHANGELOG)',
                  'تۆماری گۆڕانکارییەکان'
                )}
              </span>
            </button>

            <button
              type="button"
              data-testid="whats-new-tab-migrations"
              onClick={() => setView('migrations')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                view === 'migrations'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
              }`}
            >
              <Database className="size-3.5" />
              <span>
                {bi(
                  'دليل ترقية Dexie (v1–v11)',
                  'Dexie Migration Guide (v1–v11)',
                  'ڕێبەری نوێکردنەوەی Dexie (v1–v11)'
                )}
              </span>
            </button>
          </div>

          {view === 'changelog' && (
            <button
              type="button"
              data-testid="whats-new-sync-github-btn"
              disabled={syncing}
              onClick={handleSyncReleases}
              className="px-3 py-2 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 text-primary ${syncing ? 'animate-spin' : ''}`} />
              <span>
                {syncing
                  ? bi('جاري المزامنة...', 'Syncing...', 'هاوکاتکردن...')
                  : bi('مزامنة مع GitHub', 'Sync GitHub', 'هاوکاتکردن')}
              </span>
            </button>
          )}
        </div>

        {/* Body */}
        <div tabIndex={0} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4">
          {view === 'changelog' && (
            <div className="space-y-4">
              {/* Official Repository Bar */}
              <div className="px-3.5 py-2.5 rounded-xl bg-surface border border-line-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <GitBranch className="size-3.5 text-primary shrink-0" />
                  <span className="font-semibold text-foreground">
                    {bi('مستودع المشروع:', 'GitHub Repository:', 'کۆگای گیتهەب:')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openSafeExternalUrl(OFFICIAL_GITHUB_REPO_URL)}
                    className="font-mono font-bold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer truncate"
                    dir="ltr"
                  >
                    <span>github.com/{OFFICIAL_GITHUB_REPO}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </button>
                </div>
                <span className="text-muted-foreground-1">
                  {bi(
                    'اضغط «مزامنة مع GitHub» لجلب ملاحظات الإصدارات مباشرة',
                    'Click "Sync GitHub" to pull live release notes',
                    'بۆ هێنانی تێبینی وەشانەکان هاوکاتکردن دابگرە'
                  )}
                </span>
              </div>

              {syncError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-400 text-xs font-semibold">
                  {syncError}
                </div>
              )}

              {/* Synced Live GitHub Releases */}
              {syncedReleases.length > 0 && (
                <div data-testid="whats-new-synced-releases" className="space-y-3">
                  <div className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <Sparkles className="size-3.5" />
                    <span>
                      {bi(
                        `إصدارات مستودع GitHub المتزامنة (${syncedReleases.length})`,
                        `Synced GitHub Repository Releases (${syncedReleases.length})`,
                        `وەشانە هاوکاتکراوەکانی گیتهەب (${syncedReleases.length})`
                      )}
                    </span>
                  </div>

                  {syncedReleases.map((rel, idx) => {
                    const isCurrent =
                      compareSemverVersions(rel.version, APP_SEMVER_VERSION) === 0;
                    const isNewer =
                      compareSemverVersions(rel.version, APP_SEMVER_VERSION) > 0;
                    const lines = extractReleaseNotesLines(rel.body);
                    return (
                      <div
                        key={rel.id}
                        className="p-4 rounded-xl bg-primary/5 border border-primary/25 space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              dir="ltr"
                              className="px-2.5 py-0.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-bold"
                            >
                              {rel.tagName}
                            </span>
                            {idx === 0 && !rel.isPrerelease && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg">
                                <Tag className="size-3" />
                                <span>{bi('أحدث إصدار', 'Latest', 'نوێترین')}</span>
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-lg">
                                {bi('مثبّت حالياً', 'Installed', 'دامەزراوە')}
                              </span>
                            )}
                            {isNewer && (
                              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-lg">
                                {bi('إصدار أحدث متاح', 'Newer Available', 'نوێتر بەردەستە')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {rel.publishedAt && (
                              <span
                                dir="ltr"
                                className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground-1"
                              >
                                <Calendar className="size-3.5" />
                                <span>{rel.publishedAt.slice(0, 10)}</span>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void openSafeExternalUrl(rel.htmlUrl)}
                              className="px-2 py-0.5 rounded-md bg-card hover:bg-layer-hover border border-line-2 text-xs font-semibold text-foreground inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ExternalLink className="size-3 text-primary" />
                              <span>GitHub</span>
                            </button>
                          </div>
                        </div>

                        <h3 className="text-xs font-bold text-foreground">{rel.name}</h3>

                        {lines.length > 0 ? (
                          <ul className="space-y-1.5">
                            {lines.map((line, lineIdx) => (
                              <li
                                key={lineIdx}
                                className="flex items-start gap-2 text-xs text-muted-foreground-1 leading-relaxed"
                              >
                                <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                <span className="break-words">{line}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground-1">
                            {bi(
                              'لا توجد ملاحظات إضافية في وصف هذا الإصدار.',
                              'No release notes provided for this tag.',
                              'هیچ تێبینییەک نەنووسراوە.'
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bundled Offline Changelog Releases */}
              {BUNDLED_CHANGELOG_RELEASES.map((rel) => {
                const ckbRel = CHANGELOG_CKB[rel.version];
                return (
                  <div
                    key={rel.version}
                    data-testid={`changelog-release-${rel.version}`}
                    className="p-4 rounded-xl bg-surface border border-line-2 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          dir="ltr"
                          className="px-2.5 py-0.5 rounded-lg bg-primary text-primary-foreground text-xs font-mono font-bold"
                        >
                          v{rel.version}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-lg">
                          <Tag className="size-3" />
                          <span>{bi(rel.tagAr, rel.tagEn, ckbRel?.tagCkb)}</span>
                        </span>
                      </div>
                      <span
                        dir="ltr"
                        className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground-1"
                      >
                        <Calendar className="size-3.5" />
                        <span>{rel.date}</span>
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-foreground">
                      {bi(rel.titleAr, rel.titleEn, ckbRel?.titleCkb)}
                    </h3>

                    <ul className="space-y-2">
                      {rel.highlightsAr.map((itemAr, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2 text-xs text-muted-foreground-1 leading-relaxed"
                        >
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            {bi(
                              itemAr,
                              rel.highlightsEn[idx] ?? itemAr,
                              ckbRel?.highlightsCkb[idx]
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'migrations' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-foreground">
                <Shield className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {bi(
                      'قاعدة عدم تعديل المخططات السابقة (Append-Only Dexie Schema v1–v11)',
                      'Append-Only Dexie Schema Invariant (v1–v11 · 29 Total Stores)',
                      'یاسای نەگۆڕینی پێکهاتەکانی پێشوو (Append-Only Dexie Schema v1–v11)'
                    )}
                  </p>
                  <p className="text-muted-foreground-1 leading-relaxed">
                    {bi(
                      'لا يتم تعديل أي إصدار سابق في قاعدة البيانات أبداً؛ تتم كل ترقية بإضافة إصدار أعلى غير تلافي يحافظ على 24 جدولاً سريرياً مشفراً قابلاً للنقل و5 جداول محلية للجهاز.',
                      'Historical Dexie versions (v1–v10) are never mutated. Upgrades strictly append higher versions preserving all 24 portable encrypted clinical stores + 5 device-local stores.',
                      'هیچ وەشانێکی پێشووی بنکەی داتا هەرگیز دەستکاری ناکرێت؛ هەموو نوێکردنەوەیەک وەشانێکی بەرزتری نا-تێکدەر زیاد دەکات کە هەموو ٢٤ خشتە کلینیکییە نهێنیکراوە گواستراوەکان و ٥ خشتەی ناوخۆیی ئامێرەکە دەپارێزێت.'
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {DEXIE_MIGRATION_GUIDE_V1_TO_V11.map((entry) => {
                  const ckbEntry = DEXIE_MIGRATION_CKB[entry.version];
                  return (
                    <div
                      key={entry.version}
                      data-testid={`migration-guide-v${entry.version}`}
                      className="p-3.5 rounded-xl bg-surface border border-line-2 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          dir="ltr"
                          className="px-2.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30 text-xs font-mono font-bold"
                        >
                          Dexie v{entry.version}
                        </span>
                        <div className="flex flex-wrap items-center gap-1" dir="ltr">
                          {entry.storesAdded.map((st) => (
                            <code
                              key={st}
                              className="px-2 py-0.5 rounded bg-layer border border-layer-line text-xs font-mono font-semibold text-foreground"
                            >
                              {st}
                            </code>
                          ))}
                        </div>
                      </div>

                      <p className="text-xs font-bold text-foreground">
                        {bi(entry.summaryAr, entry.summaryEn, ckbEntry?.summaryCkb)}
                      </p>
                      <p className="text-xs text-muted-foreground-1">
                        <span className="font-semibold text-foreground">
                          {bi('سلوك الترقية: ', 'Upgrade behavior: ', 'شێوازی نوێکردنەوە: ')}
                        </span>
                        {bi(
                          entry.upgradeBehaviorAr,
                          entry.upgradeBehaviorEn,
                          ckbEntry?.upgradeBehaviorCkb
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-card-divider bg-muted/40 flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs text-muted-foreground-1">
            {bi(
              'مرجع التوثيق الكامل متاح في docs/MIGRATIONS.md و CHANGELOG.md',
              'Full technical reference included in docs/MIGRATIONS.md & CHANGELOG.md',
              'سەرچاوەی تەواوی تەکنیکی لە docs/MIGRATIONS.md و CHANGELOG.md بەردەستە'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
          >
            {bi('تم الاطلاع', 'Got it', 'تێگەیشتم')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewChangelogModal;
