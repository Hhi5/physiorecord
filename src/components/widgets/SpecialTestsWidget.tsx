// =======================================================================
// PhysioRecord — Orthopedic Provocative Special Tests Matrix Widget
// Concise clinical test names, joint filters, and positive/negative outcomes.
// =======================================================================

import React, { useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { OrthopedicSpecialTestItem, SpecialTestOutcome } from '../../types/clinicalWidgets';
import { resolveSpecialTestCanonical } from '../../data/clinicalToolkit/canonicalKeysCatalog';
import {
  buildCustomSpecialTestItem,
  validateCustomSpecialTestDraft,
  type SpecialTestSide,
} from '../../utils/specialTestsHelpers';
import { Check, AlertTriangle, XCircle, Plus, Search, Trash2 } from 'lucide-react';

interface SpecialTestsWidgetProps {
  value: OrthopedicSpecialTestItem[] | undefined;
  onChange: (updated: OrthopedicSpecialTestItem[]) => void;
  readOnly?: boolean;
}

type JointFilterId = 'all' | OrthopedicSpecialTestItem['joint'];

const JOINT_LABELS: Array<{ id: JointFilterId; ar: string; en: string }> = [
  { id: 'all', ar: 'الكل', en: 'All' },
  { id: 'shoulder', ar: 'الكتف', en: 'Shoulder' },
  { id: 'elbow_wrist', ar: 'المرفق والرسغ', en: 'Elbow & Wrist' },
  { id: 'cervical', ar: 'العنقية', en: 'Cervical' },
  { id: 'thoracic', ar: 'الصدرية', en: 'Thoracic' },
  { id: 'lumbar', ar: 'القطنية', en: 'Lumbar' },
  { id: 'si_joint', ar: 'الحوض والعجز', en: 'SI Joint' },
  { id: 'hip', ar: 'الورك', en: 'Hip' },
  { id: 'knee', ar: 'الركبة', en: 'Knee' },
  { id: 'ankle_foot', ar: 'الكاحل والقدم', en: 'Ankle & Foot' },
];

const MASTER_SPECIAL_TESTS: Omit<OrthopedicSpecialTestItem, 'outcome' | 'notes' | 'painScoreNrs'>[] = [
  // Shoulder (8)
  {
    id: 'st_neer',
    joint: 'shoulder',
    nameAr: 'علامة نير (Neer Impingement)',
    nameEn: 'Neer Impingement Sign',
    targetPathologyAr: 'اصطدام الكفة المدورة',
    targetPathologyEn: 'Subacromial impingement',
  },
  {
    id: 'st_hawkins',
    joint: 'shoulder',
    nameAr: 'اختبار هوكينز-كينيدي (Hawkins-Kennedy)',
    nameEn: 'Hawkins-Kennedy Test',
    targetPathologyAr: 'اصطدام الكفة المدورة',
    targetPathologyEn: 'Subacromial impingement',
  },
  {
    id: 'st_empty_can',
    joint: 'shoulder',
    nameAr: 'اختبار العلبة الفارغة (Jobe Empty Can)',
    nameEn: 'Empty Can (Jobe) Test',
    targetPathologyAr: 'الوتر فوق الشوكة (Supraspinatus)',
    targetPathologyEn: 'Supraspinatus tendon',
  },
  {
    id: 'st_drop_arm',
    joint: 'shoulder',
    nameAr: 'اختبار سقوط الذراع (Drop Arm)',
    nameEn: 'Drop Arm Test',
    targetPathologyAr: 'تمزق الكفة المدورة الكامل',
    targetPathologyEn: 'Full-thickness rotator cuff tear',
  },
  {
    id: 'st_speeds',
    joint: 'shoulder',
    nameAr: "اختبار سبيد (Speed's Test)",
    nameEn: "Speed's Test",
    targetPathologyAr: 'وتر العضلة ذات الرأسين',
    targetPathologyEn: 'Biceps long head tendinopathy',
  },
  {
    id: 'st_yergason',
    joint: 'shoulder',
    nameAr: "اختبار ييرغاسون (Yergason's)",
    nameEn: "Yergason's Test",
    targetPathologyAr: 'وتر ذات الرأسين والرباط المستعرض',
    targetPathologyEn: 'Biceps tendon & transverse ligament',
  },
  {
    id: 'st_apprehension',
    joint: 'shoulder',
    nameAr: 'اختبار التخوف الأمامي للكتف (Apprehension)',
    nameEn: 'Anterior Apprehension Test',
    targetPathologyAr: 'عدم ثبات الكتف الأمامي',
    targetPathologyEn: 'Anterior glenohumeral instability',
  },
  {
    id: 'st_obrien',
    joint: 'shoulder',
    nameAr: "اختبار أوبراين (O'Brien Active Compression)",
    nameEn: "O'Brien Active Compression Test",
    targetPathologyAr: 'آفة الشفا الحقاني SLAP / المفصل الأخرمي',
    targetPathologyEn: 'SLAP lesion & AC joint',
  },

  // Elbow & Wrist (6)
  {
    id: 'st_cozen',
    joint: 'elbow_wrist',
    nameAr: "اختبار كوزن (Cozen's Test)",
    nameEn: "Cozen's Test",
    targetPathologyAr: 'مرفق التنس (اللقيمة الوحشية)',
    targetPathologyEn: 'Lateral epicondylalgia',
  },
  {
    id: 'st_mills',
    joint: 'elbow_wrist',
    nameAr: "اختبار ميلز (Mill's Test)",
    nameEn: "Mill's Test",
    targetPathologyAr: 'مرفق التنس (اللقيمة الوحشية)',
    targetPathologyEn: 'Lateral epicondylalgia',
  },
  {
    id: 'st_golfers_elbow',
    joint: 'elbow_wrist',
    nameAr: 'اختبار مرفق لاعب الغولف (Medial Epicondylitis)',
    nameEn: "Golfer's Elbow Test",
    targetPathologyAr: 'التهاب اللقيمة الإنسي',
    targetPathologyEn: 'Medial epicondylalgia',
  },
  {
    id: 'st_phalen',
    joint: 'elbow_wrist',
    nameAr: "اختبار فالين (Phalen's Test)",
    nameEn: "Phalen's Test",
    targetPathologyAr: 'متلازمة النفق الرسغي',
    targetPathologyEn: 'Carpal tunnel syndrome',
  },
  {
    id: 'st_tinel_wrist',
    joint: 'elbow_wrist',
    nameAr: 'علامة تينل عند الرسغ (Tinel Sign)',
    nameEn: "Tinel's Sign at Wrist",
    targetPathologyAr: 'انضغاط العصب المتوسط',
    targetPathologyEn: 'Median nerve compression',
  },
  {
    id: 'st_finkelstein',
    joint: 'elbow_wrist',
    nameAr: 'اختبار فينكلشتاين (Finkelstein)',
    nameEn: "Finkelstein's Test",
    targetPathologyAr: 'التهاب غمد دي كيرفان',
    targetPathologyEn: "De Quervain's tenosynovitis",
  },

  // Cervical Spine (5)
  {
    id: 'st_spurling',
    joint: 'cervical',
    nameAr: 'اختبار سبورلنغ (Spurling Compression)',
    nameEn: "Spurling's Foraminal Compression",
    targetPathologyAr: 'اعتلال الجذور العصبية العنقية',
    targetPathologyEn: 'Cervical radiculopathy',
  },
  {
    id: 'st_cervical_distraction',
    joint: 'cervical',
    nameAr: 'اختبار الشد العنقي (Cervical Distraction)',
    nameEn: 'Cervical Distraction Test',
    targetPathologyAr: 'انضغاط الجذور العنقية',
    targetPathologyEn: 'Cervical nerve root compression',
  },
  {
    id: 'st_ultt1',
    joint: 'cervical',
    nameAr: 'شد الطرف العلوي (ULTT1 - Median)',
    nameEn: 'Upper Limb Tension Test (ULTT1)',
    targetPathologyAr: 'حساسية العصب المتوسط',
    targetPathologyEn: 'Median nerve mechanosensitivity',
  },
  {
    id: 'st_bakody',
    joint: 'cervical',
    nameAr: 'علامة باكوودي (Shoulder Abduction Relief)',
    nameEn: "Bakody's Sign",
    targetPathologyAr: 'انضغاط الجذر العنقي C4–C6',
    targetPathologyEn: 'C4–C6 nerve root compression',
  },
  {
    id: 'st_sharp_purser',
    joint: 'cervical',
    nameAr: 'اختبار شارب-بورسر (Sharp-Purser)',
    nameEn: 'Sharp-Purser Test',
    targetPathologyAr: 'ثبات المفصل الفهقي المحوري (C1–C2)',
    targetPathologyEn: 'Atlantoaxial ligamentous stability',
  },

  // Thoracic Spine (2)
  {
    id: 'st_thoracic_spring',
    joint: 'thoracic',
    nameAr: 'اختبار النبض الصدري (Thoracic P-A Springing)',
    nameEn: 'Thoracic Springing (P-A Glide)',
    targetPathologyAr: 'حركية المفاصل الصدرية',
    targetPathologyEn: 'Thoracic facet segmental mobility',
  },
  {
    id: 'st_slump',
    joint: 'thoracic',
    nameAr: 'اختبار الانحناء العصبي (Slump Test)',
    nameEn: 'Slump Neurodynamic Test',
    targetPathologyAr: 'الشد السحائي والعصبي',
    targetPathologyEn: 'Dural & neural mechanosensitivity',
  },

  // Lumbar Spine (6)
  {
    id: 'st_slr',
    joint: 'lumbar',
    nameAr: 'رفع الساق المستقيمة (SLR / Lasègue)',
    nameEn: 'Straight Leg Raise (SLR)',
    targetPathologyAr: 'العصب الوركي L4–S1',
    targetPathologyEn: 'Sciatic nerve root irritation',
  },
  {
    id: 'st_crossed_slr',
    joint: 'lumbar',
    nameAr: 'رفع الساق المعاكس (Crossed SLR)',
    nameEn: 'Crossed Straight Leg Raise',
    targetPathologyAr: 'انزلاق غضروفي قطني ضاغط',
    targetPathologyEn: 'Space-occupying lumbar disc herniation',
  },
  {
    id: 'st_femoral_stretch',
    joint: 'lumbar',
    nameAr: 'تمدد العصب الفخذي (Prone Knee Bend)',
    nameEn: 'Femoral Nerve Stretch Test',
    targetPathologyAr: 'الجذور القطنية العليا L2–L4',
    targetPathologyEn: 'Upper lumbar radiculopathy (L2–L4)',
  },
  {
    id: 'st_prone_instability',
    joint: 'lumbar',
    nameAr: 'عدم الثبات القطني (Prone Instability)',
    nameEn: 'Prone Instability Test',
    targetPathologyAr: 'عدم الثبات الفقري القطني',
    targetPathologyEn: 'Lumbar segmental instability',
  },
  {
    id: 'st_kemp',
    joint: 'lumbar',
    nameAr: "اختبار كيمب / الربع القطني (Kemp's Quadrant)",
    nameEn: "Lumbar Quadrant (Kemp's) Test",
    targetPathologyAr: 'المفاصل الوجيهية وتضيق الثقبة',
    targetPathologyEn: 'Facet arthropathy & foraminal stenosis',
  },
  {
    id: 'st_hoover',
    joint: 'lumbar',
    nameAr: 'علامة هوفر (Hoover Sign)',
    nameEn: 'Hoover Sign',
    targetPathologyAr: 'تقييم ضعف الطرف السفلي',
    targetPathologyEn: 'Functional lower limb weakness',
  },

  // SI Joint & Pelvis (5)
  {
    id: 'st_faber',
    joint: 'si_joint',
    nameAr: "اختبار فابر (FABER / Patrick's)",
    nameEn: "FABER (Patrick's) Test",
    targetPathologyAr: 'المفصل العجزي الحرقفي / الورك',
    targetPathologyEn: 'SI joint & hip joint pathology',
  },
  {
    id: 'st_gaenslen',
    joint: 'si_joint',
    nameAr: "اختبار غينسلن (Gaenslen's)",
    nameEn: "Gaenslen's Test",
    targetPathologyAr: 'إجهاد المفصل العجزي الحرقفي',
    targetPathologyEn: 'Sacroiliac joint dysfunction',
  },
  {
    id: 'st_thigh_thrust',
    joint: 'si_joint',
    nameAr: 'الدفع الفخذي الخلفي (Thigh Thrust / POSH)',
    nameEn: 'Thigh Thrust Test',
    targetPathologyAr: 'استفزاز المفصل العجزي الحرقفي',
    targetPathologyEn: 'SI joint pain provocation',
  },
  {
    id: 'st_sacral_compression',
    joint: 'si_joint',
    nameAr: 'ضغط الحوض الجانبي (SI Compression)',
    nameEn: 'Sacral Compression Test',
    targetPathologyAr: 'المفصل العجزي الحرقفي',
    targetPathologyEn: 'SI joint provocation',
  },
  {
    id: 'st_sacral_thrust',
    joint: 'si_joint',
    nameAr: 'الدفع العجزي الأمامي (Sacral Thrust)',
    nameEn: 'Sacral Thrust Test',
    targetPathologyAr: 'المفصل العجزي الحرقفي',
    targetPathologyEn: 'SI joint provocation',
  },

  // Hip (5)
  {
    id: 'st_thomas',
    joint: 'hip',
    nameAr: 'اختبار توماس المعدّل (Modified Thomas)',
    nameEn: 'Modified Thomas Test',
    targetPathologyAr: 'قصر الحرقفية القطنية / المستقيمة الفخذية',
    targetPathologyEn: 'Iliopsoas & rectus femoris tightness',
  },
  {
    id: 'st_fadir',
    joint: 'hip',
    nameAr: 'اختبار فادير (FADIR Anterior Impingement)',
    nameEn: 'FADIR Test',
    targetPathologyAr: 'الاصطدام الفخذي الحقي FAI والشفا',
    targetPathologyEn: 'Femoroacetabular impingement & labrum',
  },
  {
    id: 'st_ober',
    joint: 'hip',
    nameAr: "اختبار أوبر (Ober's ITB)",
    nameEn: "Ober's Test",
    targetPathologyAr: 'شد الشريط الحرقفي الظنبوبي ITB',
    targetPathologyEn: 'Iliotibial band tightness',
  },
  {
    id: 'st_trendelenburg',
    joint: 'hip',
    nameAr: 'علامة تريندلنبورغ (Trendelenburg)',
    nameEn: 'Trendelenburg Sign',
    targetPathologyAr: 'ضعف العضلة الألوية الوسطى',
    targetPathologyEn: 'Gluteus medius insufficiency',
  },
  {
    id: 'st_hip_scour',
    joint: 'hip',
    nameAr: 'اختبار المسح المفصلي للورك (Hip Scour)',
    nameEn: 'Hip Scour Test',
    targetPathologyAr: 'خشونة الورك وتمزق الشفا',
    targetPathologyEn: 'Hip OA & labral pathology',
  },

  // Knee (7)
  {
    id: 'st_lachman',
    joint: 'knee',
    nameAr: 'اختبار لاكمان (Lachman)',
    nameEn: 'Lachman Test',
    targetPathologyAr: 'الرباط الصليبي الأمامي ACL',
    targetPathologyEn: 'Anterior cruciate ligament (ACL)',
  },
  {
    id: 'st_ant_drawer_knee',
    joint: 'knee',
    nameAr: 'السحب الأمامي للركبة (Anterior Drawer)',
    nameEn: 'Anterior Drawer Test (Knee)',
    targetPathologyAr: 'الرباط الصليبي الأمامي ACL',
    targetPathologyEn: 'Anterior cruciate ligament (ACL)',
  },
  {
    id: 'st_post_drawer_knee',
    joint: 'knee',
    nameAr: 'السحب الخلفي للركبة (Posterior Drawer)',
    nameEn: 'Posterior Drawer Test (Knee)',
    targetPathologyAr: 'الرباط الصليبي الخلفي PCL',
    targetPathologyEn: 'Posterior cruciate ligament (PCL)',
  },
  {
    id: 'st_valgus_stress',
    joint: 'knee',
    nameAr: 'إجهاد الأروح (Valgus Stress 0° / 30°)',
    nameEn: 'Valgus Stress Test',
    targetPathologyAr: 'الرباط الجانبي الإنسي MCL',
    targetPathologyEn: 'Medial collateral ligament (MCL)',
  },
  {
    id: 'st_varus_stress',
    joint: 'knee',
    nameAr: 'إجهاد الأفحج (Varus Stress 0° / 30°)',
    nameEn: 'Varus Stress Test',
    targetPathologyAr: 'الرباط الجانبي الوحشي LCL',
    targetPathologyEn: 'Lateral collateral ligament (LCL)',
  },
  {
    id: 'st_mcmurray',
    joint: 'knee',
    nameAr: "اختبار ماكموري (McMurray's)",
    nameEn: "McMurray's Test",
    targetPathologyAr: 'تمزق الغضروف الهلالي',
    targetPathologyEn: 'Meniscal tear',
  },
  {
    id: 'st_thessaly',
    joint: 'knee',
    nameAr: 'اختبار ثيسالي (Thessaly 20°)',
    nameEn: 'Thessaly Test (20°)',
    targetPathologyAr: 'الغضروف الهلالي بالتحميل',
    targetPathologyEn: 'Meniscal pathology',
  },

  // Ankle & Foot (6)
  {
    id: 'st_ant_drawer_ankle',
    joint: 'ankle_foot',
    nameAr: 'السحب الأمامي للكاحل (Anterior Drawer)',
    nameEn: 'Anterior Drawer Test (Ankle)',
    targetPathologyAr: 'الرباط الكاحلي الشظوي الأمامي ATFL',
    targetPathologyEn: 'ATFL lateral ankle sprain',
  },
  {
    id: 'st_talar_tilt',
    joint: 'ankle_foot',
    nameAr: 'إمالة الكاحل (Talar Tilt)',
    nameEn: 'Talar Tilt Test',
    targetPathologyAr: 'الرباط العقبي الشظوي CFL',
    targetPathologyEn: 'CFL lateral ankle stability',
  },
  {
    id: 'st_ankle_squeeze',
    joint: 'ankle_foot',
    nameAr: 'عصر الساق (Syndesmotic Squeeze)',
    nameEn: 'Squeeze Test (High Ankle)',
    targetPathologyAr: 'المرتبط الظنبوبي الشظوي (Syndesmosis)',
    targetPathologyEn: 'Tibiofibular syndesmosis injury',
  },
  {
    id: 'st_thompson',
    joint: 'ankle_foot',
    nameAr: 'اختبار تومبسون (Thompson / Simmonds)',
    nameEn: 'Thompson Test',
    targetPathologyAr: 'انقطاع وتر أخيل',
    targetPathologyEn: 'Achilles tendon rupture',
  },
  {
    id: 'st_windlass',
    joint: 'ankle_foot',
    nameAr: 'اختبار اللفافة الأخمصية (Windlass)',
    nameEn: 'Windlass Test',
    targetPathologyAr: 'التهاب اللفافة الأخمصية',
    targetPathologyEn: 'Plantar fasciitis',
  },
  {
    id: 'st_kleiger',
    joint: 'ankle_foot',
    nameAr: "اختبار كلايغر (Kleiger's External Rotation)",
    nameEn: "Kleiger's Test",
    targetPathologyAr: 'الأربطة الدالية / التواء الكاحل العالي',
    targetPathologyEn: 'Deltoid ligament & syndesmosis',
  },
];

export const SpecialTestsWidget: React.FC<SpecialTestsWidgetProps> = ({
  value = [],
  onChange,
  readOnly = false,
}) => {
  const { language, bi } = useLanguage();

  const [selectedJoint, setSelectedJoint] = useState<JointFilterId>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [customTestName, setCustomTestName] = useState('');
  const [showCustomCreator, setShowCustomCreator] = useState(false);
  const [customJoint, setCustomJoint] = useState<OrthopedicSpecialTestItem['joint']>('lumbar');
  const [customTargetStructure, setCustomTargetStructure] = useState('');
  const [customOutcome, setCustomOutcome] = useState<SpecialTestOutcome>('positive');
  const [customSide, setCustomSide] = useState<SpecialTestSide>('right');
  const [customValidationError, setCustomValidationError] = useState<string | null>(null);
  const customNameInputRef = useRef<HTMLInputElement | null>(null);

  const outcomeMap = useMemo(() => {
    const map = new Map<string, OrthopedicSpecialTestItem>();
    value.forEach((item) => map.set(item.id, item));
    return map;
  }, [value]);

  const customSavedTests = useMemo(() => {
    const builtInIds = new Set(MASTER_SPECIAL_TESTS.map((t) => t.id));
    return value.filter((item) => !builtInIds.has(item.id));
  }, [value]);

  const filteredMasterTests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return MASTER_SPECIAL_TESTS.filter((test) => {
      if (selectedJoint !== 'all' && test.joint !== selectedJoint) return false;
      if (!q) return true;
      return (
        test.nameAr.toLowerCase().includes(q) ||
        test.nameEn.toLowerCase().includes(q) ||
        test.targetPathologyAr.toLowerCase().includes(q) ||
        test.targetPathologyEn.toLowerCase().includes(q)
      );
    });
  }, [selectedJoint, searchTerm]);

  const handleSetOutcome = (
    template: Omit<OrthopedicSpecialTestItem, 'outcome' | 'notes' | 'painScoreNrs'>,
    outcome: SpecialTestOutcome
  ) => {
    if (readOnly) return;

    const existingIdx = value.findIndex((t) => t.id === template.id);
    const updated = [...value];

    if (existingIdx >= 0 && updated[existingIdx].outcome === outcome) {
      // Clicking the active outcome again toggles back to not tested (unless custom)
      if (MASTER_SPECIAL_TESTS.some((m) => m.id === template.id)) {
        updated.splice(existingIdx, 1);
      } else {
        updated[existingIdx] = { ...updated[existingIdx], outcome: 'not_tested' };
      }
      onChange(updated);
      return;
    }

    const resolved = resolveSpecialTestCanonical(template);
    const newItem: OrthopedicSpecialTestItem = {
      ...template,
      canonicalKey: resolved.canonicalKey,
      label: resolved.label,
      outcome,
      notes: existingIdx >= 0 ? updated[existingIdx].notes : undefined,
      painScoreNrs: existingIdx >= 0 ? updated[existingIdx].painScoreNrs : undefined,
    };

    if (existingIdx >= 0) {
      updated[existingIdx] = newItem;
    } else {
      updated.push(newItem);
    }

    onChange(updated);
  };

  const handleAddCustomTest = () => {
    if (readOnly) return;
    const validation = validateCustomSpecialTestDraft({ name: customTestName });
    if (!validation.valid) {
      if (!showCustomCreator) {
        setCustomJoint(selectedJoint === 'all' ? 'lumbar' : selectedJoint);
        setShowCustomCreator(true);
        setCustomValidationError(null);
      } else {
        setCustomValidationError(
          bi(
            validation.reasonAr || 'يرجى كتابة اسم الاختبار العظمي قبل الإضافة.',
            validation.reasonEn || 'Please enter the orthopedic test name before adding.'
          )
        );
      }
      requestAnimationFrame(() => customNameInputRef.current?.focus());
      return;
    }

    const targetJoint: OrthopedicSpecialTestItem['joint'] = showCustomCreator
      ? customJoint
      : selectedJoint === 'all'
      ? 'lumbar'
      : selectedJoint;

    const customItem = buildCustomSpecialTestItem(
      {
        name: customTestName,
        joint: targetJoint,
        targetStructure: customTargetStructure,
        outcome: customOutcome,
        side: showCustomCreator ? customSide : undefined,
      },
      language
    );
    onChange([...value, customItem]);
    setCustomTestName('');
    setCustomTargetStructure('');
    setCustomValidationError(null);
    setShowCustomCreator(false);
  };

  const handleRemoveCustomTest = (id: string) => {
    if (readOnly) return;
    onChange(value.filter((item) => item.id !== id));
  };

  const testedCount = value.filter((item) => item.outcome !== 'not_tested').length;
  const positiveCount = value.filter(
    (item) => item.outcome === 'positive' || item.outcome === 'pain_reproduced'
  ).length;

  return (
    <div className="space-y-4">
      {/* Header Summary + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-foreground">
            {bi(
              `الفحوصات الموثقة: ${testedCount}`,
              `Documented Tests: ${testedCount}`,
              `تاقیکردنەوە تۆمارکراوەکان: ${testedCount}`
            )}
          </span>
          {positiveCount > 0 && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
              {bi(
                `${positiveCount} إيجابي`,
                `${positiveCount} Positive`,
                `${positiveCount} پۆزەتیڤ`
              )}
            </span>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-muted-foreground-2 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={bi(
              'ابحث باسم الفحص أو البنية...',
              'Search test or structure...',
              'گەڕان بە ناوی تاقیکردنەوە یان پێکهاتە...'
            )}
            className="w-full ps-8 pe-3 py-1.5 text-xs bg-layer border border-layer-line rounded-xl text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Joint Filter Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {JOINT_LABELS.map((j) => {
          const isActive = selectedJoint === j.id;
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => setSelectedJoint(j.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-layer text-muted-foreground-1 border border-layer-line hover:bg-layer-hover hover:text-foreground'
              }`}
            >
              {bi(j.ar, j.en)}
            </button>
          );
        })}
      </div>

      {/* Quick Custom Special Test Input + Interactive Form */}
      {!readOnly && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={customNameInputRef}
              type="text"
              value={customTestName}
              onChange={(e) => {
                setCustomTestName(e.target.value);
                if (customValidationError) setCustomValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomTest();
                }
              }}
              placeholder={bi(
                'إضافة فحص تخصصي غير مدرج (اكتب الاسم أو اضغط + لفتح النموذج)...',
                'Add unlisted special test (type name or click +)...',
                'زیادکردنی تاقیکردنەوەی تایبەتی نوێ (ناو بنووسە یان کرتە لە + بکە)...'
              )}
              className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-layer border border-layer-line rounded-xl text-foreground placeholder:text-muted-foreground-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={handleAddCustomTest}
              className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold inline-flex items-center gap-1 shadow-2xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{bi('إضافة', 'Add', 'زیادکردن')}</span>
            </button>
          </div>

          {customValidationError && (
            <div
              role="alert"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-700 dark:text-rose-300"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{customValidationError}</span>
            </div>
          )}

          {showCustomCreator && (
            <div className="p-3 rounded-xl bg-layer border border-primary/30 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    {bi('المنطقة المفصلية:', 'Joint Region:', 'ناوچەی جومگە:')}
                  </label>
                  <select
                    value={customJoint}
                    onChange={(e) =>
                      setCustomJoint(e.target.value as OrthopedicSpecialTestItem['joint'])
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-layer-line text-xs text-foreground"
                  >
                    {JOINT_LABELS.filter((j) => j.id !== 'all').map((j) => (
                      <option key={j.id} value={j.id}>
                        {bi(j.ar, j.en)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    {bi('البنية المستهدفة (اختياري):', 'Target Structure (Optional):', 'پێکهاتەی ئامانج (بژاردەیی):')}
                  </label>
                  <input
                    type="text"
                    value={customTargetStructure}
                    onChange={(e) => setCustomTargetStructure(e.target.value)}
                    placeholder={bi(
                      'مثال: الغضروف الهلالي / جذر العصب',
                      'e.g. Meniscus / Nerve root',
                      'بۆ نموونە: مێنیسکەس / ڕەگی دەمار'
                    )}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-layer-line text-xs text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    {bi('النتيجة:', 'Outcome:', 'ئەنجام:')}
                  </label>
                  <select
                    value={customOutcome}
                    onChange={(e) => setCustomOutcome(e.target.value as SpecialTestOutcome)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-layer-line text-xs text-foreground"
                  >
                    <option value="positive">{bi('إيجابي (+)', 'Positive (+)', 'پۆزەتیڤ (+)')}</option>
                    <option value="negative">{bi('سلبي (-)', 'Negative (-)', 'نێگەتیڤ (-)')}</option>
                    <option value="pain_reproduced">
                      {bi('استثارة الألم', 'Pain Reproduced', 'دروستبوونەوەی ئازار')}
                    </option>
                    <option value="inconclusive">{bi('غير حاسم', 'Inconclusive', 'یەکلاکەرەوە نییە')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    {bi('الجهة:', 'Side:', 'لا:')}
                  </label>
                  <select
                    value={customSide}
                    onChange={(e) => setCustomSide(e.target.value as SpecialTestSide)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-card border border-layer-line text-xs text-foreground"
                  >
                    <option value="right">{bi('يمين', 'Right', 'ڕاست')}</option>
                    <option value="left">{bi('يسار', 'Left', 'چەپ')}</option>
                    <option value="bilateral">{bi('ثنائي الجانب', 'Bilateral', 'هەردوو لا')}</option>
                    <option value="midline">{bi('منتصف الخط', 'Midline', 'هێڵی ناوەڕاست')}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomCreator(false);
                    setCustomValidationError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-layer-line bg-card text-xs font-semibold text-foreground cursor-pointer"
                >
                  {bi('إلغاء', 'Cancel', 'هەڵوەشاندنەوە')}
                </button>
                <button
                  type="button"
                  onClick={handleAddCustomTest}
                  className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-bold cursor-pointer"
                >
                  {bi('حفظ الاختبار', 'Save Test', 'پاشەکەوتکردنی تاقیکردنەوە')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Saved Tests */}
      {customSavedTests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {customSavedTests.map((test) => (
            <SpecialTestRowCard
              key={test.id}
              test={test}
              currentOutcome={test.outcome}
              readOnly={readOnly}
              onSelectOutcome={(outcome) => handleSetOutcome(test, outcome)}
              onRemoveCustom={() => handleRemoveCustomTest(test.id)}
            />
          ))}
        </div>
      )}

      {/* Built-In Orthopedic Tests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filteredMasterTests.map((test) => {
          const currentOutcome = outcomeMap.get(test.id)?.outcome || 'not_tested';
          return (
            <SpecialTestRowCard
              key={test.id}
              test={test}
              currentOutcome={currentOutcome}
              readOnly={readOnly}
              onSelectOutcome={(outcome) => handleSetOutcome(test, outcome)}
            />
          );
        })}
      </div>

      {filteredMasterTests.length === 0 && (
        <p className="text-xs text-muted-foreground-2 py-4 text-center">
          {bi('لا توجد فحوصات مطابقة للبحث.', 'No matching special tests found.', 'هیچ تاقیکردنەوەیەکی گونجاو نەدۆزرایەوە.')}
        </p>
      )}
    </div>
  );
};

interface SpecialTestRowCardProps {
  test: Omit<OrthopedicSpecialTestItem, 'outcome' | 'notes' | 'painScoreNrs'>;
  currentOutcome: SpecialTestOutcome;
  readOnly: boolean;
  onSelectOutcome: (outcome: SpecialTestOutcome) => void;
  onRemoveCustom?: () => void;
}

const SpecialTestRowCard: React.FC<SpecialTestRowCardProps> = ({
  test,
  currentOutcome,
  readOnly,
  onSelectOutcome,
  onRemoveCustom,
}) => {
  const { bi } = useLanguage();

  return (
    <div
      className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
        currentOutcome === 'positive'
          ? 'bg-rose-500/5 border-rose-500/40'
          : currentOutcome === 'pain_reproduced'
            ? 'bg-amber-500/5 border-amber-500/40'
            : currentOutcome === 'negative'
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-surface border-line-2'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground">
            {bi(test.nameAr, test.nameEn)}
          </div>
        </div>
        {onRemoveCustom && !readOnly && (
          <button
            type="button"
            onClick={onRemoveCustom}
            aria-label={bi('حذف الفحص', 'Remove test', 'سڕینەوەی تاقیکردنەوە')}
            className="p-1 rounded-lg text-muted-foreground-2 hover:text-rose-600 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Outcome Pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onSelectOutcome('positive')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            currentOutcome === 'positive'
              ? 'bg-rose-600 text-white shadow-2xs'
              : 'bg-layer hover:bg-rose-500/10 text-muted-foreground-1 border border-line-2'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>{bi('إيجابي (+)', 'Positive (+)', 'پۆزەتیڤ (+)')}</span>
        </button>

        <button
          type="button"
          disabled={readOnly}
          onClick={() => onSelectOutcome('pain_reproduced')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            currentOutcome === 'pain_reproduced'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-layer hover:bg-amber-500/10 text-muted-foreground-1 border border-line-2'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>{bi('ألم مألوف', 'Pain', 'ئازاری ناسراو')}</span>
        </button>

        <button
          type="button"
          disabled={readOnly}
          onClick={() => onSelectOutcome('negative')}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
            currentOutcome === 'negative'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-layer hover:bg-emerald-500/10 text-muted-foreground-1 border border-line-2'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          <span>{bi('سلبي (-)', 'Negative (-)', 'نێگەتیڤ (-)')}</span>
        </button>
      </div>
    </div>
  );
};
