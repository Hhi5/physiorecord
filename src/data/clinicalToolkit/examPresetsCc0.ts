// =======================================================================
// PhysioRecord — One-Tap Regional Exam Presets (Phase B1 — CC0-1.0)
// Original clinical starter configurations for 11 physiotherapy domains.
// Users may customize presets and share/import pure JSON preset packs.
// =======================================================================

import type {
  EpisodeScopedClinicalStore,
  RegionalExamPresetDefinition,
} from '../../types/clinicManagement';
import type { MmtMeasurementEntry, RomMeasurementEntry } from '../../types/clinical';
import type {
  FunctionalScaleEntry,
  OrthopedicSpecialTestItem,
} from '../../types/clinicalWidgets';
import { OUTCOME_INSTRUMENTS } from '../../utils/outcomeMeasures';
import {
  MMT_MUSCLE_GROUPS_CATALOG,
  ROM_JOINTS_CATALOG,
} from './romMmtCatalog';

interface PresetSpecialTestTemplate {
  id: string;
  joint: OrthopedicSpecialTestItem['joint'];
  nameAr: string;
  nameEn: string;
  targetPathologyAr: string;
  targetPathologyEn: string;
}

const PRESET_SPECIAL_TESTS_BY_ID: Record<string, PresetSpecialTestTemplate> = {
  st_spurling: {
    id: 'st_spurling',
    joint: 'cervical',
    nameAr: 'اختبار سبيرلينغ (Spurling Compression)',
    nameEn: "Spurling's Compression Test",
    targetPathologyAr: 'اعتلال الجذور العصبية العنقية',
    targetPathologyEn: 'Cervical radiculopathy',
  },
  st_cervical_distraction: {
    id: 'st_cervical_distraction',
    joint: 'cervical',
    nameAr: 'اختبار الشد العنقي (Cervical Distraction)',
    nameEn: 'Cervical Distraction Test',
    targetPathologyAr: 'تخفيف انضغاط الجذور العنقية',
    targetPathologyEn: 'Cervical nerve root decompression',
  },
  st_ultt1: {
    id: 'st_ultt1',
    joint: 'cervical',
    nameAr: 'اختبار شد العصب الوسطي (ULTT1)',
    nameEn: 'Upper Limb Tension Test 1 (Median)',
    targetPathologyAr: 'حساسية الأعصاب الطرفية للطرف العلوي',
    targetPathologyEn: 'Upper extremity neural mechanosensitivity',
  },
  st_slr: {
    id: 'st_slr',
    joint: 'lumbar',
    nameAr: 'اختبار رفع الساق المستقيمة (SLR / Lasègue)',
    nameEn: 'Straight Leg Raise (SLR)',
    targetPathologyAr: 'تهيج الجذور العصبية القطنية والعصب الوركي',
    targetPathologyEn: 'Lumbar nerve root / sciatic irritation',
  },
  st_slump: {
    id: 'st_slump',
    joint: 'lumbar',
    nameAr: 'اختبار الانحناء العصبي (Slump Test)',
    nameEn: 'Slump Neurodynamic Test',
    targetPathologyAr: 'الحساسية الميكانيكية العصبية الشوكية',
    targetPathologyEn: 'Dural / neural tension sensitivity',
  },
  st_kemp: {
    id: 'st_kemp',
    joint: 'lumbar',
    nameAr: 'اختبار كيمب للربع القطني (Kemp Quadrant)',
    nameEn: "Kemp's Lumbar Quadrant Test",
    targetPathologyAr: 'تهيج المفاصل الوجيهية القطنية أو التضيق الجانبي',
    targetPathologyEn: 'Lumbar facet / lateral recess provocation',
  },
  st_neer: {
    id: 'st_neer',
    joint: 'shoulder',
    nameAr: 'علامة نير (Neer Impingement)',
    nameEn: 'Neer Impingement Sign',
    targetPathologyAr: 'متلازمة الانحشار تحت الأخرم',
    targetPathologyEn: 'Subacromial pain / impingement',
  },
  st_hawkins: {
    id: 'st_hawkins',
    joint: 'shoulder',
    nameAr: 'اختبار هوكينز-كينيدي (Hawkins-Kennedy)',
    nameEn: 'Hawkins-Kennedy Test',
    targetPathologyAr: 'الكفة المدورة تحت الأخرم',
    targetPathologyEn: 'Subacromial rotator cuff',
  },
  st_empty_can: {
    id: 'st_empty_can',
    joint: 'shoulder',
    nameAr: 'اختبار العلبة الفارغة (Jobe Empty Can)',
    nameEn: 'Empty Can (Jobe) Test',
    targetPathologyAr: 'وتر فوق الشوكة (Supraspinatus)',
    targetPathologyEn: 'Supraspinatus tendon',
  },
  st_cozen: {
    id: 'st_cozen',
    joint: 'elbow_wrist',
    nameAr: 'اختبار كوزين (Cozen Test)',
    nameEn: "Cozen's Resistive Test",
    targetPathologyAr: 'التهاب اللقيمة الوحشية (مرفق التنس)',
    targetPathologyEn: 'Lateral epicondylalgia',
  },
  st_phalen: {
    id: 'st_phalen',
    joint: 'elbow_wrist',
    nameAr: 'اختبار فالين (Phalen Test)',
    nameEn: "Phalen's Maneuver",
    targetPathologyAr: 'متلازمة النفق الرسغي (العصب الوسطي)',
    targetPathologyEn: 'Carpal tunnel / median nerve',
  },
  st_finkelstein: {
    id: 'st_finkelstein',
    joint: 'elbow_wrist',
    nameAr: 'اختبار فينكلشتاين (Finkelstein)',
    nameEn: "Finkelstein's / Eichhoff Test",
    targetPathologyAr: 'التهاب غمد وتر دي كورفان',
    targetPathologyEn: "De Quervain's tenosynovitis",
  },
  st_faber: {
    id: 'st_faber',
    joint: 'hip',
    nameAr: 'اختبار فابر / باتريك (FABER)',
    nameEn: 'FABER (Patrick) Test',
    targetPathologyAr: 'مفصل الورك أو المفصل العجزي الحرقفي',
    targetPathologyEn: 'Hip intra-articular / SI joint',
  },
  st_fadir: {
    id: 'st_fadir',
    joint: 'hip',
    nameAr: 'اختبار فادير (FADIR)',
    nameEn: 'FADIR Impingement Test',
    targetPathologyAr: 'الاصطدام الفخذي الحقي والشفا الوركي',
    targetPathologyEn: 'Femoroacetabular impingement / labral provocation',
  },
  st_trendelenburg: {
    id: 'st_trendelenburg',
    joint: 'hip',
    nameAr: 'علامة تريندلينبورغ (Trendelenburg)',
    nameEn: 'Trendelenburg Sign',
    targetPathologyAr: 'ضعف العضلة الألوية الوسطى ومثبتات الورك',
    targetPathologyEn: 'Hip abductor (gluteus medius) insufficiency',
  },
  st_lachman: {
    id: 'st_lachman',
    joint: 'knee',
    nameAr: 'اختبار لاكمان (Lachman Test)',
    nameEn: 'Lachman Test',
    targetPathologyAr: 'الرباط الصليبي الأمامي (ACL)',
    targetPathologyEn: 'Anterior cruciate ligament (ACL)',
  },
  st_mcmurray: {
    id: 'st_mcmurray',
    joint: 'knee',
    nameAr: 'اختبار ماكموري (McMurray Test)',
    nameEn: 'McMurray Meniscal Test',
    targetPathologyAr: 'الغضروف الهلالي للركبة',
    targetPathologyEn: 'Knee meniscus',
  },
  st_valgus_stress: {
    id: 'st_valgus_stress',
    joint: 'knee',
    nameAr: 'اختبار إجهاد الفالجس (Valgus Stress)',
    nameEn: 'Valgus Stress Test (MCL)',
    targetPathologyAr: 'الرباط الجانبي الإنسي للركبة (MCL)',
    targetPathologyEn: 'Medial collateral ligament (MCL)',
  },
  st_ant_drawer_ankle: {
    id: 'st_ant_drawer_ankle',
    joint: 'ankle_foot',
    nameAr: 'اختبار السحب الأمامي للكاحل (Anterior Drawer)',
    nameEn: 'Ankle Anterior Drawer Test',
    targetPathologyAr: 'الرباط الكاحلي الشظوي الأمامي (ATFL)',
    targetPathologyEn: 'Anterior talofibular ligament (ATFL)',
  },
  st_talar_tilt: {
    id: 'st_talar_tilt',
    joint: 'ankle_foot',
    nameAr: 'اختبار إمالة الكاحل (Talar Tilt)',
    nameEn: 'Talar Tilt Test',
    targetPathologyAr: 'الرباط العقبي الشظوي (CFL) والدلتويد',
    targetPathologyEn: 'Calcaneofibular / deltoid ligament integrity',
  },
  st_thompson: {
    id: 'st_thompson',
    joint: 'ankle_foot',
    nameAr: 'اختبار تومبسون (Thompson / Simmonds)',
    nameEn: 'Thompson Squeeze Test',
    targetPathologyAr: 'سلامة وتر أخيل (Achilles Tendon)',
    targetPathologyEn: 'Achilles tendon continuity',
  },
};

function findJointMovements(
  jointId: string,
  movementIds: string[],
  side: 'right' | 'left' | 'bilateral' | 'midline'
): RegionalExamPresetDefinition['romStarters'] {
  const joint = ROM_JOINTS_CATALOG.find((j) => j.jointId === jointId);
  if (!joint) return [];
  return movementIds
    .map((mId) => joint.movements.find((m) => m.movementId === mId))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({
      jointId: joint.jointId,
      jointNameAr: joint.nameAr,
      jointNameEn: joint.nameEn,
      movementId: m.movementId,
      movementNameAr: m.nameAr,
      movementNameEn: m.nameEn,
      side,
    }));
}

function findMmtGroups(
  groupIds: string[],
  side: 'right' | 'left' | 'bilateral' | 'midline'
): RegionalExamPresetDefinition['mmtStarters'] {
  return groupIds
    .map((gId) => MMT_MUSCLE_GROUPS_CATALOG.find((m) => m.muscleGroupId === gId))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .map((g) => ({
      muscleGroupId: g.muscleGroupId,
      muscleGroupNameAr: g.nameAr,
      muscleGroupNameEn: g.nameEn,
      side,
    }));
}

export const BUILT_IN_EXAM_PRESETS_CC0: RegionalExamPresetDefinition[] = [
  {
    id: 'preset_neck',
    regionId: 'neck',
    titleAr: 'الرقبة والعمود العنقي',
    titleCkb: 'مل و بڕبڕەی مل',
    titleEn: 'Neck / Cervical',
    summaryAr: 'مدى حركة العنقية، قوة عضلات الرقبة، فحص الجذور العصبية، ومقياس NDI.',
    summaryEn: 'Cervical ROM, deep neck/shoulder girdle strength, neural screen, and NDI.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'neuro', 'special_tests', 'functional_scales'],
    romStarters: findJointMovements(
      'cervical_spine',
      ['flexion', 'extension', 'rotation_right', 'rotation_left'],
      'midline'
    ),
    mmtStarters: findMmtGroups(['cervical_flexors', 'shoulder_abductors'], 'bilateral'),
    specialTestIds: ['st_spurling', 'st_cervical_distraction', 'st_ultt1'],
    recommendedScaleId: 'ndi',
    redFlagRegionId: 'cervical_craniovertebral',
    redFlagReminderAr:
      'افحص علامات اعتلال النخاع العنقي واضطرابات الشرايين القاعدية قبل المناورات العنيقة.',
    redFlagReminderEn:
      'Screen cervical myelopathy & vascular flags before high-velocity or end-range neck techniques.',
  },
  {
    id: 'preset_low_back',
    regionId: 'low_back',
    titleAr: 'أسفل الظهر والحوض',
    titleCkb: 'خوارەوەی پشت و حەوز',
    titleEn: 'Low Back / Lumbar',
    summaryAr: 'مدى حركة القطنية، فحص SLR/Slump، التقييم العصبي السفلي، ومقياس ODI.',
    summaryEn: 'Lumbar ROM, lower-limb neuro/myotome screen, SLR/Slump tests, and ODI.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'neuro', 'special_tests', 'functional_scales'],
    romStarters: findJointMovements(
      'lumbar_spine',
      ['flexion', 'extension', 'lateral_flexion_right', 'lateral_flexion_left'],
      'midline'
    ),
    mmtStarters: findMmtGroups(['hip_flexors', 'knee_extensors', 'ankle_dorsiflexors'], 'bilateral'),
    specialTestIds: ['st_slr', 'st_slump', 'st_kemp'],
    recommendedScaleId: 'odi',
    redFlagRegionId: 'lumbar_pelvis',
    redFlagReminderAr:
      'استبعد متلازمة ذيل الفرس (احتباس/سلس بولي أو خدر السرج) والضعف العصبي المترقي.',
    redFlagReminderEn:
      'Screen Cauda Equina signs (bladder/bowel/saddle anesthesia) and progressive motor loss.',
  },
  {
    id: 'preset_shoulder',
    regionId: 'shoulder',
    titleAr: 'الكتف',
    titleCkb: 'شان',
    titleEn: 'Shoulder',
    summaryAr: 'ثني وتبعيد ودوران الكتف، قوة الكفة المدورة، اختبارات الانحشار، و SPADI.',
    summaryEn: 'Shoulder elevation & rotation ROM, cuff strength, impingement tests, and SPADI.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'functional_scales'],
    romStarters: findJointMovements(
      'shoulder',
      ['flexion', 'abduction', 'internal_rotation', 'external_rotation'],
      'right'
    ),
    mmtStarters: findMmtGroups(['shoulder_abductors', 'shoulder_external_rotators'], 'right'),
    specialTestIds: ['st_neer', 'st_hawkins', 'st_empty_can'],
    recommendedScaleId: 'spadi',
    redFlagRegionId: 'upper_extremity',
    redFlagReminderAr:
      'انتبه للألم الصدري/الحشوي المحال أو النقص العصبي الوعائي الحاد في الطرف العلوي.',
    redFlagReminderEn:
      'Check for referred cardiopulmonary pain patterns or acute upper-limb neurovascular deficit.',
  },
  {
    id: 'preset_elbow_wrist_hand',
    regionId: 'elbow_wrist_hand',
    titleAr: 'المرفق والرسغ واليد',
    titleCkb: 'ئەنیشک و مەچەک و دەست',
    titleEn: 'Elbow / Wrist / Hand',
    summaryAr: 'مدى المرفق والكب/الاستلقاء والرسغ، قوة القبضة والرسغ، ومقياس QuickDASH.',
    summaryEn: 'Elbow & wrist ROM, forearm/wrist strength, provocative tests, and QuickDASH.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'functional_scales'],
    romStarters: [
      ...findJointMovements('elbow', ['flexion', 'extension', 'pronation', 'supination'], 'right'),
      ...findJointMovements('wrist', ['flexion', 'extension'], 'right'),
    ],
    mmtStarters: findMmtGroups(['elbow_flexors', 'elbow_extensors', 'wrist_extensors'], 'right'),
    specialTestIds: ['st_cozen', 'st_phalen', 'st_finkelstein'],
    recommendedScaleId: 'quickdash',
    redFlagRegionId: 'upper_extremity',
    redFlagReminderAr:
      'تأكد من سلامة التروية، غياب الكسر غير المشخص بعد السقوط، أو انضغاط العصب الحاد.',
    redFlagReminderEn:
      'Check distal perfusion, post-fall occult fracture tenderness (scaphoid), and acute palsy.',
  },
  {
    id: 'preset_hip',
    regionId: 'hip',
    titleAr: 'مفصل الورك',
    titleCkb: 'جومگەی حەوز و ران',
    titleEn: 'Hip',
    summaryAr: 'ثني وتبعيد ودوران الورك، العضلات المثبتة للحوض، المشية، ومقياس LEFS.',
    summaryEn: 'Hip flexion/rotation/abduction ROM, abductor strength, gait check, and LEFS.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements(
      'hip',
      ['flexion', 'extension', 'abduction', 'internal_rotation', 'external_rotation'],
      'right'
    ),
    mmtStarters: findMmtGroups(['hip_flexors', 'hip_abductors'], 'right'),
    specialTestIds: ['st_faber', 'st_fadir', 'st_trendelenburg'],
    recommendedScaleId: 'lefs',
    redFlagRegionId: 'lower_extremity',
    redFlagReminderAr:
      'استبعد الكسر الإجهادي لعنق الفخذ بعد السقوط، ألم الفخذ الليلي الشديد، أو الخثار الوريدي.',
    redFlagReminderEn:
      'Screen femoral neck stress/occult fracture, unexplained night pain, and DVT indicators.',
  },
  {
    id: 'preset_knee',
    regionId: 'knee',
    titleAr: 'مفصل الركبة',
    titleCkb: 'ئەژنۆ',
    titleEn: 'Knee',
    summaryAr: 'ثني وبسط الركبة، قوة الرباعية والخلفية، اختبارات الأربطة والهلالي، و LEFS.',
    summaryEn: 'Knee flexion/extension ROM, quad/hamstring MMT, ligament/meniscus tests, and LEFS.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements('knee', ['flexion', 'extension'], 'right'),
    mmtStarters: findMmtGroups(['knee_extensors', 'knee_flexors'], 'right'),
    specialTestIds: ['st_lachman', 'st_mcmurray', 'st_valgus_stress'],
    recommendedScaleId: 'lefs',
    redFlagRegionId: 'lower_extremity',
    redFlagReminderAr:
      'طبّق قواعد أوتاوا للركبة عند الرضوض الحادة واستبعد تورم الساق المصحوب بعلامات DVT.',
    redFlagReminderEn:
      'Apply Ottawa Knee Criteria for acute trauma and screen calf swelling/warmth for DVT.',
  },
  {
    id: 'preset_ankle_foot',
    regionId: 'ankle_foot',
    titleAr: 'الكاحل والقدم',
    titleCkb: 'قولەپێ و پێ',
    titleEn: 'Ankle / Foot',
    summaryAr: 'العطف الظهري والأخمصي والانقلاب، عضلات الساق، ثبات الأربطة، و LEFS.',
    summaryEn: 'Ankle dorsiflexion/plantarflexion/inversion ROM, ankle MMT, stability tests, and LEFS.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements(
      'ankle',
      ['dorsiflexion', 'plantarflexion', 'inversion', 'eversion'],
      'right'
    ),
    mmtStarters: findMmtGroups(['ankle_dorsiflexors', 'ankle_plantarflexors'], 'right'),
    specialTestIds: ['st_ant_drawer_ankle', 'st_talar_tilt', 'st_thompson'],
    recommendedScaleId: 'lefs',
    redFlagRegionId: 'lower_extremity',
    redFlagReminderAr:
      'استخدم قواعد أوتاوا للكاحل لاستبعاد الكسر وتأكد من التئام الجلد والتروية في القدم.',
    redFlagReminderEn:
      'Verify Ottawa Ankle Rules for fracture exclusion and assess skin/vascular perfusion.',
  },
  {
    id: 'preset_post_op',
    regionId: 'post_op',
    titleAr: 'التأهيل بعد العمليات الجراحية',
    titleCkb: 'شیاندنەوەی دوای نەشتەرگەری',
    titleEn: 'Post-Op Rehabilitation',
    summaryAr: 'متابعة المدى المبكر بعد الجراحة، التئام الجرح، التورم، والمقاييس التدريجية.',
    summaryEn: 'Post-surgical ROM milestones, wound/edema check, graded strength, and function.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements('knee', ['flexion', 'extension'], 'right'),
    mmtStarters: findMmtGroups(['knee_extensors', 'hip_abductors', 'ankle_dorsiflexors'], 'right'),
    specialTestIds: [],
    recommendedScaleId: 'psfs',
    redFlagRegionId: 'lower_extremity',
    redFlagReminderAr:
      'تحقق من علامات العدوى بموضع الجرح، التورم غير المتماثل، والقيود الزمنية لبروتوكول الجراح.',
    redFlagReminderEn:
      'Inspect incision for infection signs, screen calf for DVT, and respect surgeon weight/ROM precautions.',
  },
  {
    id: 'preset_neuro',
    regionId: 'neuro',
    titleAr: 'التأهيل العصبي',
    titleCkb: 'شیاندنەوەی دەماری',
    titleEn: 'Neurological Rehab',
    summaryAr: 'فحص القطاعات العضلية والحسية والمنعكسات، التوازن والمشية، واختبار TUG.',
    summaryEn: 'Myotome/dermatome & DTR screen, balance/gait analysis, and Timed Up & Go (TUG).',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'neuro', 'mmt', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements('ankle', ['dorsiflexion', 'plantarflexion'], 'bilateral'),
    mmtStarters: findMmtGroups(
      ['shoulder_abductors', 'hip_flexors', 'knee_extensors', 'ankle_dorsiflexors'],
      'bilateral'
    ),
    specialTestIds: [],
    recommendedScaleId: 'tug',
    redFlagRegionId: 'thoracic_systemic',
    redFlagReminderAr:
      'تأكد من ثبات الضغط ونسبة الأكسجين، علامات الجلطة الجديدة (FAST)، وسلامة التوازن منعاً للسقوط.',
    redFlagReminderEn:
      'Confirm hemodynamic stability, acute neurological decline signs, and fall-risk guarding.',
  },
  {
    id: 'preset_pediatric',
    regionId: 'pediatric',
    titleAr: 'تأهيل الأطفال',
    titleCkb: 'شیاندنەوەی منداڵان',
    titleEn: 'Pediatric Rehab',
    summaryAr: 'التطور الحركي، المشية والتوازن، تقييم مرن، والتنسيق مع ولي الأمر.',
    summaryEn: 'Developmental motor screen, gait/balance, child-friendly pain tracking & guardian consent.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements('ankle', ['dorsiflexion'], 'bilateral'),
    mmtStarters: findMmtGroups(['hip_abductors', 'knee_extensors', 'ankle_dorsiflexors'], 'bilateral'),
    specialTestIds: [],
    recommendedScaleId: 'psfs',
    redFlagRegionId: 'thoracic_systemic',
    redFlagReminderAr:
      'تحقق من توثيق بيانات وموافقة ولي الأمر الإلزامية (< 18 سنة) واستبعاد الكسور أو العدوى العظمية.',
    redFlagReminderEn:
      'Verify mandatory parent/guardian contact & consent (< 18 yrs) and screen acute limp/bone pain.',
  },
  {
    id: 'preset_sports',
    regionId: 'sports',
    titleAr: 'الإصابات الرياضية والعودة للعب',
    titleEn: 'Sports / Return-to-Play',
    titleCkb: 'پێکانە وەرزشییەکان',
    summaryAr: 'التناظر العضلي (LSI)، اختبارات ثبات الأربطة، القفز والأداء، ومقاييس العودة للرياضة.',
    summaryEn: 'Strength & Limb Symmetry (LSI), joint stability tests, gait/agility, and functional return.',
    license: 'CC0-1.0',
    isBuiltIn: true,
    widgetsToEnable: ['body_chart', 'rom', 'mmt', 'special_tests', 'gait_posture', 'functional_scales'],
    romStarters: findJointMovements('knee', ['flexion', 'extension'], 'bilateral'),
    mmtStarters: findMmtGroups(['hip_abductors', 'knee_extensors', 'knee_flexors'], 'bilateral'),
    specialTestIds: ['st_lachman', 'st_mcmurray', 'st_ant_drawer_ankle'],
    recommendedScaleId: 'psfs',
    redFlagRegionId: 'lower_extremity',
    redFlagReminderAr:
      'استبعد الارتجاج الدماغي الحاد بعد الاصطدام واستبعد الكسور أو انصباب المفصل الفوري.',
    redFlagReminderEn:
      'Screen concussion flags after head/contact trauma and acute fracture or hemarthrosis signs.',
  },
];

export function applyExamPresetToEpisodeStore(
  store: EpisodeScopedClinicalStore,
  preset: RegionalExamPresetDefinition
): EpisodeScopedClinicalStore {
  const existingWidgets = new Set(store.activeWidgetIds || []);
  for (const w of preset.widgetsToEnable) {
    existingWidgets.add(w);
  }

  const existingRom = store.objective?.romBattery?.entries || [];
  const existingRomKeys = new Set(
    existingRom.map((e) => `${e.jointId}::${e.movementId}::${e.laterality}`)
  );
  const appendedRom: RomMeasurementEntry[] = [];
  for (const starter of preset.romStarters) {
    const k = `${starter.jointId}::${starter.movementId}::${starter.side}`;
    if (!existingRomKeys.has(k)) {
      appendedRom.push({
        entryId: crypto.randomUUID(),
        canonicalKey: `rom.${starter.jointId}.${starter.movementId}.${starter.side}`,
        label: `${starter.jointNameEn} — ${starter.movementNameEn}`,
        jointId: starter.jointId,
        jointNameAr: starter.jointNameAr,
        jointNameEn: starter.jointNameEn,
        movementId: starter.movementId,
        movementNameAr: starter.movementNameAr,
        movementNameEn: starter.movementNameEn,
        movementType: 'AROM',
        laterality: starter.side,
        isTested: false,
        measuredAngleDegrees: null,
      });
      existingRomKeys.add(k);
    }
  }

  const existingMmt = store.objective?.mmtBattery?.entries || [];
  const existingMmtKeys = new Set(
    existingMmt.map((e) => `${e.muscleGroupId}::${e.laterality}`)
  );
  const appendedMmt: MmtMeasurementEntry[] = [];
  for (const starter of preset.mmtStarters) {
    const k = `${starter.muscleGroupId}::${starter.side}`;
    if (!existingMmtKeys.has(k)) {
      appendedMmt.push({
        entryId: crypto.randomUUID(),
        canonicalKey: `mmt.${starter.muscleGroupId}.${starter.side}`,
        label: starter.muscleGroupNameEn,
        muscleGroupId: starter.muscleGroupId,
        muscleNameAr: starter.muscleGroupNameAr,
        muscleNameEn: starter.muscleGroupNameEn,
        actionNameAr: starter.muscleGroupNameAr,
        actionNameEn: starter.muscleGroupNameEn,
        laterality: starter.side,
        gravityCondition: 'against_gravity',
        isTested: false,
        gradeValue: null,
      });
      existingMmtKeys.add(k);
    }
  }

  const existingTests = store.specialTests || [];
  const existingTestIds = new Set(existingTests.map((t) => t.id));
  const appendedTests: OrthopedicSpecialTestItem[] = [];
  for (const testId of preset.specialTestIds) {
    if (!existingTestIds.has(testId) && PRESET_SPECIAL_TESTS_BY_ID[testId]) {
      const tpl = PRESET_SPECIAL_TESTS_BY_ID[testId];
      appendedTests.push({
        id: tpl.id,
        joint: tpl.joint,
        nameAr: tpl.nameAr,
        nameEn: tpl.nameEn,
        targetPathologyAr: tpl.targetPathologyAr,
        targetPathologyEn: tpl.targetPathologyEn,
        outcome: 'not_tested',
      });
      existingTestIds.add(testId);
    }
  }

  const shouldUpdateScale =
    !store.functionalScales ||
    (store.functionalScales.rawScore === undefined &&
      (!store.functionalScales.history || store.functionalScales.history.length === 0));

  const spec = OUTCOME_INSTRUMENTS[preset.recommendedScaleId];
  const nextFunctionalScales: FunctionalScaleEntry | undefined = shouldUpdateScale
    ? {
        scaleId: preset.recommendedScaleId,
        scaleNameAr: spec.nameAr,
        scaleNameEn: spec.nameEn,
        scorePercentage: store.functionalScales?.scorePercentage ?? 0,
        severityLabelAr: store.functionalScales?.severityLabelAr ?? 'لم يُقَس بعد',
        severityLabelEn: store.functionalScales?.severityLabelEn ?? 'Not assessed yet',
        responses: store.functionalScales?.responses ?? {},
        maxScore: spec.maxRaw,
        entryMode: spec.category === 'procedure' ? 'procedure' : 'score_entry',
        unitLabelAr: spec.unitAr,
        unitLabelEn: spec.unitEn,
        officialSourceUrl: spec.officialSourceUrl,
      }
    : store.functionalScales;

  const applied = Array.from(new Set([...(store.appliedPresetIds || []), preset.id]));

  return {
    ...store,
    activeWidgetIds: Array.from(existingWidgets),
    objective: {
      ...store.objective,
      romBattery: {
        batteryVersion: '1.0.0',
        entries: [...existingRom, ...appendedRom],
        updatedAt: new Date().toISOString(),
      },
      mmtBattery: {
        batteryVersion: '1.0.0',
        entries: [...existingMmt, ...appendedMmt],
        updatedAt: new Date().toISOString(),
      },
    },
    specialTests: [...existingTests, ...appendedTests],
    functionalScales: nextFunctionalScales,
    appliedPresetIds: applied,
  };
}

export interface ExamPresetPackFile {
  schema: 'physiorecord-exam-presets-pack/v1';
  license: 'CC0-1.0';
  exportedAt: string;
  presets: RegionalExamPresetDefinition[];
}

export function serializeExamPresetPack(presets: RegionalExamPresetDefinition[]): string {
  const payload: ExamPresetPackFile = {
    schema: 'physiorecord-exam-presets-pack/v1',
    license: 'CC0-1.0',
    exportedAt: new Date().toISOString(),
    presets: presets.map((p) => ({
      ...p,
      license: 'CC0-1.0',
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseExamPresetPack(rawJson: string): RegionalExamPresetDefinition[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid JSON format in exam preset pack.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Exam preset pack must be a JSON object.');
  }
  const obj = parsed as Partial<ExamPresetPackFile>;
  if (obj.schema !== 'physiorecord-exam-presets-pack/v1') {
    throw new Error('Unsupported exam preset pack schema version.');
  }
  if (obj.license !== 'CC0-1.0') {
    throw new Error('Only CC0-1.0 exam preset packs may be imported.');
  }
  if (!Array.isArray(obj.presets) || obj.presets.length === 0) {
    throw new Error('Exam preset pack contains zero presets.');
  }

  const sanitized: RegionalExamPresetDefinition[] = [];
  for (const item of obj.presets) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<RegionalExamPresetDefinition>;
    if (!p.id || !p.regionId || (!p.titleAr && !p.titleEn)) continue;
    sanitized.push({
      id: String(p.id),
      regionId: String(p.regionId),
      titleAr: String(p.titleAr || p.titleEn || p.regionId),
      titleCkb: String(p.titleCkb || p.titleAr || p.titleEn || p.regionId),
      titleEn: String(p.titleEn || p.titleAr || p.regionId),
      summaryAr: String(p.summaryAr || ''),
      summaryEn: String(p.summaryEn || ''),
      license: 'CC0-1.0',
      isBuiltIn: false,
      widgetsToEnable: Array.isArray(p.widgetsToEnable) && p.widgetsToEnable.length > 0
        ? p.widgetsToEnable
        : ['body_chart', 'rom', 'mmt', 'functional_scales'],
      romStarters: Array.isArray(p.romStarters) ? p.romStarters : [],
      mmtStarters: Array.isArray(p.mmtStarters) ? p.mmtStarters : [],
      specialTestIds: Array.isArray(p.specialTestIds) ? p.specialTestIds : [],
      recommendedScaleId: p.recommendedScaleId || 'psfs',
      redFlagRegionId: p.redFlagRegionId || 'lumbar_pelvis',
      redFlagReminderAr: String(p.redFlagReminderAr || ''),
      redFlagReminderEn: String(p.redFlagReminderEn || ''),
      updatedAt: new Date().toISOString(),
    });
  }

  if (sanitized.length === 0) {
    throw new Error('No valid exam presets were found inside the pack.');
  }
  return sanitized;
}
