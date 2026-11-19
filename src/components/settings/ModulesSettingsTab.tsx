import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Compass,
  Dumbbell,
  Eye,
  EyeOff,
  FileCode2,
  FileSignature,
  Mic,
  Plus,
  RotateCcw,
  Sparkles,
  TabletSmartphone,
  Target,
  Trash2,
  Upload,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import type {
  NoteTemplateCategory,
  NoteTemplateSnippet,
  SettingsViewMode,
} from '../../types/clinicManagement';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import {
  detectSpeechDictationSupport,
  type DictationCapabilityStatus,
} from '../../utils/localSpeech';
import { SPEECH_REASON_CKB } from './settingsI18nLabels';
import { ModulesClinicalSafetySection } from './ModulesClinicalSafetySection';
import { ModulesPhasesCDESection } from './ModulesPhasesCDESection';

interface ModulesSettingsTabProps {
  isModalOpen: boolean;
  isActiveTab: boolean;
  settingsViewMode: SettingsViewMode;
  onSwitchSettingsMode: (mode: SettingsViewMode) => void;
  customWidgets: CustomWidgetDefinition[];
  onOpenWidgetStudio: () => void;
  onStartTour?: () => void;
}

export const ModulesSettingsTab: React.FC<ModulesSettingsTabProps> = ({
  isModalOpen,
  isActiveTab,
  settingsViewMode,
  onSwitchSettingsMode,
  customWidgets,
  onOpenWidgetStudio,
  onStartTour,
}) => {
  const { language, bi } = useLanguage();

  const [showExerciseLibrary, setShowExerciseLibrary] = useState<boolean>(() =>
    ClinicOperationsService.isExerciseLibraryVisible()
  );
  const [enableWidgetStudio, setEnableWidgetStudio] = useState<boolean>(() =>
    ClinicOperationsService.isCustomWidgetStudioEnabled()
  );
  const [enableSmartGoalsGas, setEnableSmartGoalsGas] = useState<boolean>(() =>
    ClinicOperationsService.isSmartGoalsGasEnabled()
  );
  const [enableConsentModule, setEnableConsentModule] = useState<boolean>(() =>
    ClinicOperationsService.isConsentModuleEnabled()
  );
  const [enableAttachmentsModule, setEnableAttachmentsModule] = useState<boolean>(() =>
    ClinicOperationsService.isAttachmentsModuleEnabled()
  );
  const [enableVoiceDictationModule, setEnableVoiceDictationModule] = useState<boolean>(() =>
    ClinicOperationsService.isVoiceDictationModuleEnabled()
  );
  const [allowCloudSpeechOptIn, setAllowCloudSpeechOptIn] = useState<boolean>(() =>
    ClinicOperationsService.isCloudSpeechFallbackOptIn()
  );
  const [enableTemplatesModule, setEnableTemplatesModule] = useState<boolean>(() =>
    ClinicOperationsService.isTemplatesModuleEnabled()
  );
  const [enableAnalyticsModule, setEnableAnalyticsModule] = useState<boolean>(() =>
    ClinicOperationsService.isAnalyticsModuleEnabled()
  );
  const [enableKioskModule, setEnableKioskModule] = useState<boolean>(() =>
    ClinicOperationsService.isKioskModuleEnabled()
  );
  const [tipsEnabled, setTipsEnabled] = useState<boolean>(() =>
    ClinicOperationsService.getOnboardingState().tipsEnabled
  );

  const [speechCheckStatus, setSpeechCheckStatus] = useState<DictationCapabilityStatus | null>(null);
  const [noteTemplates, setNoteTemplates] = useState<NoteTemplateSnippet[]>(() =>
    ClinicOperationsService.getAllNoteTemplates()
  );
  const [newTplTrigger, setNewTplTrigger] = useState('');
  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplBody, setNewTplBody] = useState('');
  const [newTplCategory, setNewTplCategory] = useState<NoteTemplateCategory>('general');
  const [packImportStatus, setPackImportStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const syncModules = () => {
      setShowExerciseLibrary(ClinicOperationsService.isExerciseLibraryVisible());
      setEnableWidgetStudio(ClinicOperationsService.isCustomWidgetStudioEnabled());
      setEnableSmartGoalsGas(ClinicOperationsService.isSmartGoalsGasEnabled());
      setEnableConsentModule(ClinicOperationsService.isConsentModuleEnabled());
      setEnableAttachmentsModule(ClinicOperationsService.isAttachmentsModuleEnabled());
      setEnableVoiceDictationModule(ClinicOperationsService.isVoiceDictationModuleEnabled());
      setAllowCloudSpeechOptIn(ClinicOperationsService.isCloudSpeechFallbackOptIn());
      setEnableTemplatesModule(ClinicOperationsService.isTemplatesModuleEnabled());
      setEnableAnalyticsModule(ClinicOperationsService.isAnalyticsModuleEnabled());
      setEnableKioskModule(ClinicOperationsService.isKioskModuleEnabled());
      setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
      setTipsEnabled(ClinicOperationsService.getOnboardingState().tipsEnabled);
    };
    if (isModalOpen) {
      syncModules();
    }
    const unsubOps = ClinicOperationsService.subscribe(syncModules);
    window.addEventListener('physiorecord-modules-updated', syncModules);
    return () => {
      unsubOps();
      window.removeEventListener('physiorecord-modules-updated', syncModules);
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen || !isActiveTab) return;
    const tag = language === 'en' ? 'en-US' : language === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
    void detectSpeechDictationSupport(tag, allowCloudSpeechOptIn)
      .then(setSpeechCheckStatus)
      .catch(() => {});
  }, [isModalOpen, isActiveTab, language, allowCloudSpeechOptIn]);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Dumbbell className="size-4 text-primary" />
            <span>
              {bi(
                'مكتبة التمارين والبرنامج المنزلي (HEP)',
                'Exercise Library & HEP Builder',
                'کتێبخانەی ڕاهێنان و بەرنامەی ماڵەوە (HEP)'
              )}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              showExerciseLibrary
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {showExerciseLibrary
              ? bi('ظاهرة ومفعّلة', 'Visible & Active', 'دیار و چالاک')
              : bi('مخفية حالياً (البيانات محفوظة)', 'Hidden (Data Preserved)', 'لە ئێستادا شاراوەیە (داتاکان پارێزراون)')}
          </span>
        </div>

        <p className="text-xs text-muted-foreground-1 leading-relaxed">
          {bi(
            'يمكنك إخفاء قسم مكتبة التمارين من القائمة الجانبية وملف المريض مؤقتاً دون مسح أي تمارين أو برامج منزلية محفوظة، مع إمكانية استعادتها في أي وقت بنقرة واحدة.',
            'Temporarily hide the Exercise Library & HEP section from navigation and patient charts without deleting any saved exercises or programs, and restore it anytime in one click.',
            'دەتوانیت بەشێوەیەکی کاتی بەشی کتێبخانەی ڕاهێنانەکان لە لیستی تەنیشت و فایلەکانی نەخۆش بشاریتەوە بێ سڕینەوەی هیچ ڕاهێنان و بەرنامەیەکی پاشەکەوتکراو، و هەر کاتێک بتەوێت بە یەک کلیک بیگەڕێنیتەوە.'
          )}
        </p>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              const next = !showExerciseLibrary;
              ClinicOperationsService.setExerciseLibraryVisible(next);
              setShowExerciseLibrary(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
              showExerciseLibrary
                ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs'
            }`}
          >
            {showExerciseLibrary ? (
              <>
                <EyeOff className="size-3.5" />
                <span>
                  {bi('إخفاء مكتبة التمارين مؤقتاً', 'Hide Exercise Library', 'شاردنەوەی کتێبخانەی ڕاهێنانەکان بە کاتی')}
                </span>
              </>
            ) : (
              <>
                <Eye className="size-3.5" />
                <span>
                  {bi(
                    'استعادة وإظهار مكتبة التمارين',
                    'Restore & Show Exercise Library',
                    'گەڕاندنەوە و پیشاندانی کتێبخانەی ڕاهێنانەکان'
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Custom Clinical Widget Studio (Off by default per Phase 1.11 / R6) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Sparkles className="size-4 text-primary" />
            <span>
              {bi(
                'منشئ أدوات الفحص المخصصة (متقدم)',
                'Custom Clinical Widget Studio (Advanced)',
                'دروستکەری ئامرازە تایبەتەکانی پشکنین (پێشکەوتوو)'
              )}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              enableWidgetStudio
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground-1'
            }`}
          >
            {enableWidgetStudio
              ? bi('مفعّل في شاشة الفحص', 'Enabled in Exam Shelf', 'چالاکە لە شاشەی پشکنین')
              : bi(
                  'مخفي افتراضياً (النماذج المحفوظة تبقى مقروءة)',
                  'Hidden by Default (Saved Charts Readable)',
                  'بە بنەڕەتی شاراوەیە (فۆرمە پاشەکەوتکراوەکان دەخوێندرێنەوە)'
                )}
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>
            {bi(
              'لا تقم أبداً بلصق بيانات المرضى أو الأسماء في أدوات الذكاء الاصطناعي الخارجية. تُفحص القوالب بمخطط نصي آمن دون تنفيذ HTML.',
              'Never paste patient data into external AI tools. Templates are strictly JSON/plain-text validated (max 64 KB, 30 fields).',
              'هەرگیز زانیاری یان ناوی نەخۆشەکان لە ئامرازەکانی زیرەکی دەستکردی دەرەکیدا مەنێ. داڕشتەکان بە پشکنەری دەقی سەلامەت دەپشکنرێن بێ جێبەجێکردنی HTML.'
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !enableWidgetStudio;
              ClinicOperationsService.setCustomWidgetStudioEnabled(next);
              setEnableWidgetStudio(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
              enableWidgetStudio
                ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {enableWidgetStudio
              ? bi('إخفاء زر المنشئ عن شاشة الفحص', 'Hide Studio from Exam Shelf', 'شاردنەوەی دوگمەی ستۆدیۆ لە شاشەی پشکنین')
              : bi('تفعيل منشئ الأدوات المخصصة', 'Enable Custom Widget Studio', 'چالاککردنی دروستکەری ئامرازی تایبەت')}
          </button>

          {enableWidgetStudio && (
            <button
              type="button"
              onClick={onOpenWidgetStudio}
              className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{bi('إنشاء / استيراد أداة مخصصة', 'Open Custom Widget Studio', 'دروستکردن / هاوردەکردنی ئامرازی تایبەت')}</span>
            </button>
          )}
        </div>

        {customWidgets.length > 0 && (
          <div className="pt-2 border-t border-card-divider space-y-2">
            <p className="text-xs font-bold text-foreground">
              {bi(
                `القوالب المخصصة المحفوظة (${customWidgets.length}):`,
                `Saved Custom Templates (${customWidgets.length}):`,
                `فۆرمە تایبەتە پاشەکەوتکراوەکان (${customWidgets.length}):`
              )}
            </p>
            <div className="space-y-1.5">
              {customWidgets.map((cw) => (
                <div
                  key={cw.id}
                  className="p-2.5 rounded-xl bg-layer border border-layer-line flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-foreground truncate">
                      {bi(cw.titleAr, cw.titleEn, cw.titleAr)}
                    </p>
                    <p dir="ltr" className="text-xs font-mono text-muted-foreground-1 truncate">
                      {cw.id} · {cw.fields.length} {bi('حقلاً', 'fields', 'خانە')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void ClinicOperationsService.deleteCustomWidgetAsync(cw.id)}
                    className="size-9 rounded-lg text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                    aria-label={bi('حذف القالب', 'Delete template', 'سڕینەوەی فۆرم')}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SMART Goals & Goal Attainment Scaling (GAS -2 to +2) — Off by default per R6 */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Target className="size-4 text-primary" />
            <span>
              {bi('أهداف SMART التفصيلية ومقياس تحقيق الهدف', 'SMART Goals & Goal Attainment Scaling', 'ئامانجە وردەکانی SMART و پێوەری گەیشتن بە ئامانج')}{' '}
              <bdi dir="ltr">(GAS -2 / +2)</bdi>
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              enableSmartGoalsGas
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground-1'
            }`}
          >
            {enableSmartGoalsGas
              ? bi('مفعّل في حلقات الرعاية والملف السريري', 'Enabled in Episodes & Chart', 'چالاکە لە زنجیرەی چارەسەر و فایلی کلینیکیدا')
              : bi('مخفي افتراضياً (الأهداف البسيطة فقط)', 'Hidden by Default (Simple Goals)', 'بە بنەڕەتی شاراوەیە (تەنها ئامانجە سادەکان)')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'يضيف تقسيم SMART الكامل وتقييم GAS من -2 إلى +2 في حلقة الرعاية وخطة العلاج. إخفاؤه يبقي شاشات الإدخال السريع أبسط.',
            'Adds full S/M/A/R/T goal breakdown and GAS (-2 to +2) attainment tracking in episodes and charts. Hidden by default to keep daily entry simple.',
            'دابەشکردنی تەواوی SMART و هەڵسەنگاندنی GAS لە -2 بۆ +2 زیاد دەکات لە زنجیرەی چارەسەر و پلانی چارەسەردا. شاردنەوەی شاشەکانی تۆمارکردنی ڕۆژانە سادەتر دەهێڵێتەوە.'
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !enableSmartGoalsGas;
              ClinicOperationsService.setSmartGoalsGasEnabled(next);
              setEnableSmartGoalsGas(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
              enableSmartGoalsGas
                ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {enableSmartGoalsGas
              ? bi('إخفاء SMART & GAS افتراضياً', 'Hide SMART & GAS Module', 'شاردنەوەی SMART و GAS بە بنەڕەتی')
              : bi('تفعيل أهداف SMART ومقياس GAS', 'Enable SMART Goals & GAS', 'چالاککردنی ئامانجەکانی SMART و پێوەری GAS')}
          </button>
        </div>
      </div>

      {/* Informed Consent & Digital Signature Module Toggle (Phase 4.8) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <FileSignature className="size-4 text-primary" />
            <span>
              {bi(
                'وحدة الموافقات المستنيرة والتوقيع الرقمي',
                'Informed Consent & Digital Signature Module',
                'بەشی ڕەزامەندی زانراو و واژۆی دیجیتاڵی'
              )}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              enableConsentModule
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground-1'
            }`}
          >
            {enableConsentModule
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'تتيح جمع تواقيع المرضى الإلكترونية (العلاج، حفظ البيانات، التصوير) وحفظها مشفرة في ملف المريض مع قابلية الطباعة.',
            'Captures bilingual treatment, data storage, and clinical photography consents with encrypted canvas signatures inside Patient Profile.',
            'ڕێگە دەدات بە کۆکردنەوەی واژۆی ئەلیکترۆنی نەخۆشەکان (چارەسەر، پاراستنی داتا، وێنەگرتن) و پاشەکەوتکردنیان بە کۆدکراوی لە دۆسیەی نەخۆشدا لەگەڵ توانای چاپکردن.'
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !enableConsentModule;
              ClinicOperationsService.setConsentModuleEnabled(next);
              setEnableConsentModule(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors ${
              enableConsentModule
                ? 'bg-layer border border-layer-line text-foreground hover:bg-layer-hover'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {enableConsentModule
              ? bi('إخفاء وحدة الموافقات', 'Disable Consent Module', 'ناچالاککردنی بەشی ڕەزامەندییەکان')
              : bi('تفعيل وحدة الموافقات', 'Enable Consent Module', 'چالاککردنی بەشی ڕەزامەندییەکان')}
          </button>
        </div>
      </div>

      {/* 5.2 Encrypted Clinical Attachments & Posture Photos */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Camera className="size-4 text-primary" />
            <span>
              {bi(
                'مرفقات المرضى المشفرة وصور مقارنة القوام (5.2)',
                'Encrypted Attachments & Posture Photos (5.2)',
                'پاشکۆ کۆدکراوەکانی نەخۆش و وێنەی بەراوردکردنی پۆستەر (5.2)'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
            {enableAttachmentsModule
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'حفظ صور القوام والأشعة وتقارير PDF مشفرة محلياً في Dexie v9 مع ضغط تلقائي ومقارنة قبل/بعد.',
            'Encrypts posture photos, radiology captures, and PDFs inside Dexie v9 with automatic resizing and Before/After side-by-side comparison.',
            'پاشەکەوتکردنی وێنەی پۆستەر، تیشک و ڕاپۆرتەکانی PDF بە کۆدکراوی ناوخۆیی لە Dexie v9 لەگەڵ کەمکردنەوەی قەبارەی خۆکار و بەراوردکردنی پێش/دوای.'
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            const next = !enableAttachmentsModule;
            ClinicOperationsService.setAttachmentsModuleEnabled(next);
            setEnableAttachmentsModule(next);
          }}
          className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
            enableAttachmentsModule
              ? 'bg-layer border border-layer-line text-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {enableAttachmentsModule
            ? bi('إخفاء وحدة المرفقات', 'Disable Attachments Module', 'شاردنەوەی بەشی پاشکۆکان')
            : bi('تفعيل وحدة المرفقات', 'Enable Attachments Module', 'چالاککردنی بەشی پاشکۆکان')}
        </button>
      </div>

      {/* 5.5 Local-Only Voice Dictation */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Mic className="size-4 text-primary" />
            <span>
              {bi(
                'الإملاء الصوتي المحلي على الجهاز',
                'On-Device Voice Dictation',
                'نووسینی دەنگی ناوخۆیی لەسەر ئامێر'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
            {enableVoiceDictationModule
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {speechCheckStatus
            ? bi(
                speechCheckStatus.reasonAr,
                speechCheckStatus.reasonEn,
                SPEECH_REASON_CKB[speechCheckStatus.reasonAr]
              )
            : bi(
                'يُخفى زر الميكروفون تلقائياً إذا لم يتوفر نموذج صوتي محلي على المتصفح.',
                'Microphone button stays hidden automatically unless an on-device speech model is available.',
                'دوگمەی مایکرۆفۆن بە شێوەی خۆکار دەشاردرێتەوە ئەگەر مۆدێلی دەنگی ناوخۆیی لە وێبگەڕدا بەردەست نەبێت.'
              )}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const next = !enableVoiceDictationModule;
              ClinicOperationsService.setVoiceDictationModuleEnabled(next);
              setEnableVoiceDictationModule(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
              enableVoiceDictationModule
                ? 'bg-layer border border-layer-line text-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {enableVoiceDictationModule
              ? bi('إيقاف الإملاء الصوتي', 'Disable Voice Dictation', 'ڕاگرتنی نووسینی دەنگی')
              : bi('تفعيل فحص الإملاء المحلي', 'Enable On-Device Dictation', 'چالاککردنی پشکنینی نووسینی دەنگی ناوخۆیی')}
          </button>

          {enableVoiceDictationModule && speechCheckStatus && !speechCheckStatus.onDeviceSupported && (
            <label className="inline-flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowCloudSpeechOptIn}
                onChange={(e) => {
                  const next = e.target.checked;
                  ClinicOperationsService.setCloudSpeechFallbackOptIn(next);
                  setAllowCloudSpeechOptIn(next);
                }}
              />
              <span>
                {bi(
                  'موافقة صريحة: السماح بوضع السحابة الاختياري (يرسل الصوت لمزود المتصفح)',
                  'Explicit Privacy Opt-In: allow browser cloud speech fallback',
                  'ڕەزامەندی ڕاشکاو: ڕێگەدان بە دۆخی هەوری بژاردەیی (دەنگ بۆ دابینکەری وێبگەڕ دەنێرێت)'
                )}
              </span>
            </label>
          )}
        </div>
      </div>

      {/* 5.6 Note Templates & CC0 Content Packs */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <FileCode2 className="size-4 text-primary" />
            <span>
              {bi(
                'قوالب الجمل السريرية (/) وحزم المحتوى المفتوحة (5.6)',
                'Clinical Note Templates (/) & Open Content Packs (5.6)',
                'داڕشتەی ڕستە کلینیکییەکان (/) و پاکێجە کراوەکانی ناوەڕۆک (5.6)'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
            {enableTemplatesModule
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'اكتب / داخل ملاحظات SOAP لإدراج عبارات سريرية جاهزة (تأتي مع قوالب CC0-1.0 أصلية ويمكن استيراد حزم JSON مفتوحة الرخصة).',
            'Type / inside SOAP notes to expand reusable snippets (ships with original CC0-1.0 templates + open-licensed JSON content pack importer).',
            'لە ناو تێبینییەکانی SOAPدا / بنووسە بۆ دانانی دەستەواژە کلینیکییە ئامادەکان (لەگەڵ داڕشتە سەرەتاییەکانی CC0-1.0 دێت و دەتوانیت پاکێجی JSONی مۆڵەت-کراوە هاوردە بکەیت).'
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !enableTemplatesModule;
              ClinicOperationsService.setTemplatesModuleEnabled(next);
              setEnableTemplatesModule(next);
            }}
            className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
              enableTemplatesModule
                ? 'bg-layer border border-layer-line text-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {enableTemplatesModule
              ? bi('تعطيل اختصارات القوالب (/)', 'Disable Slash Templates', 'ناچالاککردنی کورتکراوەکانی داڕشتە (/)')
              : bi('تفعيل اختصارات القوالب (/)', 'Enable Slash Templates', 'چالاککردنی کورتکراوەکانی داڕشتە (/)')}
          </button>

          {enableTemplatesModule && (
            <label className="py-2 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="size-3.5" />
              <span>{bi('استيراد حزمة محتوى JSON', 'Import Content Pack JSON', 'هاوردەکردنی پاکێجی ناوەڕۆکی JSON')}</span>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    try {
                      const res = await ClinicOperationsService.importContentPackAsync(
                        String(reader.result || '')
                      );
                      setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                      setPackImportStatus({
                        ok: true,
                        msg: bi(
                          `تم استيراد "${res.pack.name}" (${res.pack.license}): ${res.importedCount} قالب.`,
                          `Imported "${res.pack.name}" (${res.pack.license}): ${res.importedCount} snippets.`,
                          `"${res.pack.name}" (${res.pack.license}) هاوردە کرا: ${res.importedCount} داڕشتە.`
                        ),
                      });
                    } catch (err) {
                      setPackImportStatus({
                        ok: false,
                        msg: err instanceof Error ? err.message : String(err),
                      });
                    }
                  };
                  reader.readAsText(file, 'utf-8');
                }}
              />
            </label>
          )}
        </div>

        {packImportStatus && (
          <div
            className={`p-2.5 rounded-lg text-xs bg-card shadow-2xs font-bold ${
              packImportStatus.ok
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {packImportStatus.msg}
          </div>
        )}

        {enableTemplatesModule && (
          <div className="pt-2 border-t border-card-divider space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                aria-label={bi('اختصار القالب بدون شرطة', 'Slash trigger without slash', 'کورتکراوەی داڕشتە')}
                value={newTplTrigger}
                onChange={(e) => setNewTplTrigger(e.target.value)}
                placeholder={bi(
                  'الاختصار بدون / (مثال: knee)',
                  'Slash trigger (e.g. knee)',
                  'کورتکراوە بێ / (نموونە: knee)'
                )}
                className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
              />
              <input
                type="text"
                aria-label={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                value={newTplTitle}
                onChange={(e) => setNewTplTitle(e.target.value)}
                placeholder={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
              />
              <select
                aria-label={bi('تصنيف القالب في SOAP', 'SOAP Category', 'پۆلێنی داڕشتە')}
                value={newTplCategory}
                onChange={(e) => setNewTplCategory(e.target.value as NoteTemplateCategory)}
                className="px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
              >
                <option value="general">{bi('عام', 'General', 'گشتی')}</option>
                <option value="subjective">Subjective (S)</option>
                <option value="objective">Objective (O)</option>
                <option value="assessment">Assessment (A)</option>
                <option value="plan">Plan (P)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label={bi('نص العبارة السريرية', 'Full snippet text to insert', 'دەقی تەواوی ڕستە کلینیکییەکە')}
                value={newTplBody}
                onChange={(e) => setNewTplBody(e.target.value)}
                placeholder={bi(
                  'نص العبارة السريرية التي ستُدرج…',
                  'Full snippet text to insert…',
                  'دەقی تەواوی ڕستە کلینیکییەکە کە دادەنرێت…'
                )}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-layer-line bg-layer text-xs text-foreground"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newTplTrigger.trim() || !newTplBody.trim()) return;
                  await ClinicOperationsService.saveNoteTemplateAsync({
                    slashTrigger: newTplTrigger.trim(),
                    titleAr: newTplTitle.trim() || newTplTrigger.trim(),
                    titleEn: newTplTitle.trim() || newTplTrigger.trim(),
                    bodyAr: newTplBody.trim(),
                    bodyEn: newTplBody.trim(),
                    category: newTplCategory,
                    packId: 'clinic-custom',
                    source: 'Clinic Authored',
                    license: 'CC0-1.0',
                  });
                  setNewTplTrigger('');
                  setNewTplTitle('');
                  setNewTplBody('');
                  setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
              >
                {bi('حفظ', 'Add', 'پاشەکەوتکردن')}
              </button>
            </div>
            <div
              tabIndex={0}
              aria-label={bi('قائمة قوالب الجمل السريرية', 'Clinical note snippets list', 'لیستی داڕشتە کلینیکییەکان')}
              className="max-h-36 overflow-y-auto space-y-1 focus:outline-none"
            >
              {noteTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="px-2.5 py-1.5 rounded-lg bg-layer border border-layer-line flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span dir="ltr" className="font-mono font-bold text-primary me-2">
                      /{tpl.slashTrigger}
                    </span>
                    <span className="font-semibold text-foreground">
                      {bi(tpl.titleAr, tpl.titleEn)}
                    </span>
                    <span className="text-muted-foreground-1 ms-2"><bdi dir="ltr">({tpl.license})</bdi></span>
                  </div>
                  {!tpl.isBuiltIn && (
                    <button
                      type="button"
                      aria-label={bi('حذف القالب', 'Delete snippet', 'سڕینەوەی داڕشتە')}
                      onClick={async () => {
                        await ClinicOperationsService.deleteNoteTemplateAsync(tpl.id);
                        setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                      }}
                      className="size-9 text-rose-600 hover:bg-rose-500/10 rounded inline-flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 5.7 Local Clinic Analytics Toggle */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <BarChart3 className="size-4 text-primary" />
            <span>
              {bi(
                'التحليلات والإحصائيات السريرية المحلية (5.7)',
                'Local Clinic Analytics Module (5.7)',
                'شیکاری و ئاماری کلینیکی ناوخۆیی (5.7)'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
            {enableAnalyticsModule
              ? bi('مفعّلة', 'Enabled', 'چالاکە')
              : bi('معطلة افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'حساب الحالات النشطة، نسبة الالتزام والغياب، تحسن المقاييس الوظيفية (MCID)، وصافي التدفق النقدي محلياً بالكامل.',
            'Local-only caseload, attendance vs no-show rates, MCID outcome improvement, and monthly income vs expense charts.',
            'ژماردنی حاڵەتە چالاکەکان، ڕێژەی پابەندبوون و ئامادەنەبوون، باشتربوونی پێوەرە کاراییەکان (MCID)، و پوختەی داهات و خەرجی بە تەواوی لەسەر ئامێرەکە.'
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            const next = !enableAnalyticsModule;
            ClinicOperationsService.setAnalyticsModuleEnabled(next);
            setEnableAnalyticsModule(next);
          }}
          className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
            enableAnalyticsModule
              ? 'bg-layer border border-layer-line text-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {enableAnalyticsModule
            ? bi('إخفاء تبويب التحليلات', 'Hide Analytics Tab', 'شاردنەوەی تابی شیکاری')
            : bi('تفعيل لوحة التحليلات المحلية', 'Enable Local Analytics', 'چالاککردنی شیکاری ناوخۆیی')}
        </button>
      </div>

      {/* 5.10 Locked Patient Kiosk Mode Toggle */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <TabletSmartphone className="size-4 text-primary" />
            <span>
              {bi(
                'وضع كشك المريض المقفل على الجهاز اللوحي (5.10)',
                'Locked Patient Kiosk Mode (5.10)',
                'شێوازی کیۆسکی قفڵدراوی نەخۆش لەسەر تابلێت (5.10)'
              )}
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-bold rounded-md border bg-muted text-muted-foreground-1 border-line-2">
            {enableKioskModule
              ? bi('مفعّل', 'Enabled', 'چالاکە')
              : bi('معطل افتراضياً', 'Off (Default)', 'بە بنەڕەتی ناچالاکە')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'شاشة دخول ذاتي وموافقة مستنيرة وتقييم PSFS للمريض على الآيباد بدون إظهار أي مريض آخر، ولا تُغلق إلا برمز PIN أو كلمة مرور الخزينة.',
            'Dedicated tablet self-intake, PSFS, and signed consent station exposing zero other records; exit requires Admin PIN or Vault Password.',
            'شاشەی تۆمارکردنی خۆیی، ڕەزامەندی زانراو و هەڵسەنگاندنی PSFS بۆ نەخۆش لەسەر تابلێت بێ پیشاندانی هیچ نەخۆشێکی تر، و تەنها بە کۆدی PIN یان وشەی نهێنی خەزێنە دادەخرێت.'
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            const next = !enableKioskModule;
            ClinicOperationsService.setKioskModuleEnabled(next);
            setEnableKioskModule(next);
          }}
          className={`py-2 px-4 rounded-xl text-xs font-bold cursor-pointer ${
            enableKioskModule
              ? 'bg-layer border border-layer-line text-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {enableKioskModule
            ? bi('تعطيل وضع الكشك', 'Disable Patient Kiosk', 'ناچالاککردنی شێوازی کیۆسک')
            : bi('تفعيل وضع كشك المريض', 'Enable Patient Kiosk', 'چالاککردنی شێوازی کیۆسکی نەخۆش')}
        </button>
      </div>

      {/* Contextual Tips & Optional Guided Tour Controls (2.8) */}
      <div className="p-4 rounded-xl bg-surface border border-line-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Compass className="size-4 text-primary" />
            <span>
              {bi(
                'التلميحات الإرشادية والجولة السريعة',
                'Contextual Tips & Guided Tour',
                'ئامۆژگارییە ڕێنمایییەکان و گەشتی خێرا'
              )}
            </span>
          </div>
          <span
            className={`text-xs font-bold ${
              tipsEnabled
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground-1'
            }`}
          >
            {tipsEnabled
              ? bi('مفعّلة', 'On', 'چالاکە')
              : bi('مخفية', 'Off', 'شاراوەیە')}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const next = !tipsEnabled;
              setTipsEnabled(next);
              await ClinicOperationsService.setTipsEnabledAsync(next);
            }}
            className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold cursor-pointer"
          >
            {tipsEnabled
              ? bi('إخفاء التلميحات الإرشادية', 'Hide Contextual Tips', 'شاردنەوەی ئامۆژگارییە ڕێنمایییەکان')
              : bi('تفعيل التلميحات الإرشادية', 'Show Contextual Tips', 'پیشاندانی ئامۆژگارییە ڕێنمایییەکان')}
          </button>
          <button
            type="button"
            onClick={async () => {
              await ClinicOperationsService.resetOnboardingAsync();
              setTipsEnabled(true);
            }}
            className="py-2 px-3.5 rounded-xl bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>{bi('استعادة التلميحات المغلقة', 'Reset Dismissed Tips', 'گەڕاندنەوەی ئامۆژگارییە داخراوەکان')}</span>
          </button>
          {onStartTour && (
            <button
              type="button"
              onClick={onStartTour}
              className="py-2 px-3.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Compass className="size-3.5" />
              <span>{bi('بدء الجولة السريعة', 'Start Guided Tour', 'دەستپێکردنی گەشتی خێرا')}</span>
            </button>
          )}
        </div>
      </div>

      <ModulesClinicalSafetySection isModalOpen={isModalOpen} />

      <ModulesPhasesCDESection
        isModalOpen={isModalOpen}
        settingsViewMode={settingsViewMode}
        onSwitchSettingsMode={onSwitchSettingsMode}
      />
    </div>
  );
};
