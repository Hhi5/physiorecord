// =======================================================================
// PhysioRecord — In-App AI Custom Widget Studio Modal
// Copy AI Prompt -> Paste & Import Widget JSON -> Live Interactive Preview -> Save
// =======================================================================

import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { CustomWidgetDefinition } from '../../types/clinicalWidgets';
import { DynamicCustomWidget } from '../widgets/DynamicCustomWidget';
import { ClinicOperationsService } from '../../services/clinicOperationsService';
import { validateCustomWidgetDefinition } from '../../services/clinicSecurityHelpers';
import { canonicalizeCustomWidgetField } from '../../data/clinicalToolkit/canonicalKeysCatalog';
import { GeometricHeaderBackdrop } from '../ui/Dialog';
import {
  Sparkles,
  Copy,
  Check,
  Code2,
  Play,
  Save,
  X,
  AlertCircle,
} from 'lucide-react';

interface CustomWidgetStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWidgetCreated: (widget: CustomWidgetDefinition) => void;
}

const AI_PROMPT_TEMPLATE = `أنت خبير في هندسة النظم السريرية والعلاج الطبيعي.
أريدك أن تنشئ لي فحصاً سريرياً مخصصاً لتطبيق PhysioRecord بصيغة JSON نظيفة وصالحة فقط (دون شروحات نصية خارج كائن الـ JSON).

المطلوب مني كمعالج فيزيائي هو:
[اكتب هنا اسم الفحص ومواصفاته السريرية وما تريد اختباره بالتفصيل، مثلاً: فحص التوازن الدهليزي، أو فحص العصب السابع، أو تقييم إصابات الركبة الرياضية]

يجب أن يلتزم كائن الـ JSON بالهيكل الدقيق التالي:
{
  "id": "معرف_فريد_بالانجليزية_بدون_مسافات_مثال_vestibular_balance",
  "titleAr": "اسم الفحص بالعربية",
  "titleEn": "Clinical Test Name in English",
  "category": "custom_ai",
  "clinicalSpecialtyAr": "التخصص السريري بالعربية (مثال: تأهيل دهليزي وعصبي)",
  "clinicalSpecialtyEn": "Specialty in English (e.g. Vestibular & Neuro Rehab)",
  "descriptionAr": "وصف دقيق للهدف السريري من الفحص",
  "descriptionEn": "Clinical purpose of this assessment",
  "version": "1.0.0",
  "fields": [
    {
      "id": "field_1",
      "type": "slider | number | radio | select | text",
      "labelAr": "عنوان السؤال أو القياس بالعربية",
      "labelEn": "Field Label in English",
      "min": 0,
      "max": 10,
      "step": 1,
      "unit": "ثانية أو درجة (اختياري)",
      "options": [
        { "value": "normal", "labelAr": "طبيعي", "labelEn": "Normal", "score": 0 },
        { "value": "mild", "labelAr": "طفيف", "labelEn": "Mild", "score": 1 },
        { "value": "severe", "labelAr": "شديد", "labelEn": "Severe", "score": 3 }
      ]
    }
  ],
  "interpretations": [
    {
      "minScore": 0,
      "maxScore": 2,
      "severityAr": "أداء طبيعي / استجابة سليمة",
      "severityEn": "Normal Function",
      "clinicalRecommendationAr": "متابعة الخطة العلاجية الحالية"
    },
    {
      "minScore": 3,
      "maxScore": 10,
      "severityAr": "خلل وظيفي يتطلب تدخلاً علاجياً",
      "severityEn": "Significant Impairment",
      "clinicalRecommendationAr": "إدراج تمارين الاستقرار والتوازن الدهليزي مرتين يومياً"
    }
  ]
}`;

const PRESET_BELLS_PALSY: CustomWidgetDefinition = {
  id: 'facial_nerve_bells_palsy',
  titleAr: 'تقييم شلل العصب السابع الوجهي (House-Brackmann)',
  titleEn: "House-Brackmann Facial Nerve Scale",
  category: 'custom_ai',
  clinicalSpecialtyAr: 'التأهيل العصبي لعضلات الوجه',
  clinicalSpecialtyEn: 'Facial Neuromuscular Rehabilitation',
  descriptionAr: 'تقييم تناظر عضلات الوجه (رفع الحواجب، إغلاق العين، الابتسام، النفخ)',
  descriptionEn: 'Assess facial muscle symmetry at rest and during voluntary motion',
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  fields: [
    {
      id: 'forehead_wrinkle',
      type: 'radio',
      labelAr: 'حركة الجبهة وتجاعيد رفع الحواجب:',
      labelEn: 'Forehead Wrinkling (Frontalis):',
      options: [
        { value: 'normal', labelAr: 'تناظر تام', labelEn: 'Normal', score: 0 },
        { value: 'mild_weakness', labelAr: 'ضعف طفيف', labelEn: 'Mild Weakness', score: 1 },
        { value: 'absent', labelAr: 'غياب تام للحركة', labelEn: 'Absent', score: 2 },
      ],
    },
    {
      id: 'eye_closure',
      type: 'radio',
      labelAr: 'إغلاق العين بإحكام (Orbicularis Oculi):',
      labelEn: 'Eye Closure (Orbicularis Oculi):',
      options: [
        { value: 'complete_effortless', labelAr: 'إغلاق كامل بسهولة', labelEn: 'Complete', score: 0 },
        { value: 'complete_with_effort', labelAr: 'إغلاق كامل بجهد', labelEn: 'Complete with effort', score: 1 },
        { value: 'incomplete', labelAr: 'إغلاق غير كامل (ظهور البياض)', labelEn: 'Incomplete', score: 3 },
      ],
    },
    {
      id: 'smile_symmetry',
      type: 'radio',
      labelAr: 'تناظر الابتسامة وإظهار الأسنان:',
      labelEn: 'Smile Symmetry:',
      options: [
        { value: 'symmetric', labelAr: 'متناظرة تماماً', labelEn: 'Symmetric', score: 0 },
        { value: 'asymmetric_mild', labelAr: 'انحراف طفيف', labelEn: 'Mild Asymmetry', score: 1 },
        { value: 'asymmetric_severe', labelAr: 'انحراف شديد', labelEn: 'Severe Asymmetry', score: 2 },
      ],
    },
    {
      id: 'lip_pucker',
      type: 'radio',
      labelAr: 'ضم الشفتين والنفخ (الزر التعبيري):',
      labelEn: 'Lip Pucker & Puffing:',
      options: [
        { value: 'tight_seal', labelAr: 'إغلاق محكم دون تسريب هواء', labelEn: 'Tight Seal', score: 0 },
        { value: 'mild_air_leak', labelAr: 'تسريب هواء طفيف', labelEn: 'Mild Leak', score: 1 },
        { value: 'severe_leak', labelAr: 'تعذر الضم تماماً', labelEn: 'Unable', score: 2 },
      ],
    },
  ],
  interpretations: [
    {
      minScore: 0,
      maxScore: 1,
      severityAr: 'الدرجة الأولى / شلل طفيف جداً أو متعافي (Grade I-II)',
      severityEn: 'Grade I-II: Normal or Mild Dysfunction',
      clinicalRecommendationAr: 'المتابعة بتمارين المقاومة الخفيفة والمراقبة',
    },
    {
      minScore: 2,
      maxScore: 4,
      severityAr: 'الدرجة الثالثة / ضعف وظيفي متوسط (Grade III)',
      severityEn: 'Grade III: Moderate Dysfunction',
      clinicalRecommendationAr: 'تطبيق التنبيه الكهربائي الحسي الخفيف وإعادة التأهيل العصبي العضلي',
    },
    {
      minScore: 5,
      maxScore: 10,
      severityAr: 'الدرجة الرابعة إلى الخامسة / ضعف شديد (Grade IV-V)',
      severityEn: 'Grade IV-V: Moderately Severe to Severe',
      clinicalRecommendationAr: 'حماية العين بترطيب مستمر وخطط التحفيز المركز للوجه',
    },
  ],
};

export const CustomWidgetStudioModal: React.FC<CustomWidgetStudioModalProps> = ({
  isOpen,
  onClose,
  onWidgetCreated,
}) => {
  const { bi } = useLanguage();

  const [activeTab, setActiveTab] = useState<'prompt' | 'import'>('prompt');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [parsedWidget, setParsedWidget] = useState<CustomWidgetDefinition | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [savingWidget, setSavingWidget] = useState(false);
  const [previewState, setPreviewState] = useState<Record<string, unknown>>({});

  if (!isOpen) return null;

  const handleCopyPrompt = () => {
    void navigator.clipboard?.writeText?.(AI_PROMPT_TEMPLATE).catch(() => {});
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 3000);
  };

  const handleLoadPreset = () => {
    setJsonInput(JSON.stringify(PRESET_BELLS_PALSY, null, 2));
    setParsedWidget(PRESET_BELLS_PALSY);
    setParseError(null);
  };

  const handleValidateJson = () => {
    try {
      setParseError(null);
      const parsed = JSON.parse(jsonInput);
      const byteLength = new TextEncoder().encode(jsonInput).byteLength;
      const check = validateCustomWidgetDefinition(parsed, byteLength);
      if (!check.ok) {
        throw new Error(check.error);
      }
      const enrichedWidget: CustomWidgetDefinition = {
        ...check.data,
        fields: check.data.fields.map((field) => {
          const resolved = canonicalizeCustomWidgetField(field);
          return {
            ...field,
            canonicalKey: resolved.canonicalKey,
            label: resolved.label,
          };
        }),
      };
      setParsedWidget(enrichedWidget);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON syntax');
      setParsedWidget(null);
    }
  };

  const handleSaveToClinic = async () => {
    if (!parsedWidget || savingWidget) return;

    setSavingWidget(true);
    setParseError(null);
    try {
      const byteLength = jsonInput
        ? new TextEncoder().encode(jsonInput).byteLength
        : undefined;
      const saved = await ClinicOperationsService.saveCustomWidgetAsync(
        parsedWidget,
        byteLength
      );
      onWidgetCreated(saved);
      onClose();
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Error saving custom widget');
    } finally {
      setSavingWidget(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="relative w-full max-w-4xl bg-card border border-card-line rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[88dvh]">
        {/* Header */}
        <div className="relative overflow-hidden px-5 sm:px-6 pt-3 sm:pt-4 pb-4 bg-primary text-primary-foreground flex flex-col gap-2.5 shrink-0 shadow-xs">
          <GeometricHeaderBackdrop />
          <div className="relative z-10 w-10 h-1 bg-primary-foreground/40 rounded-full mx-auto sm:hidden shrink-0" aria-hidden="true" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-primary-foreground/15 border border-primary-foreground/25 text-primary-foreground shadow-2xs shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-primary-foreground truncate">
                  {bi('استوديو بناء الفحوصات السريرية المخصصة', 'Custom Clinical Widget Studio', 'ستۆدیۆی دروستکردنی پشکنینی کلینیکیی تایبەت')}
                </h3>
                <p className="text-xs text-primary-foreground/85 truncate">
                  {bi(
                    'صمم أي فحص سريري مخصص وأضفه لرف أدوات الفحص في عيادتك',
                    'Design custom clinical tests and import them into your clinic shelf',
                    'هەر پشکنینێکی کلینیکیی تایبەت دیزاین بکە و بیخە سەر ڕەفەی ئامرازەکانی کلینیکەکەت'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={bi('إغلاق', 'Close', 'داخستن')}
              className="size-9 !p-0 text-primary-foreground rounded-xl bg-primary-foreground/15 hover:bg-primary-foreground/25 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-6 pt-3 gap-2 border-b border-card-divider bg-card">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'prompt'
                ? 'text-primary border-primary bg-primary/5'
                : 'text-muted-foreground-1 border-transparent hover:text-foreground'
            }`}
          >
            <Copy className="w-4 h-4" />
            <span>{bi('1. نسخ القالب القياسي', '1. Copy Schema Template', '١. کۆپیکردنی قاڵبی ستاندارد')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === 'import'
                ? 'text-primary border-primary bg-primary/5'
                : 'text-muted-foreground-1 border-transparent hover:text-foreground'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>{bi('2. لصق الكود والمعاينة الحية', '2. Paste Code & Live Preview', '٢. لکاندنی کۆد و پێشبینینی ڕاستەوخۆ')}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Clinical Privacy & Schema Guardrail Warning (Phase 1.11) */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <p className="font-bold">
                {bi(
                  'تنبيه خصوصية صارم: لا تقم أبداً بلصق أي بيانات مرضى أو أسماء في أدوات الذكاء الاصطناعي الخارجية.',
                  'Privacy warning: Never paste patient data into external AI tools.',
                  'ئاگاداری توندی تایبەتمەندێتی: هەرگیز زانیاری یان ناوی نەخۆش لە ئامرازە دەرەکییەکانی زیرەکی دەستکردا مەلکێنە.'
                )}
              </p>
              <p className="text-muted-foreground-1">
                {bi(
                  'يتم التحقق من القوالب عبر مخطط نصي آمن (بحد أقصى 64 كيلوبايت و30 حقلاً) دون تنفيذ أي HTML أو نصوص برمجية.',
                  'Templates are validated with a strict plain-text JSON schema (max 64 KB, 30 fields) — zero HTML or script execution.',
                  'قاڵبەکان لە ڕێگەی سکیمای دەقیی پارێزراوەوە پشکنینیان بۆ دەکرێت (بە زۆرترین ٦٤ کیلۆبایت و ٣٠ خانە) بەبێ جێبەجێکردنی هیچ HTML یان کۆدێک.'
                )}
              </p>
            </div>
          </div>

          {activeTab === 'prompt' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-xs text-foreground leading-relaxed space-y-2">
                <p className="font-bold flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span>{bi('كيف تستخدم هذه الميزة؟', 'How does this work?', 'ئەم تایبەتمەندییە چۆن کاردەکات؟')}</span>
                </p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground-1">
                  <li>
                    {bi(
                      'اضغط على زر "نسخ البرومبت" أدناه.',
                      'Click the "Copy AI Prompt" button below.',
                      'کرتە لەسەر دوگمەی «کۆپیکردنی پڕۆمپت» لە خوارەوە بکە.'
                    )}
                  </li>
                  <li>
                    {bi(
                      'افتح ChatGPT أو Claude أو Gemini، والصق البرومبت، واكتب ما تريده في السطر المخصص (مثلاً: "أريد فحص توازن الأطفال").',
                      'Open ChatGPT, Claude, or Gemini, paste the prompt, and specify your clinical test request.',
                      'ChatGPT یان Claude یان Gemini بکەرەوە، پڕۆمپتەکە بلکێنە و داواکاریی پشکنینە کلینیکییەکەت بنووسە (بۆ نموونە: پشکنینی هاوسەنگیی منداڵان).'
                    )}
                  </li>
                  <li>
                    {bi(
                      'انسخ كود الـ JSON الذي سيعطيك إياه الذكاء الاصطناعي.',
                      'Copy the JSON code provided by the AI.',
                      'کۆدی JSONـە کە زیرەکی دەستکرد پێت دەدات کۆپی بکە.'
                    )}
                  </li>
                  <li>
                    {bi(
                      'ارجع للتبويب الثاني هنا (لصق الكود والمعاينة) والصق الكود واضغط حفظ!',
                      'Switch to the "Paste Code & Live Preview" tab, paste it, and save to your clinic!',
                      'بگەڕێوە بۆ تابە دووەم لێرە (لکاندنی کۆد و پێشبینین)، کۆدەکە بلکێنە و پاشەکەوتی بکە!'
                    )}
                  </li>
                </ol>
              </div>

              {/* Prompt Text Box */}
              <div className="relative">
                <textarea
                  readOnly
                  rows={10}
                  value={AI_PROMPT_TEMPLATE}
                  className="w-full p-4 font-mono text-xs rounded-xl bg-surface border border-layer-line text-foreground select-all focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="absolute top-3 right-3 rtl:right-auto rtl:left-3 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{bi('تم النسخ!', 'Copied!', 'کۆپی کرا!')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>{bi('نسخ البرومبت', 'Copy Prompt', 'کۆپیکردنی پڕۆمپت')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-foreground">
                  {bi('الصق كود الـ JSON الناتج من الذكاء الاصطناعي:', 'Paste AI Generated JSON Code:', 'کۆدی JSONـی بەرهەمهێنراو لەلایەن زیرەکی دەستکردەوە بلکێنە:')}
                </label>
                <button
                  type="button"
                  onClick={handleLoadPreset}
                  className="text-xs text-primary hover:underline font-semibold cursor-pointer"
                >
                  {bi(
                    'تجربة نموذج جاهز (شلل العصب السابع Bell\'s Palsy)',
                    'Load sample preset (Bell\'s Palsy)',
                    'تاقیکردنەوەی نموونەی ئامادە (ئیفلیجیی دەماری حەوتەم Bell\'s Palsy)'
                  )}
                </button>
              </div>

              <textarea
                rows={7}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={bi('الصق كود JSON هنا...', 'Paste JSON code here...', 'کۆدی JSON لێرە بلکێنە...')}
                className="w-full p-3 font-mono text-xs rounded-xl bg-surface border border-layer-line text-foreground focus:outline-hidden focus:border-primary"
              />

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleValidateJson}
                  className="px-4 py-2 rounded-lg bg-layer hover:bg-layer-hover border border-layer-line text-foreground text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 text-primary" />
                  <span>{bi('معاينة وتشغيل الفحص', 'Validate & Preview', 'پشکنین و پێشبینین')}</span>
                </button>

                {parseError && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{parseError}</span>
                  </p>
                )}
              </div>

              {/* Live Preview Container */}
              {parsedWidget && (
                <div className="space-y-3 pt-3 border-t border-card-divider">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" />
                      <span>{bi('المعاينة الحية التفاعلية للفحص:', 'Live Interactive Test Preview:', 'پێشبینینی ڕاستەوخۆ و کارلێکەری پشکنین:')}</span>
                    </span>
                    <button
                      type="button"
                      disabled={savingWidget}
                      onClick={() => void handleSaveToClinic()}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface disabled:text-muted-foreground-2 disabled:border disabled:border-line-2 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {savingWidget
                          ? bi('جاري الحفظ والتشفير...', 'Saving...', 'پاشەکەوتکردن و کۆدکردن...')
                          : bi('حفظ وإضافة إلى العيادة', 'Save to Clinic Repository', 'پاشەکەوتکردن و زیادکردن بۆ کلینیک')}
                      </span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-muted/40 border border-card-line">
                    <DynamicCustomWidget
                      definition={parsedWidget}
                      value={previewState}
                      onChange={setPreviewState}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
