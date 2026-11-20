import React from 'react';
import {
  Activity,
  Brain,
  Dumbbell,
  FileCheck,
  Footprints,
  HeartPulse,
  ListChecks,
  MapPin,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import type { BodyLaterality } from '../../../types/clinical';
import type { CustomWidgetDefinition } from '../../../types/clinicalWidgets';
import type {
  EpisodeScopedClinicalStore,
  VitalsAlertThresholds,
} from '../../../types/clinicManagement';
import { evaluateVitalsAgainstThresholds } from '../../../utils/modalitySafetyChecker';
import { classifyAsiaIsncsci2019 } from '../../../utils/asiaIsncsciClassifier';

export const CORE_BUILTIN_WIDGET_KEYS = [
  'body_chart',
  'rom',
  'mmt',
  'special_tests',
  'functional_scales',
  'neuro',
  'gait_posture',
] as const;

export function nprsTextColor(score: number): string {
  if (score >= 7) return 'text-rose-700 dark:text-rose-400';
  if (score >= 4) return 'text-amber-700 dark:text-amber-400';
  return 'text-emerald-700 dark:text-emerald-400';
}

export interface SummaryLine {
  label?: string;
  text: string;
  tone?: 'default' | 'primary' | 'danger' | 'warn' | 'success';
  ltr?: boolean;
}

export interface ClinicalSectionSummary {
  key: string;
  title: string;
  shortTitle: string;
  subtitle?: string;
  icon: React.ReactNode;
  hasData: boolean;
  lines: SummaryLine[];
}

export const TONE_CLASS_MAP: Record<NonNullable<SummaryLine['tone']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary font-semibold',
  danger: 'text-rose-700 dark:text-rose-400 font-semibold',
  warn: 'text-orange-600 dark:text-orange-400 font-semibold',
  success: 'text-emerald-700 dark:text-emerald-400 font-medium',
};

type BiFn = (ar: string, en: string, ckb?: string) => string;

export function formatBodySide(lat: BodyLaterality, bi: BiFn): string {
  switch (lat) {
    case 'right':
      return 'R';
    case 'left':
      return 'L';
    case 'midline':
      return bi('محوري', 'Mid', 'تەوەرەیی');
    case 'bilateral':
      return 'R/L';
  }
}

export interface BuildClinicalExamSummaryParams {
  episodeStore: EpisodeScopedClinicalStore;
  customDefinitions: CustomWidgetDefinition[];
  vitalsThresholds: VitalsAlertThresholds;
  language: 'ar' | 'en' | 'ckb';
  bi: BiFn;
}

/**
 * Builds concise clinical summary rows for any assessment tool or module in an EpisodeScopedClinicalStore.
 * Shared across Visit Paper bottom-sheet summaries and Read-Only Chart Status views.
 */
export function buildClinicalExamSummary(
  key: string,
  {
    episodeStore,
    customDefinitions,
    vitalsThresholds,
    language,
    bi,
  }: BuildClinicalExamSummaryParams
): ClinicalSectionSummary {
  switch (key) {
    case 'body_chart': {
      const markers = episodeStore.bodyChart?.markers || [];
      const notes = (episodeStore.bodyChart?.clinicianSummaryNotes || '').trim();
      const lines: SummaryLine[] = [];
      if (markers.length > 0) {
        const preview = markers
          .slice(0, 3)
          .map((m) => {
            const region = bi(
              m.anatomicalRegionLabelAr || m.anatomicalRegionLabelEn || bi('موضع ألم', 'Area'),
              m.anatomicalRegionLabelEn || m.anatomicalRegionLabelAr || 'Area'
            );
            return typeof m.severityNrs === 'number' ? `${region} (${m.severityNrs}/10)` : region;
          })
          .join(' · ');
        const extra = markers.length > 3 ? ` (+${markers.length - 3})` : '';
        lines.push({ text: `${preview}${extra}`, tone: 'primary' });
      }
      if (notes) {
        lines.push({ text: notes });
      }
      return {
        key,
        title: bi('مخطط الجسم ومواضع الألم', 'Anatomical Body Chart', 'هێڵکاری جەستە'),
        shortTitle: bi('مخطط الجسم', 'Body Map', 'هێڵکاری جەستە'),
        subtitle: bi(
          'تحديد مواضع الألم ونوعه وشدته على الجسم',
          'Pin symptoms and pain intensity on the body chart'
        ),
        icon: <MapPin className="size-4 text-rose-500 shrink-0" />,
        hasData: markers.length > 0 || notes.length > 0,
        lines,
      };
    }

    case 'rom': {
      const entries = (episodeStore.objective?.romBattery?.entries || []).filter(
        (e) => e.measuredAngleDegrees !== null && e.measuredAngleDegrees !== undefined
      );
      const lines: SummaryLine[] = [];
      if (entries.length > 0) {
        const preview = entries
          .slice(0, 3)
          .map(
            (e) =>
              `${bi(e.movementNameAr, e.movementNameEn)} (${formatBodySide(e.laterality, bi)} ${e.measuredAngleDegrees}°)`
          )
          .join(' · ');
        const extra = entries.length > 3 ? ` (+${entries.length - 3})` : '';
        lines.push({ text: `${preview}${extra}` });
      }
      return {
        key,
        title: bi('المدى الحركي المفصلي (ROM)', 'Range of Motion (ROM)', 'مەودای جووڵە (ROM)'),
        shortTitle: bi('المدى الحركي ROM', 'ROM', 'ROM'),
        subtitle: bi(
          'توثيق زوايا الحركة الفاعلة والمنفعلة (AROM / PROM)',
          'Document AROM, PROM, and AAROM angles'
        ),
        icon: <Activity className="size-4 text-primary shrink-0" />,
        hasData: entries.length > 0,
        lines,
      };
    }

    case 'mmt': {
      const entries = (episodeStore.objective?.mmtBattery?.entries || []).filter(
        (e) => e.gradeValue !== null
      );
      const lines: SummaryLine[] = [];
      if (entries.length > 0) {
        const preview = entries
          .slice(0, 3)
          .map(
            (e) =>
              `${e.label || bi(e.muscleNameAr, e.muscleNameEn)} (${formatBodySide(e.laterality, bi)} ${e.gradeValue}/5)`
          )
          .join(' · ');
        const extra = entries.length > 3 ? ` (+${entries.length - 3})` : '';
        lines.push({ text: `${preview}${extra}` });
      }
      return {
        key,
        title: bi('اختبار القوة العضلية (MMT)', 'Manual Muscle Testing (MMT)', 'هێزی ماسولکە (MMT)'),
        shortTitle: bi('القوة العضلية MMT', 'MMT', 'MMT'),
        subtitle: bi(
          'مقياس القوة العضلية MRC (0–5) بصيغة حرة ومرنة',
          'Flexible MRC 0–5 strength documentation'
        ),
        icon: <Dumbbell className="size-4 text-sky-600 dark:text-sky-400 shrink-0" />,
        hasData: entries.length > 0,
        lines,
      };
    }

    case 'neuro': {
      const ns = episodeStore.objective?.neuroScreening;
      const sensoryCount =
        Object.keys(ns?.sensoryTable || {}).length ||
        (ns?.dermatomes || []).filter(
          (d) => d.rightStatus !== 'not_tested' || d.leftStatus !== 'not_tested'
        ).length;
      const reflexCount = (ns?.reflexes || []).filter(
        (r) => r.rightGrade !== null || r.leftGrade !== null
      ).length;
      const myotomeCount = (ns?.myotomes || []).filter(
        (m) => m.rightGrade !== null || m.leftGrade !== null
      ).length;
      const umnTested = (ns?.pathologicalSigns || []).filter(
        (p) => p.rightResult !== null || p.leftResult !== null
      );
      const umnPositive = umnTested.filter(
        (p) => p.rightResult === 'positive' || p.leftResult === 'positive'
      );
      const hasSacral = Boolean(ns?.asiaSacral?.vac || ns?.asiaSacral?.dap);
      const notes = (ns?.clinicalNotes || '').trim();
      const parts: string[] = [];
      if (sensoryCount > 0) parts.push(bi(`حسي: ${sensoryCount}`, `Sensory: ${sensoryCount}`));
      if (myotomeCount > 0) parts.push(bi(`مايوتوم: ${myotomeCount}`, `Myotomes: ${myotomeCount}`));
      if (reflexCount > 0) parts.push(bi(`منعكسات: ${reflexCount}`, `DTR: ${reflexCount}`));
      if (umnTested.length > 0 && umnPositive.length === 0) {
        parts.push(bi(`UMN سلبي: ${umnTested.length}`, `UMN Neg: ${umnTested.length}`));
      }
      if (hasSacral) {
        const sacralBits: string[] = [];
        if (ns?.asiaSacral?.vac) sacralBits.push(`VAC: ${ns.asiaSacral.vac.toUpperCase()}`);
        if (ns?.asiaSacral?.dap) sacralBits.push(`DAP: ${ns.asiaSacral.dap.toUpperCase()}`);
        parts.push(sacralBits.join(' · '));
      }
      const asiaClass = ns
        ? classifyAsiaIsncsci2019({
            sensoryTable: ns.sensoryTable,
            dermatomes: ns.dermatomes,
            myotomes: ns.myotomes,
            asiaSacral: ns.asiaSacral,
          })
        : null;
      const lines: SummaryLine[] = [];
      if (asiaClass && (asiaClass.aisGrade || asiaClass.nli)) {
        const asiaBits: string[] = [];
        if (asiaClass.nli) asiaBits.push(`NLI: ${asiaClass.nli}`);
        if (asiaClass.aisGrade) asiaBits.push(`AIS ${asiaClass.aisGrade}`);
        if (asiaClass.completeness === 'complete') asiaBits.push(bi('كاملة', 'Complete'));
        else if (asiaClass.completeness === 'incomplete') asiaBits.push(bi('غير كاملة', 'Incomplete'));
        const tone: SummaryLine['tone'] =
          asiaClass.aisGrade === 'A'
            ? 'danger'
            : asiaClass.aisGrade === 'B' || asiaClass.aisGrade === 'C'
              ? 'warn'
              : asiaClass.aisGrade === 'E'
                ? 'success'
                : 'primary';
        lines.push({
          label: 'ASIA/ISNCSCI',
          text: asiaBits.join(' · '),
          tone,
        });
      }
      if (umnPositive.length > 0) {
        lines.push({
          text: umnPositive.map((p) => `${bi(p.labelAr, p.labelEn)} (+)`).join(' · '),
          tone: 'danger',
        });
      }
      if (parts.length > 0) lines.push({ text: parts.join(' · ') });
      if (notes) lines.push({ text: notes });
      return {
        key,
        title: bi(
          'الفحص العصبي (Dermatomes · Myotomes · DTR/UMN)',
          'Neurological Screening (ASIA & Clinical)',
          'پشکنینی دەماری'
        ),
        shortTitle: bi('الفحص العصبي', 'Neuro', 'دەماری'),
        subtitle: bi(
          'القطاعات الجلدية، المايوتوم الشامل و ASIA، المنعكسات وعلامات UMN',
          'ASIA sensory/motor, clinical myotomes, DTR & UMN signs'
        ),
        icon: <Brain className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />,
        hasData:
          sensoryCount > 0 ||
          reflexCount > 0 ||
          myotomeCount > 0 ||
          umnTested.length > 0 ||
          hasSacral ||
          notes.length > 0,
        lines,
      };
    }

    case 'special_tests': {
      const tested = (episodeStore.specialTests || []).filter((t) => t.outcome !== 'not_tested');
      const pos = tested.filter(
        (t) => t.outcome === 'positive' || t.outcome === 'pain_reproduced'
      );
      const neg = tested.filter((t) => t.outcome === 'negative');
      const inc = tested.filter((t) => t.outcome === 'inconclusive');
      const lines: SummaryLine[] = [];
      if (pos.length > 0) {
        const posPreview = pos
          .slice(0, 3)
          .map((t) => `${bi(t.nameAr, t.nameEn)} (+)`)
          .join(' · ');
        const extra = pos.length > 3 ? ` (+${pos.length - 3})` : '';
        lines.push({ text: `${posPreview}${extra}`, tone: 'danger' });
      }
      if (neg.length > 0) {
        lines.push({
          text: bi(`سلبي (-): ${neg.length}`, `Negative (-): ${neg.length}`, `نێگەتیڤ (-): ${neg.length}`),
          tone: 'success',
        });
      }
      if (inc.length > 0 && pos.length === 0 && neg.length === 0) {
        lines.push({
          text: bi(`${inc.length} غير حاسم`, `${inc.length} inconclusive`),
          tone: 'warn',
        });
      }
      return {
        key,
        title: bi('الفحوصات العظمية التخصصية', 'Orthopedic Special Tests', 'تاقیکردنەوە تایبەتییەکان'),
        shortTitle: bi('اختبارات خاصة', 'Special Tests', 'تاقیکردنەوەکان'),
        subtitle: bi(
          'الاختبارات الاستفزازية التخصصية لمناطق المفاصل التسع',
          'Provocative orthopedic tests across 9 joint regions'
        ),
        icon: <Stethoscope className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />,
        hasData: tested.length > 0,
        lines,
      };
    }

    case 'gait_posture': {
      const gp = episodeStore.gaitPosture;
      const devCount = gp?.postureDeviations?.length || 0;
      const hasTug = gp?.tugSeconds !== null && gp?.tugSeconds !== undefined;
      const hasPattern = Boolean(gp && (gp.gaitPattern !== 'normal' || gp.assistiveDevice !== 'none'));
      const parts: string[] = [];
      if (hasTug) parts.push(`TUG: ${gp!.tugSeconds} ${bi('ث', 's', 'چ')}`);
      if (gp && gp.gaitPattern !== 'normal') {
        parts.push(bi(`النمط: ${gp.gaitPattern}`, `Gait: ${gp.gaitPattern}`));
      }
      if (gp && gp.assistiveDevice !== 'none') {
        parts.push(bi(`أداة مساعدة: ${gp.assistiveDevice}`, `Device: ${gp.assistiveDevice}`));
      }
      if (devCount > 0) {
        parts.push(bi(`${devCount} ملاحظات قوام`, `${devCount} posture findings`));
      }
      return {
        key,
        title: bi('تقييم المشي والقوام (TUG)', 'Gait & Posture Assessment', 'ڕۆیشتن و وەستان'),
        shortTitle: bi('المشي والقوام', 'Gait & Posture', 'ڕۆیشتن'),
        subtitle: bi(
          'اختبار TUG ونمط المشي وانحرافات القوام',
          'TUG timing, gait pattern & posture observations'
        ),
        icon: <Footprints className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        hasData: Boolean(hasTug || devCount > 0 || hasPattern),
        lines: parts.length > 0 ? [{ text: parts.join(' · ') }] : [],
      };
    }

    case 'functional_scales': {
      const fs = episodeStore.functionalScales;
      const perfTests = episodeStore.performanceTests || [];
      const hasRaw = Boolean(fs && typeof fs.rawScore === 'number');
      const histCount = fs?.history?.length || 0;
      const lines: SummaryLine[] = [];
      if (hasRaw && fs) {
        lines.push({
          text: `${fs.scaleId.toUpperCase()} · ${fs.scorePercentage}% (${bi(fs.severityLabelAr, fs.severityLabelEn)})`,
          tone: 'primary',
        });
      } else if (histCount > 0) {
        lines.push({
          text: bi(`القراءات المحفوظة: ${histCount}`, `Logged scores: ${histCount}`),
        });
      }
      if (perfTests.length > 0) {
        const latestPerf = perfTests[0];
        const extra = perfTests.length > 1 ? ` (+${perfTests.length - 1})` : '';
        lines.push({
          text: `${latestPerf.testId.toUpperCase()}: ${latestPerf.computedValue} ${latestPerf.unit}${extra}`,
        });
      }
      return {
        key,
        title: bi('المقاييس الوظيفية واختبارات الأداء', 'Outcome Measures & Performance Tests', 'پێوەرە فەرمانییەکان'),
        shortTitle: bi('المقاييس الوظيفية', 'Scales & Perf', 'پێوەرەکان'),
        subtitle: bi(
          'حسابات المقاييس المعتمدة ومؤشرات التناظر والأداء',
          'Outcome scores, MCID tracking & performance tests'
        ),
        icon: <FileCheck className="size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />,
        hasData: hasRaw || histCount > 0 || perfTests.length > 0,
        lines,
      };
    }

    case 'vitals': {
      const v = episodeStore.objective?.vitals;
      const hasVitals = Boolean(
        v &&
          (v.bpSystolic !== undefined ||
            v.bpDiastolic !== undefined ||
            v.heartRateBpm !== undefined ||
            v.spO2Percent !== undefined)
      );
      const vitalsParts = v
        ? [
            v.bpSystolic !== undefined && v.bpDiastolic !== undefined
              ? `BP ${v.bpSystolic}/${v.bpDiastolic}`
              : v.bpSystolic !== undefined
                ? `SBP ${v.bpSystolic}`
                : null,
            v.heartRateBpm !== undefined ? `HR ${v.heartRateBpm}` : null,
            v.spO2Percent !== undefined ? `SpO2 ${v.spO2Percent}%` : null,
          ].filter(Boolean)
        : [];
      const alerts = v ? evaluateVitalsAgainstThresholds(v, vitalsThresholds) : [];
      const lines: SummaryLine[] = [];
      if (vitalsParts.length > 0) {
        lines.push({ text: vitalsParts.join(' · '), ltr: true });
      }
      if (alerts.length > 0) {
        lines.push({
          text: alerts
            .map((a) => (language === 'en' ? a.labelEn : language === 'ckb' ? a.labelCkb : a.labelAr))
            .join(' · '),
          tone: 'danger',
        });
      }
      return {
        key,
        title: bi('العلامات الحيوية (BP · HR · SpO2)', 'Episode Vitals (BP · HR · SpO2)', 'نیشانە زیندەییەکان'),
        shortTitle: bi('العلامات الحيوية', 'Vitals', 'نیشانە زیندەییەکان'),
        subtitle: bi(
          'الضغط، النبض، ونسبة الأكسجة مع التنبيهات السريرية',
          'Blood pressure, heart rate, and oxygen saturation'
        ),
        icon: <HeartPulse className="size-4 text-rose-600 shrink-0" />,
        hasData: hasVitals,
        lines,
      };
    }

    case 'problems': {
      const problems = episodeStore.problemList || [];
      const goals = episodeStore.outcomeGoals || [];
      const lines: SummaryLine[] = [];
      if (problems.length > 0) {
        const pPreview = problems.slice(0, 2).map((p) => p.text).join(' · ');
        const extra = problems.length > 2 ? ` (+${problems.length - 2})` : '';
        lines.push({
          label: bi(`المشكلات (${problems.length})`, `Problems (${problems.length})`),
          text: `${pPreview}${extra}`,
        });
      }
      if (goals.length > 0) {
        const gPreview = goals.slice(0, 2).map((g) => g.title).join(' · ');
        const extra = goals.length > 2 ? ` (+${goals.length - 2})` : '';
        lines.push({
          label: bi(`الأهداف (${goals.length})`, `Goals (${goals.length})`),
          text: `${gPreview}${extra}`,
          tone: 'primary',
        });
      }
      return {
        key,
        title: bi('قائمة المشكلات والأهداف العلاجية', 'Problem List & Outcome Goals', 'کێشە و ئامانجەکان'),
        shortTitle: bi('المشكلات والأهداف', 'Problems & Goals', 'کێشە و ئامانجەکان'),
        subtitle: bi(
          'ربط القيود الوظيفية بالنتائج المستهدفة (MCID)',
          'Functional limitations linked to target scores'
        ),
        icon: <ListChecks className="size-4 text-primary shrink-0" />,
        hasData: problems.length > 0 || goals.length > 0,
        lines,
      };
    }

    default: {
      const customDef = customDefinitions.find((cd) => cd.id === key);
      const dataObj = episodeStore.customWidgetsData?.[key] || {};
      const entries = Object.entries(dataObj).filter(
        ([, v]) => v !== undefined && v !== null && String(v).trim() !== ''
      );
      const title = customDef
        ? bi(customDef.titleAr, customDef.titleEn)
        : bi('فحص سريري مخصص', 'Custom Clinical Test', 'پشکنینی کلینیکی تایبەت');
      return {
        key,
        title,
        shortTitle: title,
        subtitle: customDef ? bi(customDef.descriptionAr, customDef.descriptionEn) : undefined,
        icon: <Sparkles className="size-4 text-fuchsia-600 dark:text-fuchsia-400 shrink-0" />,
        hasData: entries.length > 0,
        lines:
          entries.length > 0
            ? [{ text: bi(`${entries.length} حقول مسجلة`, `${entries.length} fields recorded`) }]
            : [],
      };
    }
  }
}
