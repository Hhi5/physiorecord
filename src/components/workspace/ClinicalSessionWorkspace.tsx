// =======================================================================
// PhysioRecord — Next-Gen Expansive Clinical Session Workspace
// Dedicated full-canvas documentation environment replacing cramped modals
// =======================================================================

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useVault } from '../../context/VaultContext';
import { SoapService } from '../../services/soapService';
import { SessionService } from '../../services/sessionService';
import type {
  SessionRecord,
  SoapNoteRecord,
  SoapNoteData,
  PatientBodyChartData,
  SoapObjectiveData,
} from '../../types/clinical';
import type {
  OrthopedicSpecialTestItem,
  GaitPostureData,
  FunctionalScaleEntry,
  CustomWidgetDefinition,
} from '../../types/clinicalWidgets';
import { ExamWidgetShelf } from './ExamWidgetShelf';
import { ActiveExamCanvas } from './ActiveExamCanvas';
import { CustomWidgetStudioModal } from './CustomWidgetStudioModal';
import { AutoResizeTextarea } from '../ui/Primitives';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  CheckCircle2,
  Clock,
  Printer,
  Sparkles,
  AlertCircle,
  FileText,
  Activity,
  Layers,
  Send,
  Lock,
} from 'lucide-react';

interface ClinicalSessionWorkspaceProps {
  session: SessionRecord;
  patientId: string;
  patientName: string;
  episodeTitle: string;
  onBack: () => void;
  onSessionUpdated: () => void;
}

export const ClinicalSessionWorkspace: React.FC<ClinicalSessionWorkspaceProps> = ({
  session,
  patientId,
  patientName,
  episodeTitle,
  onBack,
  onSessionUpdated,
}) => {
  const { language, bi, isRtl } = useLanguage();
  const { dek } = useVault();

  const [activeTab, setActiveTab] = useState<'subjective' | 'objective' | 'assessment' | 'plan' | 'overview'>('objective');
  const [soapRecord, setSoapRecord] = useState<SoapNoteRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCustomStudioOpen, setIsCustomStudioOpen] = useState(false);

  // SOAP State
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptomChanges, setSymptomChanges] = useState('');
  const [painVas, setPainVas] = useState<number>(5);
  const [bodyChart, setBodyChart] = useState<PatientBodyChartData | undefined>(undefined);
  const [objective, setObjective] = useState<SoapObjectiveData>({});
  const [specialTests, setSpecialTests] = useState<OrthopedicSpecialTestItem[]>([]);
  const [gaitPosture, setGaitPosture] = useState<GaitPostureData | undefined>(undefined);
  const [functionalScales, setFunctionalScales] = useState<FunctionalScaleEntry | undefined>(undefined);
  const [customWidgetsData, setCustomWidgetsData] = useState<Record<string, Record<string, unknown>>>({});
  const [clinicalImpression, setClinicalImpression] = useState('');
  const [progressStatus, setProgressStatus] = useState<'improved' | 'unchanged' | 'regressed' | 'plateau'>('improved');
  const [patientTolerance, setPatientTolerance] = useState<'well_tolerated' | 'moderate_fatigue' | 'poorly_tolerated'>('well_tolerated');
  const [planNextSession, setPlanNextSession] = useState('');
  const [homeInstructions, setHomeInstructions] = useState('');

  // Active Widgets in Objective
  const [activeWidgetIds, setActiveWidgetIds] = useState<string[]>(['body_chart', 'rom']);

  // Load existing SOAP note
  useEffect(() => {
    async function loadSoap() {
      if (!dek || !session.id) return;
      setIsLoading(true);
      try {
        const existing = await SoapService.getSoapNoteBySession(session.id, dek);
        if (existing) {
          setSoapRecord(existing);
          const d = existing.data;
          setChiefComplaint(d.subjective?.chiefComplaint || '');
          setSymptomChanges(d.subjective?.symptomChangesSinceLastSession || '');
          setPainVas(d.subjective?.painNrsScore ?? 5);
          setBodyChart(d.subjective?.bodyChart);
          setObjective(d.objective || {});
          setClinicalImpression(d.assessment?.clinicalImpressionCurrent || '');
          setProgressStatus(d.assessment?.progressStatus || 'improved');
          setPatientTolerance(d.assessment?.patientTolerance || 'well_tolerated');
          setPlanNextSession(d.plan?.nextSessionPlan || '');
          setHomeInstructions(d.plan?.homeInstructions || '');

          // Detect active widgets from loaded data
          const detected = new Set<string>();
          if (d.subjective?.bodyChart?.markers?.length) detected.add('body_chart');
          if (d.objective?.romBattery?.entries?.length) detected.add('rom');
          if (d.objective?.mmtBattery?.entries?.length) detected.add('mmt');
          if (d.objective?.neuroScreening) detected.add('neuro');
          if (detected.size > 0) {
            setActiveWidgetIds(Array.from(detected));
          }
        }
      } catch (err) {
        console.error('Failed to load SOAP note:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadSoap();
  }, [session.id, dek]);

  const handleAddWidget = (widgetId: string) => {
    if (!activeWidgetIds.includes(widgetId)) {
      setActiveWidgetIds((prev) => [...prev, widgetId]);
    }
    setActiveTab('objective');
  };

  const handleRemoveWidget = (widgetId: string) => {
    setActiveWidgetIds((prev) => prev.filter((id) => id !== widgetId));
  };

  const handleSaveSoap = async () => {
    if (!dek) return;
    setIsSaving(true);
    try {
      const soapPayload: SoapNoteData = {
        subjective: {
          chiefComplaint: chiefComplaint || bi('متابعة سريرية مستمرة', 'Routine follow-up', 'بەدواداچوونی کلینیکیی بەردەوام'),
          symptomChangesSinceLastSession: symptomChanges,
          painNrsScore: painVas,
          painVasCurrent: painVas,
          bodyChart,
        },
        objective: {
          ...objective,
          objectiveFindings: objective.objectiveFindings || '',
          clinicalObservations: objective.clinicalObservations || '',
        },
        assessment: {
          clinicalImpressionCurrent: clinicalImpression || bi('استجابة جيدة للبروتوكول العلاجي', 'Good response to rehab protocol', 'وەڵامدانەوەی باش بۆ پڕۆتۆکۆلی چارەسەر'),
          progressStatus,
          patientTolerance,
        },
        plan: {
          nextSessionPlan: planNextSession || bi('الاستمرار في تمارين التدرج الوظيفي', 'Continue functional progression', 'بەردەوامبوون لە ڕاهێنانی پەرەپێدانی فەرمانی'),
          homeInstructions,
        },
        isFinalized: false,
      };

        if (soapRecord) {
        const updated = await SoapService.updateSoapNote(soapRecord.id, soapPayload, dek);
        setSoapRecord(updated);
      } else {
        const created = await SoapService.createSoapNote(
          patientId,
          session.episodeId,
          session.id,
          soapPayload,
          dek
        );
        setSoapRecord(created);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSessionUpdated();
    } catch (err: unknown) {
      console.error('Failed to save SOAP note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground-1 font-medium">
            {bi(
              'جاري فك تشفير وتجهيز مساحة العمل السريرية...',
              'Decrypting clinical workspace...',
              'کردنەوەی کۆد و ئامادەکردنی شوێنی کاری کلینیکی...'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top Clinical Ribbon */}
      <div className="px-6 py-3.5 bg-card border-b border-card-line flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-2xs">
        {/* Breadcrumb & Session Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg bg-layer border border-layer-line text-muted-foreground-1 hover:text-foreground hover:bg-layer-hover transition-colors cursor-pointer"
            title={bi('العودة لسجل المريض', 'Back to patient overview', 'گەڕانەوە بۆ دۆسیەی نەخۆش')}
          >
            {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary font-mono">
                {bi(
                  `جلسة #${session.data.sessionNumber}`,
                  `Session #${session.data.sessionNumber}`,
                  `دانیشتن #${session.data.sessionNumber}`
                )}
              </span>
              <span className="text-xs text-muted-foreground-2">•</span>
              <span className="text-xs text-muted-foreground-1 font-medium">{patientName}</span>
              <span className="text-xs text-muted-foreground-2">•</span>
              <span className="text-xs text-muted-foreground-1 font-medium">{episodeTitle}</span>
            </div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mt-0.5">
              <span>{session.data.sessionDate}</span>
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-layer text-foreground border border-layer-line">
                {session.data.sessionType}
              </span>
            </h2>
          </div>
        </div>

        {/* Pain VAS Slider & Save Action */}
        <div className="flex items-center gap-4">
          {/* Pain VAS Metric Pill */}
          <div className="flex items-center gap-2.5 bg-layer px-3 py-1.5 rounded-lg border border-layer-line">
            <span className="text-xs font-bold text-muted-foreground-1">
              {bi('مؤشر الألم (VAS):', 'Pain VAS:', 'پێوەری ئازار (VAS):')}
            </span>
            <input
              type="range"
              min="0"
              max="10"
              value={painVas}
              onChange={(e) => setPainVas(Number(e.target.value))}
              className="w-20 accent-primary cursor-pointer"
            />
            <span
              className={`px-2 py-0.5 rounded-md font-bold font-mono text-xs text-white ${
                painVas >= 7
                  ? 'bg-rose-600'
                  : painVas >= 4
                  ? 'bg-amber-500'
                  : painVas > 0
                  ? 'bg-emerald-600'
                  : 'bg-slate-600'
              }`}
            >
              <bdi dir="ltr">{painVas}/10</bdi>
            </span>
          </div>

          {/* Save Status / Button */}
          <button
            type="button"
            onClick={handleSaveSoap}
            disabled={isSaving}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer ${
              saveSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-primary hover:bg-primary-hover text-primary-foreground'
            }`}
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {isSaving
                ? bi('جاري التشفير والحفظ...', 'Encrypting...', 'کۆدکردن و پاشەکەوتکردن...')
                : saveSuccess
                ? bi('تم الحفظ مشفراً!', 'Saved & Encrypted!', 'بە کۆدکراوی پاشەکەوت کرا!')
                : bi('حفظ التوثيق السريري', 'Save Clinical Note', 'پاشەکەوتکردنی تۆماری کلینیکی')}
            </span>
          </button>
        </div>
      </div>

      {/* Workspace Tabs Navigation */}
      <div className="px-6 border-b border-card-line bg-card/90 flex items-center gap-2 shrink-0 overflow-x-auto scrollbar-none">
        {(
          [
            {
              id: 'objective',
              labelAr: 'O: الفحص السريري ورف الأدوات',
              labelEn: 'Objective & Exam Shelf',
              labelCkb: 'O: پشکنینی کلینیکی و ڕەفەی ئامرازەکان',
              icon: Activity,
              count: activeWidgetIds.length,
            },
            {
              id: 'subjective',
              labelAr: 'S: شكوى المريض والأعراض',
              labelEn: 'Subjective Narrative',
              labelCkb: 'S: سکاڵای نەخۆش و نیشانەکان',
              icon: FileText,
            },
            {
              id: 'assessment',
              labelAr: 'A: التقييم والتقدم السريري',
              labelEn: 'Assessment & Impression',
              labelCkb: 'A: هەڵسەنگاندن و پێشکەوتنی کلینیکی',
              icon: Sparkles,
            },
            {
              id: 'plan',
              labelAr: 'P: خطة العلاج والتمارين',
              labelEn: 'Plan & Next Session',
              labelCkb: 'P: پلانی چارەسەر و ڕاهێنانەکان',
              icon: Send,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                isSelected
                  ? 'text-primary border-primary bg-primary/5'
                  : 'text-muted-foreground-1 border-transparent hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{bi(tab.labelAr, tab.labelEn, tab.labelCkb)}</span>
              {'count' in tab && tab.count !== undefined && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-mono bg-primary/10 text-primary border border-primary/20">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Documentation Canvas Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Objective Tab (Default & Core Focus) */}
        {activeTab === 'objective' && (
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* The Examination Palette / Shelf */}
            <ExamWidgetShelf
              onAddWidget={handleAddWidget}
              onOpenCustomStudio={() => setIsCustomStudioOpen(true)}
              activeWidgetIds={activeWidgetIds}
            />

            {/* The Active Examination Canvas (Drop Zone & Cards) */}
            <ActiveExamCanvas
              activeWidgetIds={activeWidgetIds}
              onRemoveWidget={handleRemoveWidget}
              onAddWidget={handleAddWidget}
              bodyChart={bodyChart}
              onBodyChartChange={setBodyChart}
              objective={objective}
              onObjectiveChange={setObjective}
              specialTests={specialTests}
              onSpecialTestsChange={setSpecialTests}
              gaitPosture={gaitPosture}
              onGaitPostureChange={setGaitPosture}
              functionalScales={functionalScales}
              onFunctionalScalesChange={setFunctionalScales}
              customWidgetsData={customWidgetsData}
              onCustomWidgetsDataChange={setCustomWidgetsData}
            />

            {/* General Clinical Observations & Interventions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-card border border-card-line shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground block">
                    {bi(
                      'المشاهدات السريرية العامة (Clinical Observations):',
                      'General Clinical Observations:',
                      'تێبینییە کلینیکییە گشتییەکان (Clinical Observations):'
                    )}
                  </label>
                  <span className="text-xs text-muted-foreground-1 font-semibold">
                    {bi('كبس سريع', 'Quick phrases', 'دەستەواژەی خێرا')}
                  </span>
                </div>

                {/* Quick Phrase Chips */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    { ar: 'قوام طبيعي متناظر', en: 'Symmetric posture', ckb: 'شێوازی جەستەی سروشتی و هاوسەنگ' },
                    { ar: 'مشية عرجاء مع تفادي التحميل (Antalgic gait)', en: 'Antalgic gait', ckb: 'ڕۆیشتنی شەلەشەل بە دوورکەوتنەوە لە بارگرانی (Antalgic gait)' },
                    { ar: 'تشنج عضلي حامي (Muscle guarding)', en: 'Muscle guarding', ckb: 'گرژبوونی ماسولکەی پارێزەر (Muscle guarding)' },
                    { ar: 'تورم موضعي خفيف دون حرارة', en: 'Mild local swelling', ckb: 'ئاوسانی سووکی ناوچەیی بەبێ گەرمی' },
                    { ar: 'حساسية عند الجس (Tenderness to palpation)', en: 'Palpation tenderness', ckb: 'ئازار لە کاتی دەستلێدان (Tenderness to palpation)' },
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const textToAdd = bi(chip.ar, chip.en, chip.ckb);
                        setObjective((prev) => ({
                          ...prev,
                          clinicalObservations: prev.clinicalObservations
                            ? `${prev.clinicalObservations} • ${textToAdd}`
                            : textToAdd,
                        }));
                      }}
                      className="px-2 py-0.5 rounded-md text-xs font-medium bg-layer hover:bg-primary/10 hover:text-primary border border-layer-line text-foreground transition-colors cursor-pointer"
                    >
                      + {bi(chip.ar, chip.en, chip.ckb)}
                    </button>
                  ))}
                </div>

                <AutoResizeTextarea
                  minRows={3}
                  snippetCategory="objective"
                  value={objective.clinicalObservations || ''}
                  onChange={(e) =>
                    setObjective({ ...objective, clinicalObservations: e.target.value })
                  }
                  placeholder={bi(
                    'ملاحظات حول التورم، الحرارة الموضعية، التشنج الحامي، تفادي التحميل على الطرف...',
                    'Notes on localized swelling, temperature, muscle guarding, antalgic unloading...',
                    'تێبینی سەبارەت بە ئاوسان، گەرمی ناوچەیی، گرژبوونی پارێزەر، لابردنی بارگرانی...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="p-4 rounded-xl bg-card border border-card-line shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground block">
                    {bi(
                      'العلاجات والتدخلات المنفذة اليوم (Interventions):',
                      'Interventions Performed Today:',
                      'چارەسەر و دەستێوەردانە ئەنجامدراوەکانی ئەمڕۆ:'
                    )}
                  </label>
                  <span className="text-xs text-muted-foreground-1 font-semibold">
                    {bi('كبس سريع', 'Quick phrases', 'دەستەواژەی خێرا')}
                  </span>
                </div>

                {/* Quick Phrase Chips */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {[
                    { ar: 'علاج يدوي مفصلي (Joint Mobilization Gr II-III)', en: 'Joint Mobilization Gr II-III', ckb: 'جووڵاندنی جومگەیی دەستی (Joint Mobilization Gr II-III)' },
                    { ar: 'إطلاق وتدليك اللفافة العضلية (Myofascial release)', en: 'Myofascial release', ckb: 'شلبوونەوە و شێلانی شانەی ماسولکە (Myofascial release)' },
                    { ar: 'تمارين استطالة علاجية فاعلة', en: 'Active therapeutic stretching', ckb: 'ڕاهێنانی درێژکردنەوەی چالاکانەی چارەسەری' },
                    { ar: 'تمارين تقوية متساوية القياس (Isometric strengthening)', en: 'Isometric strengthening', ckb: 'ڕاهێنانی بەهێزکردنی ئایزۆمەتری (Isometric strengthening)' },
                    { ar: 'كمادات باردة 15 دقيقة (Cryotherapy)', en: 'Cryotherapy 15m', ckb: 'ساردی ١٥ خولەک (Cryotherapy)' },
                    { ar: 'تنبيه كهربائي مسكن (TENS)', en: 'TENS modality', ckb: 'وریاکردنەوەی کارەبایی ئازارشکێن (TENS)' },
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const textToAdd = bi(chip.ar, chip.en, chip.ckb);
                        setObjective((prev) => ({
                          ...prev,
                          dailyInterventionsSummary: prev.dailyInterventionsSummary
                            ? `${prev.dailyInterventionsSummary} • ${textToAdd}`
                            : textToAdd,
                        }));
                      }}
                      className="px-2 py-0.5 rounded-md text-xs font-medium bg-layer hover:bg-primary/10 hover:text-primary border border-layer-line text-foreground transition-colors cursor-pointer"
                    >
                      + {bi(chip.ar, chip.en, chip.ckb)}
                    </button>
                  ))}
                </div>

                <AutoResizeTextarea
                  minRows={3}
                  snippetCategory="objective"
                  value={objective.dailyInterventionsSummary || ''}
                  onChange={(e) =>
                    setObjective({ ...objective, dailyInterventionsSummary: e.target.value })
                  }
                  placeholder={bi(
                    'العلاج اليدوي المفصلي (Mobilization Grade II-III)، التمارين العلاجية، الكمادات، التنبيه...',
                    'Manual joint mobilization (Grade II-III), therapeutic exercise, neuromuscular re-ed...',
                    'جووڵاندنی جومگەیی دەستی (Grade II-III)، ڕاهێنانە چارەسەرییەکان، ساردی/گەرمی، وریاکردنەوە...'
                  )}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground placeholder:text-muted-foreground-2 focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Subjective Tab */}
        {activeTab === 'subjective' && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi(
                    'الشكوى الرئيسية الحالية للمريض (Chief Complaint):',
                    'Patient Chief Complaint:',
                    'سکاڵای سەرەکی ئێستای نەخۆش (Chief Complaint):'
                  )}
                </label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  placeholder={bi(
                    'مثال: ألم أسفل الظهر مع تنميل في الفخذ الأيسر يزداد عند الجلوس الطويل...',
                    'e.g., Lower back pain with left thigh paresthesia exacerbated by prolonged sitting...',
                    'نموونە: ئازاری خوارەوەی پشت لەگەڵ سڕبوونی ڕانی چەپ کە لە دانیشتنی درێژدا زیاد دەکات...'
                  )}
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi(
                    'تطور الأعراض منذ الجلسة السابقة (Symptom Changes):',
                    'Symptom Changes Since Last Session:',
                    'گۆڕانی نیشانەکان لە دانیشتنی پێشووەوە (Symptom Changes):'
                  )}
                </label>
                <AutoResizeTextarea
                  minRows={4}
                  snippetCategory="subjective"
                  value={symptomChanges}
                  onChange={(e) => setSymptomChanges(e.target.value)}
                  placeholder={bi(
                    'ماذا ذكر المريض عن استجابته للجلسة الماضية؟ هل قلّ الألم؟ هل نام بشكل أفضل؟',
                    'Patient report on tolerance of prior session, change in baseline pain, sleep quality...',
                    'نەخۆش چی دەربارەی وەڵامدانەوەی دانیشتنی ڕابردوو باس کرد؟ ئایا ئازار کەمبووەوە؟ ئایا خەوتنی باشتر بوو؟'
                  )}
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Assessment Tab */}
        {activeTab === 'assessment' && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-foreground block mb-1.5">
                    {bi(
                      'مسار تطور الحالة السريرية (Progress Status):',
                      'Clinical Progress Status:',
                      'ڕەوتی پێشکەوتنی باری کلینیکی (Progress Status):'
                    )}
                  </label>
                  <select
                    value={progressStatus}
                    onChange={(e) =>
                      setProgressStatus(
                        e.target.value as 'improved' | 'unchanged' | 'regressed' | 'plateau'
                      )
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground font-medium"
                  >
                    <option value="improved">{bi('تحسن ملحوظ (Improved)', 'Improved', 'باشبوونی بەرچاو (Improved)')}</option>
                    <option value="unchanged">{bi('استقرار / دون تغيير (Unchanged)', 'Unchanged', 'جێگیر / بێ گۆڕان (Unchanged)')}</option>
                    <option value="plateau">{bi('ثبات في الأداء (Plateau)', 'Plateau', 'ڕاوەستان لە پێشکەوتن (Plateau)')}</option>
                    <option value="regressed">{bi('تراجع في الأعراض (Regressed)', 'Regressed', 'خراپتربوونی نیشانەکان (Regressed)')}</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-foreground block mb-1.5">
                    {bi(
                      'تحمل المريض للجلسة (Tolerance):',
                      'Patient Tolerance to Treatment:',
                      'بەرگەگرتنی نەخۆش بۆ دانیشتنەکە (Tolerance):'
                    )}
                  </label>
                  <select
                    value={patientTolerance}
                    onChange={(e) =>
                      setPatientTolerance(
                        e.target.value as 'well_tolerated' | 'moderate_fatigue' | 'poorly_tolerated'
                      )
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-surface border border-layer-line text-foreground font-medium"
                  >
                    <option value="well_tolerated">{bi('تحمل ممتاز ودون مضاعفات (Well Tolerated)', 'Well Tolerated', 'بەرگەگرتنی زۆرباش بەبێ ئاڵۆزی (Well Tolerated)')}</option>
                    <option value="moderate_fatigue">{bi('إجهاد عضلي متوسط (Moderate Fatigue)', 'Moderate Fatigue', 'ماندوبوونی مامناوەندی ماسولکە (Moderate Fatigue)')}</option>
                    <option value="poorly_tolerated">{bi('تحمل ضعيف / ألم حاد (Poorly Tolerated)', 'Poorly Tolerated', 'بەرگەگرتنی لاواز / ئازاری توند (Poorly Tolerated)')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi(
                    'الانطباع السريري للمعالج (Clinical Impression):',
                    'Clinician Clinical Impression:',
                    'بۆچوونی کلینیکیی چارەسەرکار (Clinical Impression):'
                  )}
                </label>
                <AutoResizeTextarea
                  minRows={4}
                  snippetCategory="assessment"
                  value={clinicalImpression}
                  onChange={(e) => setClinicalImpression(e.target.value)}
                  placeholder={bi(
                    'التحليل السريري لاستجابة المريض، تطور المدى الحركي والقوة، والتوافق مع أهداف التأهيل...',
                    'Clinical analysis of patient functional trajectory and response to rehabilitation protocol...',
                    'شیکردنەوەی کلینیکی بۆ وەڵامدانەوەی نەخۆش، گۆڕانی مەودای جووڵە و هێز، و هاوئاهەنگی لەگەڵ ئامانجەکان...'
                  )}
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}

        {/* Plan Tab */}
        {activeTab === 'plan' && (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="p-5 rounded-xl bg-card border border-card-line shadow-2xs space-y-4">
              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi(
                    'خطة الجلسة القادمة (Next Session Plan):',
                    'Next Session Clinical Plan:',
                    'پلانی دانیشتنی داهاتوو (Next Session Plan):'
                  )}
                </label>
                <AutoResizeTextarea
                  minRows={3}
                  snippetCategory="plan"
                  value={planNextSession}
                  onChange={(e) => setPlanNextSession(e.target.value)}
                  placeholder={bi(
                    'التدرج في تمارين التقوية، زيادة المقاومة، الانتقال لتمارين التوازن الوظيفي...',
                    'Progress strengthening exercises, introduce dynamic balance, advance loading...',
                    'پێشکەوتن لە ڕاهێنانەکانی بەهێزکردن، زیادکردنی بەرگری، گواستنەوە بۆ ڕاهێنانی هاوسەنگی...'
                  )}
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-foreground block mb-1">
                  {bi(
                    'التعليمات والتمارين المنزلية (Home Exercise Plan - HEP):',
                    'Home Exercise Program (HEP) Instructions:',
                    'ڕێنماییەکان و ڕاهێنانەکانی ماڵەوە (HEP):'
                  )}
                </label>
                <AutoResizeTextarea
                  minRows={3}
                  snippetCategory="plan"
                  value={homeInstructions}
                  onChange={(e) => setHomeInstructions(e.target.value)}
                  placeholder={bi(
                    'تعليمات الوضعيات المريحة، كمادات الثلج 15 دقيقة، تمارين الإطالة 3 مرات يومياً...',
                    'Ergonomic posture advice, cryotherapy 15 min post-activity, active stretching 3x daily...',
                    'ڕێنمایی شێوازی دانیشتن و وەستانی دروست، ساردی ١٥ خولەک، ڕاهێنانی درێژکردنەوە ٣ جار لە ڕۆژێکدا...'
                  )}
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* In-App AI Custom Widget Studio Modal */}
      <CustomWidgetStudioModal
        isOpen={isCustomStudioOpen}
        onClose={() => setIsCustomStudioOpen(false)}
        onWidgetCreated={(newWidget) => {
          handleAddWidget(newWidget.id);
        }}
      />
    </div>
  );
};
