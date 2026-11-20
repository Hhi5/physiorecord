import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Layers,
  Plus,
  RotateCcw,
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
import { SettingsAccordion, SettingsSwitchRow } from './SettingsPrimitives';
import {
  resetAllPageTours,
  setAutoPageToursEnabled,
} from '../../utils/pageSpotlightTours';

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

  // Collapsible group states: in Simple Mode keep only Core & Clinic Ops open; in Advanced keep all open for instant visibility
  const [openCore, setOpenCore] = useState<boolean>(true);
  const [openClinicalSafety, setOpenClinicalSafety] = useState<boolean>(
    settingsViewMode === 'advanced'
  );
  const [openClinicOps, setOpenClinicOps] = useState<boolean>(true);
  const [openDataQuality, setOpenDataQuality] = useState<boolean>(
    settingsViewMode === 'advanced'
  );
  const [openSharing, setOpenSharing] = useState<boolean>(settingsViewMode === 'advanced');

  useEffect(() => {
    if (settingsViewMode === 'simple') {
      setOpenCore(true);
      setOpenClinicOps(false);
      setOpenClinicalSafety(false);
      setOpenDataQuality(false);
      setOpenSharing(false);
    } else {
      setOpenCore(true);
      setOpenClinicOps(true);
      setOpenClinicalSafety(true);
      setOpenDataQuality(true);
      setOpenSharing(true);
    }
  }, [settingsViewMode]);

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

  const coreActiveCount = [
    showExerciseLibrary,
    enableAttachmentsModule,
    enableConsentModule,
    enableTemplatesModule,
    enableVoiceDictationModule,
    enableAnalyticsModule,
    enableSmartGoalsGas,
    enableWidgetStudio,
    enableKioskModule,
  ].filter(Boolean).length;

  const allExpanded = openCore && openClinicalSafety && openClinicOps && openDataQuality && openSharing;

  const toggleAllGroups = () => {
    const next = !allExpanded;
    setOpenCore(next);
    setOpenClinicalSafety(next);
    setOpenClinicOps(next);
    setOpenDataQuality(next);
    setOpenSharing(next);
  };

  const onText = bi('مفعّلة', 'Enabled', 'چالاکە');
  const offText = bi('معطّلة', 'Off', 'ناچالاکە');

  return (
    <div className="space-y-3.5">
      {/* Quick Expand / Collapse All Bar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs text-muted-foreground-1">
          {bi(
            'فعّل فقط الأقسام التي تحتاجها عيادتك؛ إخفاء أي قسم لا يحذف بياناته المحفوظة.',
            'Enable only what your clinic needs; hiding a module preserves all saved records.',
            'تەنها ئەو بەشانە چالاک بکە کە کلینیکەکەت پێویستی پێیەتی؛ شاردنەوە هیچ داتایەک ناسڕێتەوە.'
          )}
        </p>
        <button
          type="button"
          onClick={toggleAllGroups}
          className="text-xs font-bold text-primary hover:underline whitespace-nowrap shrink-0 cursor-pointer"
        >
          {allExpanded
            ? bi('طيّ الكل', 'Collapse all', 'کۆکردنەوەی هەموو')
            : bi('توسيع الكل', 'Expand all', 'کردنەوەی هەموو')}
        </button>
      </div>

      {/* Group 1: Core Clinic & Chart Modules */}
      <SettingsAccordion
        icon={<Layers className="size-4" />}
        title={bi('الأقسام الأساسية وأدوات التوثيق', 'Core Modules & Documentation Tools', 'بەشە سەرەکییەکان و ئامرازەکانی تۆمارکردن')}
        meta={bi(`مفعّل ${coreActiveCount} من 9`, `${coreActiveCount} of 9 active`, `${coreActiveCount} لە 9 چالاکە`)}
        open={openCore}
        onOpenChange={setOpenCore}
      >
        <div>
          <SettingsSwitchRow
            title={bi('مكتبة التمارين والبرنامج المنزلي (HEP)', 'Exercise Library & HEP Builder', 'کتێبخانەی ڕاهێنان و بەرنامەی ماڵەوە')}
            description={bi(
              'إظهار قسم التمارين المنزلية في القائمة الجانبية وملف المريض (مخفية افتراضياً والبيانات محفوظة).',
              'Show the Exercise Library & HEP tab in navigation and patient charts (hidden by default; data preserved).',
              'پیشاندانی بەشی کتێبخانەی ڕاهێنانەکان لە لیستی تەنیشت و دۆسیەی نەخۆش.'
            )}
            checked={showExerciseLibrary}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setExerciseLibraryVisible(next);
              setShowExerciseLibrary(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('المرفقات المشفرة وصور مقارنة القوام', 'Encrypted Attachments & Posture Photos', 'پاشکۆ کۆدکراوەکان و وێنەی پۆستەر')}
            description={bi(
              'حفظ صور القوام والأشعة وتقارير PDF مشفرة محلياً مع مقارنة قبل/بعد.',
              'Encrypts posture photos, radiology captures, and PDFs with Before/After comparison.',
              'پاشەکەوتکردنی وێنەی پۆستەر، تیشک و ڕاپۆرتەکانی PDF بە کۆدکراوی.'
            )}
            checked={enableAttachmentsModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setAttachmentsModuleEnabled(next);
              setEnableAttachmentsModule(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('الموافقات المستنيرة والتوقيع الرقمي', 'Informed Consent & Digital Signature', 'ڕەزامەندی زانراو و واژۆی دیجیتاڵی')}
            description={bi(
              'جمع تواقيع المرضى الإلكترونية (العلاج، حفظ البيانات، التصوير) مع قابلية الطباعة.',
              'Captures bilingual treatment, storage, and photo consents with canvas signatures.',
              'کۆکردنەوەی واژۆی ئەلیکترۆنی نەخۆشەکان لە دۆسیەی نەخۆشدا.'
            )}
            checked={enableConsentModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setConsentModuleEnabled(next);
              setEnableConsentModule(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('التحليلات والإحصائيات السريرية المحلية', 'Local Clinic Analytics', 'شیکاری و ئاماری کلینیکی ناوخۆیی')}
            description={bi(
              'الحالات النشطة، نسبة الالتزام والغياب، تحسن المقاييس (MCID)، وصافي التدفق النقدي.',
              'Local caseload, attendance vs no-show rates, MCID outcomes, and income charts.',
              'ژماردنی حاڵەتە چالاکەکان، ڕێژەی پابەندبوون و پوختەی داهات.'
            )}
            checked={enableAnalyticsModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setAnalyticsModuleEnabled(next);
              setEnableAnalyticsModule(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('اختصارات الجمل السريرية (/) والقوالب', 'Clinical Note Slash Templates (/)', 'کورتکراوەی ڕستە کلینیکییەکان (/)')}
            description={bi(
              'اكتب / داخل ملاحظات SOAP لإدراج عبارات سريرية جاهزة أو استيراد حزم JSON.',
              'Type / inside SOAP notes to expand reusable snippets or import open JSON packs.',
              'لە ناو SOAPدا / بنووسە بۆ دانانی دەستەواژەی ئامادە.'
            )}
            checked={enableTemplatesModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setTemplatesModuleEnabled(next);
              setEnableTemplatesModule(next);
            }}
          >
            {enableTemplatesModule && (
              <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">
                    {bi(`القوالب المحفوظة (${noteTemplates.length})`, `Saved Snippets (${noteTemplates.length})`, `داڕشتەکان (${noteTemplates.length})`)}
                  </span>
                  <label className="py-1.5 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="size-3.5" />
                    <span>{bi('استيراد حزمة JSON', 'Import JSON Pack', 'هاوردەکردنی JSON')}</span>
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
                                `"${res.pack.name}" هاوردە کرا: ${res.importedCount} داڕشتە.`
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
                </div>

                {packImportStatus && (
                  <div
                    className={`p-2 rounded-lg text-xs bg-card font-bold ${
                      packImportStatus.ok
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {packImportStatus.msg}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    aria-label={bi('اختصار القالب بدون شرطة', 'Slash trigger without slash', 'کورتکراوەی داڕشتە')}
                    value={newTplTrigger}
                    onChange={(e) => setNewTplTrigger(e.target.value)}
                    placeholder={bi('الاختصار (مثال: knee)', 'Trigger (e.g. knee)', 'کورتکراوە (knee)')}
                    className="px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
                  />
                  <input
                    type="text"
                    aria-label={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                    value={newTplTitle}
                    onChange={(e) => setNewTplTitle(e.target.value)}
                    placeholder={bi('عنوان القالب', 'Template Title', 'ناونیشانی داڕشتە')}
                    className="px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
                  />
                  <select
                    aria-label={bi('تصنيف القالب في SOAP', 'SOAP Category', 'پۆلێنی داڕشتە')}
                    value={newTplCategory}
                    onChange={(e) => setNewTplCategory(e.target.value as NoteTemplateCategory)}
                    className="px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
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
                    aria-label={bi('نص العبارة السريرية', 'Full snippet text to insert', 'دەقی ڕستە کلینیکییەکە')}
                    value={newTplBody}
                    onChange={(e) => setNewTplBody(e.target.value)}
                    placeholder={bi('نص العبارة التي ستُدرج...', 'Snippet text to insert...', 'دەقی ڕستەکە...')}
                    className="flex-1 px-2.5 py-1.5 rounded-xl border border-layer-line bg-layer text-xs text-foreground"
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
                    className="min-h-[34px] px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold cursor-pointer"
                  >
                    {bi('حفظ', 'Add', 'پاشەکەوت')}
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
                      </div>
                      {!tpl.isBuiltIn && (
                        <button
                          type="button"
                          aria-label={bi('حذف القالب', 'Delete snippet', 'سڕینەوەی داڕشتە')}
                          onClick={async () => {
                            await ClinicOperationsService.deleteNoteTemplateAsync(tpl.id);
                            setNoteTemplates(ClinicOperationsService.getAllNoteTemplates());
                          }}
                          className="size-8 text-rose-600 hover:bg-rose-500/10 rounded-lg inline-flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SettingsSwitchRow>

          <SettingsSwitchRow
            title={bi('الإملاء الصوتي المحلي على الجهاز', 'On-Device Voice Dictation', 'نووسینی دەنگی ناوخۆیی')}
            description={
              speechCheckStatus
                ? bi(
                    speechCheckStatus.reasonAr,
                    speechCheckStatus.reasonEn,
                    SPEECH_REASON_CKB[speechCheckStatus.reasonAr]
                  )
                : bi(
                    'يُخفى زر الميكروفون تلقائياً إذا لم يتوفر نموذج صوتي محلي على المتصفح.',
                    'Microphone stays hidden unless an on-device speech model is available.',
                    'دوگمەی مایکرۆفۆن بە خۆکار دەشاردرێتەوە ئەگەر مۆدێلی دەنگی ناوخۆیی نەبێت.'
                  )
            }
            checked={enableVoiceDictationModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setVoiceDictationModuleEnabled(next);
              setEnableVoiceDictationModule(next);
            }}
          >
            {enableVoiceDictationModule && speechCheckStatus && !speechCheckStatus.onDeviceSupported && (
              <label className="inline-flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300 cursor-pointer p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
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
                    'Explicit Opt-In: allow browser cloud speech fallback',
                    'ڕەزامەندی: ڕێگەدان بە دۆخی هەوری بژاردەیی'
                  )}
                </span>
              </label>
            )}
          </SettingsSwitchRow>

          <SettingsSwitchRow
            title={
              <>
                {bi('أهداف SMART ومقياس تحقيق الهدف', 'SMART Goals & Goal Attainment Scaling', 'ئامانجەکانی SMART و پێوەری GAS')}{' '}
                <bdi dir="ltr">(GAS)</bdi>
              </>
            }
            description={bi(
              'يضيف تقسيم SMART الكامل وتقييم GAS (-2 إلى +2) في خطة العلاج.',
              'Adds full S/M/A/R/T breakdown and GAS (-2 to +2) tracking in care episodes.',
              'دابەشکردنی تەواوی SMART و هەڵسەنگاندنی GAS زیاد دەکات.'
            )}
            checked={enableSmartGoalsGas}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setSmartGoalsGasEnabled(next);
              setEnableSmartGoalsGas(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('وضع كشك المريض على الجهاز اللوحي', 'Locked Patient Kiosk Mode', 'شێوازی کیۆسکی قفڵدراوی نەخۆش')}
            description={bi(
              'شاشة دخول ذاتي وموافقة وتقييم PSFS على الآيباد بدون إظهار أي مريض آخر.',
              'Dedicated tablet self-intake, PSFS, and consent screen exposing zero other records.',
              'شاشەی تۆمارکردنی خۆیی لەسەر تابلێت بێ پیشاندانی هیچ نەخۆشێکی تر.'
            )}
            checked={enableKioskModule}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setKioskModuleEnabled(next);
              setEnableKioskModule(next);
            }}
          />

          <SettingsSwitchRow
            title={bi('منشئ أدوات الفحص المخصصة', 'Custom Clinical Widget Studio', 'دروستکەری ئامرازە تایبەتەکانی پشکنین')}
            description={bi(
              'تصميم أو استيراد بطاقات فحص ومقاييس مخصصة داخل شاشة الجلسة.',
              'Build or import custom JSON assessment widgets for the exam shelf.',
              'دروستکردن یان هاوردەکردنی فۆرمی پشکنینی تایبەت.'
            )}
            checked={enableWidgetStudio}
            onLabel={onText}
            offLabel={offText}
            onChange={(next) => {
              ClinicOperationsService.setCustomWidgetStudioEnabled(next);
              setEnableWidgetStudio(next);
            }}
          >
            {enableWidgetStudio && (
              <div className="p-3 rounded-xl bg-surface border border-line-2 space-y-2.5">
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    {bi(
                      'لا تلصق أبداً بيانات المرضى في أدوات خارجية؛ القوالب تُفحص نصياً بأمان.',
                      'Never paste patient data into external tools; templates are strictly JSON-validated.',
                      'هەرگیز زانیاری نەخۆش لە ئامرازە دەرەکییەکاندا مەنێ.'
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onOpenWidgetStudio}
                  className="min-h-[34px] py-1.5 px-3.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{bi('إنشاء / استيراد أداة مخصصة', 'Open Widget Studio', 'کردنەوەی ستۆدیۆ')}</span>
                </button>

                {customWidgets.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {customWidgets.map((cw) => (
                      <div
                        key={cw.id}
                        className="px-2.5 py-2 rounded-xl bg-layer border border-layer-line flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">
                            {bi(cw.titleAr, cw.titleEn, cw.titleAr)}
                          </p>
                          <p dir="ltr" className="text-xs font-mono text-muted-foreground-1 truncate">
                            {cw.fields.length} {bi('حقول', 'fields', 'خانە')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void ClinicOperationsService.deleteCustomWidgetAsync(cw.id)}
                          className="size-8 rounded-lg text-rose-600 hover:bg-rose-500/10 inline-flex items-center justify-center cursor-pointer shrink-0"
                          aria-label={bi('حذف القالب', 'Delete template', 'سڕینەوەی فۆرم')}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SettingsSwitchRow>
        </div>

        {/* Guided Tour & Contextual Tips */}
        <div className="pt-2.5 border-t border-card-divider flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Compass className="size-4 text-primary" />
            <span>{bi('التلميحات الإرشادية والجولة السريعة', 'Tips & Guided Tour', 'ئامۆژگاری و گەشتی خێرا')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={async () => {
                const next = !tipsEnabled;
                setTipsEnabled(next);
                setAutoPageToursEnabled(next);
                await ClinicOperationsService.setTipsEnabledAsync(next);
              }}
              className="min-h-[34px] px-3 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold cursor-pointer"
            >
              {tipsEnabled
                ? bi('إيقاف الجولات التلقائية', 'Disable Auto-Tours', 'وەستاندنی گەشتی خۆکار')
                : bi('تفعيل الجولات التلقائية', 'Enable Auto-Tours', 'چالاککردنی گەشتی خۆکار')}
            </button>
            <button
              type="button"
              onClick={async () => {
                resetAllPageTours();
                await ClinicOperationsService.resetOnboardingAsync();
                setTipsEnabled(true);
              }}
              className="min-h-[34px] px-2.5 py-1.5 rounded-xl bg-surface hover:bg-layer-hover border border-line-2 text-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>{bi('إعادة التعيين', 'Reset Tours', 'سفرکردنەوە')}</span>
            </button>
            {onStartTour && (
              <button
                type="button"
                onClick={onStartTour}
                className="min-h-[34px] px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Compass className="size-3.5" />
                <span>{bi('بدء الجولة الشاملة', 'Start Full Tour', 'گەشتی گشتی')}</span>
              </button>
            )}
          </div>
        </div>
      </SettingsAccordion>

      {/* Group 2: Clinical Workflow & Safety */}
      <ModulesClinicalSafetySection
        isModalOpen={isModalOpen}
        isOpen={openClinicalSafety}
        onOpenChange={setOpenClinicalSafety}
      />

      {/* Groups 3, 4, 5: Clinic Operations, Data Quality, Sharing */}
      <ModulesPhasesCDESection
        isModalOpen={isModalOpen}
        settingsViewMode={settingsViewMode}
        onSwitchSettingsMode={onSwitchSettingsMode}
        openClinicOps={openClinicOps}
        onOpenClinicOpsChange={setOpenClinicOps}
        openDataQuality={openDataQuality}
        onOpenDataQualityChange={setOpenDataQuality}
        openSharing={openSharing}
        onOpenSharingChange={setOpenSharing}
      />
    </div>
  );
};
