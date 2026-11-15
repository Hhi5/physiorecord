import React, { useEffect, useState } from 'react';
import { X, Sparkles, Database, CheckCircle2, Shield, Tag, Calendar } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import {
  APP_SEMVER_VERSION,
  BUNDLED_CHANGELOG_RELEASES,
  DEXIE_MIGRATION_GUIDE_V1_TO_V10,
} from '../../utils/settingsOnboardingPhaseF';

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
      'قۆناغی F (ڕێکخستنی سادە، ڕێبەری دەستپێکردن و سەرچاوەی کراوە): گەڕانی خێرا لە ڕێکخستنەکان بە گۆڕەری دۆخی سادە/پێشکەوتوو، لیستی هەنگاوەکانی دەستپێکردن، پەنجەرەی "چی نوێ هەیە" و ڕێبەری Dexie (v1–v10)، و دۆخی نمایشی گشتی (Public Demo).',
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

  useEffect(() => {
    if (isOpen) {
      setView(initialView);
      void ClinicOperationsService.setLastSeenChangelogVersionAsync(APP_SEMVER_VERSION).catch(
        () => undefined
      );
    }
  }, [isOpen, initialView]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="whats-new-modal"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-card border border-card-line rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-card-divider bg-muted/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  {bi(
                    'ما الجديد ودليل ترقيات قاعدة البيانات',
                    "What's New & Database Migration Guide",
                    'چی نوێ هەیە و ڕێبەری نوێکردنەوەی بنکەی داتا'
                  )}
                </h2>
                <span
                  data-testid="whats-new-semver-badge"
                  dir="ltr"
                  className="px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/30 text-xs font-mono font-bold"
                >
                  v{APP_SEMVER_VERSION} · SemVer
                </span>
              </div>
              <p className="text-xs text-muted-foreground-1 mt-0.5">
                {bi(
                  'سجل التحديثات المدمج (CHANGELOG.md) وسلسلة ترقيات الخزنة المشفرة (Dexie v1–v10)',
                  'Bundled semantic release notes (CHANGELOG.md) & append-only Dexie v1–v10 schema lineage',
                  'تۆماری نوێکارییە یەکخراوەکان (CHANGELOG.md) و ڕێڕەوی نوێکردنەوەی خەزێنەی نهێنیکراو (Dexie v1–v10)'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="whats-new-close-btn"
            onClick={onClose}
            aria-label={bi('إغلاق', 'Close', 'داخستن')}
            className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover cursor-pointer shrink-0"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-5 py-2.5 border-b border-card-divider bg-surface flex items-center gap-2 shrink-0">
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
                'تۆماری گۆڕانکارییەکان (CHANGELOG)'
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
                'دليل ترقية Dexie (v1–v10)',
                'Dexie Migration Guide (v1–v10)',
                'ڕێبەری نوێکردنەوەی Dexie (v1–v10)'
              )}
            </span>
          </button>
        </div>

        {/* Body */}
        <div tabIndex={0} className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-5 space-y-4">
          {view === 'changelog' && (
            <div className="space-y-4">
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
                      'قاعدة عدم تعديل المخططات السابقة (Append-Only Dexie Schema v1–v10)',
                      'Append-Only Dexie Schema Invariant (v1–v10 · 28 Total Stores)',
                      'یاسای نەگۆڕینی پێکهاتەکانی پێشوو (Append-Only Dexie Schema v1–v10)'
                    )}
                  </p>
                  <p className="text-muted-foreground-1 leading-relaxed">
                    {bi(
                      'لا يتم تعديل أي إصدار سابق في قاعدة البيانات أبداً؛ تتم كل ترقية بإضافة إصدار أعلى غير تلافي يحافظ على 23 جدولاً سريرياً مشفراً قابلاً للنقل و5 جداول محلية للجهاز.',
                      'Historical Dexie versions (v1–v9) are never mutated. Upgrades strictly append higher versions preserving all 23 portable encrypted clinical stores + 5 device-local stores.',
                      'هیچ وەشانێکی پێشووی بنکەی داتا هەرگیز دەستکاری ناکرێت؛ هەموو نوێکردنەوەیەک وەشانێکی بەرزتری نا-تێکدەر زیاد دەکات کە هەموو ٢٣ خشتە کلینیکییە نهێنیکراوە گواستراوەکان و ٥ خشتەی ناوخۆیی ئامێرەکە دەپارێزێت.'
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {DEXIE_MIGRATION_GUIDE_V1_TO_V10.map((entry) => {
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
