// =======================================================================
// PhysioRecord — Myotomes Clinical Reference Dataset & ASIA/ISNCSCI Engine
// Sources:
//   - ASIA / ISNCSCI Standards (2019 Revised, 8th Ed.; Rupp et al. 2021)
//   - Kendall's Muscles: Testing and Function (5th Ed.)
//   - Magee DJ. Orthopedic Physical Assessment (7th Ed.)
//   - DeJong's The Neurologic Examination (8th Ed.)
// =======================================================================

import type { MyotomeDefinition, SpinalLevel } from '../../types/clinicalToolkit';
import type { MyotomeMotorEntry } from '../../types/clinical';

export const MULTISEGMENTAL_INNERVATION_GENERAL_NOTE_EN =
  'Almost all skeletal muscles receive multisegmental innervation from two or more spinal roots through nerve plexuses. Consequently, a single-root radiculopathy typically causes paresis (partial weakness) rather than complete paralysis of a muscle group. Testing multiple muscles innervated by the same root (via different peripheral nerves) is the cornerstone for differentiating radiculopathy from peripheral nerve entrapment.';

export const MULTISEGMENTAL_INNERVATION_GENERAL_NOTE_AR =
  'تتلقى معظم العضلات الهيكلية تعصيباً مشتركاً متعدد المستويات من جذرين شوكيين أو أكثر عبر الضفائر العصبية. لذلك، فإن اعتلال الجذر المنفرد (Radiculopathy) يؤدي عادةً إلى ضعف جزئي (Paresis) في العضلة وليس شللاً كاملاً. يُعد فحص عدة عضلات يشترك في تغذيتها نفس الجذر العصبي عبر أعصاب محيطية مختلفة هو الأساس السريري للتفريق بين اعتلال الجذر وانضغاط العصب المحيطي.';

// -----------------------------------------------------------------------
// 1. Official ASIA / ISNCSCI (2019 Revised) — 10 Key Muscle Functions ONLY
// -----------------------------------------------------------------------
export interface AsiaKeyMuscleDefinition {
  testId: string;
  rootLevel: 'C5' | 'C6' | 'C7' | 'C8' | 'T1' | 'L2' | 'L3' | 'L4' | 'L5' | 'S1';
  extremity: 'upper' | 'lower';
  /** Official ISNCSCI 2019 Key Muscle Function label */
  functionEn: string;
  functionAr: string;
  functionCkb: string;
  /** Primary anatomical muscles tested per ISNCSCI */
  musclesEn: string;
  musclesAr: string;
  peripheralNerveEn: string;
  peripheralNerveAr: string;
  /** Matching Clinical PT testId so grades seamlessly cross-reflect between modes */
  linkedClinicalTestId: string;
}

export const ASIA_ISNCSCI_KEY_MUSCLES: AsiaKeyMuscleDefinition[] = [
  // Upper Extremity Motor Score (UEMS — 5 muscles × 5 max = 25/side, 50 total)
  {
    testId: 'asia:C5',
    rootLevel: 'C5',
    extremity: 'upper',
    functionEn: 'Elbow flexors',
    functionAr: 'ثني المرفق (قابضات المرفق)',
    functionCkb: 'نوشتانەوەی ئەنیشک',
    musclesEn: 'Biceps brachii, Brachialis',
    musclesAr: 'ذات الرأسين العضدية والعضلة العضدية',
    peripheralNerveEn: 'Musculocutaneous nerve (C5–C6)',
    peripheralNerveAr: 'العصب الجلدي العضلي (C5–C6)',
    linkedClinicalTestId: 'clinical:C5:elbow_flexion',
  },
  {
    testId: 'asia:C6',
    rootLevel: 'C6',
    extremity: 'upper',
    functionEn: 'Wrist extensors',
    functionAr: 'بسط الرسغ (باسطات الرسغ)',
    functionCkb: 'درێژکردنەوەی مەچەک',
    musclesEn: 'Extensor carpi radialis longus & brevis (ECRL, ECRB)',
    musclesAr: 'باسطة الرسغ الكعبرية الطويلة والقصيرة',
    peripheralNerveEn: 'Radial nerve (C6–C7)',
    peripheralNerveAr: 'العصب الكعبري (C6–C7)',
    linkedClinicalTestId: 'clinical:C6:wrist_extension',
  },
  {
    testId: 'asia:C7',
    rootLevel: 'C7',
    extremity: 'upper',
    functionEn: 'Elbow extensors',
    functionAr: 'بسط المرفق (باسطة المرفق)',
    functionCkb: 'درێژکردنەوەی ئەنیشک',
    musclesEn: 'Triceps brachii',
    musclesAr: 'العضلة ثلاثية الرؤوس العضدية',
    peripheralNerveEn: 'Radial nerve (C6–C8)',
    peripheralNerveAr: 'العصب الكعبري (C6–C8)',
    linkedClinicalTestId: 'clinical:C7:elbow_extension',
  },
  {
    testId: 'asia:C8',
    rootLevel: 'C8',
    extremity: 'upper',
    functionEn: 'Finger flexors (distal phalanx, middle finger)',
    functionAr: 'ثني السلامى البعيدة للإصبع الأوسط (قابضة الأصابع العميقة)',
    functionCkb: 'نوشتانەوەی سەری پەنجەی ناوەڕاست',
    musclesEn: 'Flexor digitorum profundus (middle finger)',
    musclesAr: 'قابضة الأصابع العميقة (الإصبع الأوسط)',
    peripheralNerveEn: 'Median nerve — Anterior interosseous (C8–T1)',
    peripheralNerveAr: 'العصب الناصف — بين العظام الأمامي (C8–T1)',
    linkedClinicalTestId: 'clinical:C8:finger_flexion_dip',
  },
  {
    testId: 'asia:T1',
    rootLevel: 'T1',
    extremity: 'upper',
    functionEn: 'Finger abductors (little finger)',
    functionAr: 'تبعيد إصبع الخنصر (مبعدة الخنصر)',
    functionCkb: 'دوورخستنەوەی پەنجەی بچووک',
    musclesEn: 'Abductor digiti minimi (ADM)',
    musclesAr: 'مبعدة إصبع الخنصر (ADM)',
    peripheralNerveEn: 'Ulnar nerve — Deep branch (C8–T1)',
    peripheralNerveAr: 'العصب الزندي — الفرع العميق (C8–T1)',
    linkedClinicalTestId: 'clinical:T1:little_finger_abduction',
  },

  // Lower Extremity Motor Score (LEMS — 5 muscles × 5 max = 25/side, 50 total)
  {
    testId: 'asia:L2',
    rootLevel: 'L2',
    extremity: 'lower',
    functionEn: 'Hip flexors',
    functionAr: 'ثني الورك (قابضات الورك)',
    functionCkb: 'نوشتانەوەی ڕان',
    musclesEn: 'Iliopsoas (Psoas major & Iliacus)',
    musclesAr: 'العضلة الحرقفية القطنية',
    peripheralNerveEn: 'L1–L3 anterior rami (Psoas) & Femoral n. L2–L3 (Iliacus)',
    peripheralNerveAr: 'الفروع الأمامية L1–L3 (القطنية) والعصب الفخذي (الحرقفية)',
    linkedClinicalTestId: 'clinical:L1-L2:hip_flexion',
  },
  {
    testId: 'asia:L3',
    rootLevel: 'L3',
    extremity: 'lower',
    functionEn: 'Knee extensors',
    functionAr: 'بسط الركبة (باسطات الركبة)',
    functionCkb: 'درێژکردنەوەی ئەژنۆ',
    musclesEn: 'Quadriceps femoris',
    musclesAr: 'العضلة رباعية الرؤوس الفخذية',
    peripheralNerveEn: 'Femoral nerve (L2–L4)',
    peripheralNerveAr: 'العصب الفخذي (L2–L4)',
    linkedClinicalTestId: 'clinical:L3:knee_extension',
  },
  {
    testId: 'asia:L4',
    rootLevel: 'L4',
    extremity: 'lower',
    functionEn: 'Ankle dorsiflexors',
    functionAr: 'العطف الظهري للكاحل (رفع القدم للأعلى)',
    functionCkb: 'بەرزکردنەوەی پێ بەرەو سەرەوە',
    musclesEn: 'Tibialis anterior',
    musclesAr: 'العضلة الظنبوبية الأمامية',
    peripheralNerveEn: 'Deep fibular (peroneal) nerve (L4–L5)',
    peripheralNerveAr: 'العصب الشظوي العميق (L4–L5)',
    linkedClinicalTestId: 'clinical:L4:ankle_dorsiflexion',
  },
  {
    testId: 'asia:L5',
    rootLevel: 'L5',
    extremity: 'lower',
    functionEn: 'Long toe extensors',
    functionAr: 'بسط إبهام القدم (الباسطة الطويلة للإبهام)',
    functionCkb: 'بەرزکردنەوەی پەنجە گەورەی پێ',
    musclesEn: 'Extensor hallucis longus (EHL)',
    musclesAr: 'باسطة إبهام القدم الطويلة (EHL)',
    peripheralNerveEn: 'Deep fibular (peroneal) nerve (L5–S1)',
    peripheralNerveAr: 'العصب الشظوي العميق (L5–S1)',
    linkedClinicalTestId: 'clinical:L5:great_toe_extension',
  },
  {
    testId: 'asia:S1',
    rootLevel: 'S1',
    extremity: 'lower',
    functionEn: 'Ankle plantar flexors',
    functionAr: 'العطف الأخمصي للكاحل (دفع القدم للأسفل)',
    functionCkb: 'نووشتاندنەوەی پێ بەرەو خوارەوە',
    musclesEn: 'Gastrocnemius, Soleus',
    musclesAr: 'عضلات ربلة الساق (الساقية والنعلية)',
    peripheralNerveEn: 'Tibial nerve (S1–S2)',
    peripheralNerveAr: 'العصب الظنبوبي (S1–S2)',
    linkedClinicalTestId: 'clinical:S1:ankle_plantarflexion',
  },
];

// -----------------------------------------------------------------------
// 1B. Official ASIA / ISNCSCI (9th Edition 2026, REV 04/26) — Non-Key Muscles Table (C5–S1)
//     Used in apparent AIS B patients (>3 segments below motor level) to
//     differentiate AIS B vs. AIS C/D.
// -----------------------------------------------------------------------
export interface AsiaNonKeyMuscleDefinition {
  testId: string;
  rootLevel: 'C5' | 'C6' | 'C7' | 'C8' | 'T1' | 'L2' | 'L3' | 'L4' | 'L5' | 'S1';
  extremity: 'upper' | 'lower';
  movementEn: string;
  movementAr: string;
}

export const ASIA_ISNCSCI_NON_KEY_MUSCLES: AsiaNonKeyMuscleDefinition[] = [
  {
    testId: 'asia-nonkey:C5:shoulder',
    rootLevel: 'C5',
    extremity: 'upper',
    movementEn: 'Shoulder: Flexion, extension, abduction, adduction, internal and external rotation',
    movementAr: 'الكتف: ثني، بسط، تبعيد، تقريب، دوران داخلي وخارجي',
  },
  {
    testId: 'asia-nonkey:C5:elbow_supination',
    rootLevel: 'C5',
    extremity: 'upper',
    movementEn: 'Elbow: Supination',
    movementAr: 'المرفق: استلقاء الساعد (Supination)',
  },
  {
    testId: 'asia-nonkey:C6:elbow_pronation',
    rootLevel: 'C6',
    extremity: 'upper',
    movementEn: 'Elbow: Pronation',
    movementAr: 'المرفق: كبّ الساعد (Pronation)',
  },
  {
    testId: 'asia-nonkey:C6:wrist_flexion',
    rootLevel: 'C6',
    extremity: 'upper',
    movementEn: 'Wrist: Flexion',
    movementAr: 'الرسغ: ثني (Flexion)',
  },
  {
    testId: 'asia-nonkey:C7:finger_proximal_flex_ext',
    rootLevel: 'C7',
    extremity: 'upper',
    movementEn: 'Finger: Flexion at proximal joint, extension',
    movementAr: 'الأصابع: ثني المفصل القريب وبسط الأصابع',
  },
  {
    testId: 'asia-nonkey:C7:thumb_plane',
    rootLevel: 'C7',
    extremity: 'upper',
    movementEn: 'Thumb: Flexion, extension and abduction in plane of thumb',
    movementAr: 'الإبهام: ثني وبسط وتبعيد في مستوى الإبهام',
  },
  {
    testId: 'asia-nonkey:C8:finger_mcp_flexion',
    rootLevel: 'C8',
    extremity: 'upper',
    movementEn: 'Finger: Flexion at MCP joint',
    movementAr: 'الأصابع: ثني المفاصل السنعية السلامية (MCP)',
  },
  {
    testId: 'asia-nonkey:C8:thumb_opp_add_abd',
    rootLevel: 'C8',
    extremity: 'upper',
    movementEn: 'Thumb: Opposition, adduction and abduction perpendicular to palm',
    movementAr: 'الإبهام: مقابلة وتقريب وتبعيد عمودي على راحة اليد',
  },
  {
    testId: 'asia-nonkey:T1:index_abduction',
    rootLevel: 'T1',
    extremity: 'upper',
    movementEn: 'Finger: Abduction of the index finger',
    movementAr: 'الأصابع: تبعيد إصبع السبابة (Abduction of index finger)',
  },
  {
    testId: 'asia-nonkey:L2:hip_adduction',
    rootLevel: 'L2',
    extremity: 'lower',
    movementEn: 'Hip: Adduction',
    movementAr: 'الورك: تقريب (Hip adduction)',
  },
  {
    testId: 'asia-nonkey:L3:hip_er',
    rootLevel: 'L3',
    extremity: 'lower',
    movementEn: 'Hip: External rotation',
    movementAr: 'الورك: دوران خارجي (Hip external rotation)',
  },
  {
    testId: 'asia-nonkey:L4:hip_ext_abd_ir',
    rootLevel: 'L4',
    extremity: 'lower',
    movementEn: 'Hip: Extension, abduction, internal rotation',
    movementAr: 'الورك: بسط، تبعيد، دوران داخلي',
  },
  {
    testId: 'asia-nonkey:L4:knee_flexion',
    rootLevel: 'L4',
    extremity: 'lower',
    movementEn: 'Knee: Flexion',
    movementAr: 'الركبة: ثني (Knee flexion)',
  },
  {
    testId: 'asia-nonkey:L4:ankle_inv_ev',
    rootLevel: 'L4',
    extremity: 'lower',
    movementEn: 'Ankle: Inversion and eversion',
    movementAr: 'الكاحل: انقلاب داخلي وخارجي (Inversion & eversion)',
  },
  {
    testId: 'asia-nonkey:L4:toe_mp_ip_ext',
    rootLevel: 'L4',
    extremity: 'lower',
    movementEn: 'Toe: MP and IP extension',
    movementAr: 'أصابع القدم: بسط المفاصل المشطية والسلامية (MP & IP extension)',
  },
  {
    testId: 'asia-nonkey:L5:hallux_toe_flex_abd',
    rootLevel: 'L5',
    extremity: 'lower',
    movementEn: 'Hallux and Toe: DIP and PIP flexion and abduction',
    movementAr: 'إبهام وأصابع القدم: ثني المفاصل السلامية (PIP & DIP) والتبعيد',
  },
  {
    testId: 'asia-nonkey:S1:hallux_adduction',
    rootLevel: 'S1',
    extremity: 'lower',
    movementEn: 'Hallux: Adduction',
    movementAr: 'إبهام القدم: تقريب (Hallux adduction)',
  },
];

// -----------------------------------------------------------------------
// 2. Comprehensive Physiotherapy / Orthopedic Myotome Screening (C1–S2)
//    Includes primary movements plus official ISNCSCI 9th Edition (2026)
//    Non-Key Muscle movements and peripheral nerve differentials.
// -----------------------------------------------------------------------
export interface ClinicalMyotomeMovementTest {
  testId: string;
  movementEn: string;
  movementAr: string;
  muscleEn: string;
  muscleAr: string;
  peripheralNerveEn: string;
  peripheralNerveAr: string;
  isAsiaKeyMuscle?: boolean;
  /** Optional ASIA testId if this movement is one of the 10 official ISNCSCI key muscles */
  asiaTestId?: string;
}

export interface ClinicalMyotomeRootGroup {
  root: string;
  regionGroup: 'cervical' | 'lumbar_sacral';
  primaryTest: ClinicalMyotomeMovementTest;
  secondaryTests: ClinicalMyotomeMovementTest[];
  clinicalPearlAr: string;
  clinicalPearlEn: string;
}

export const CLINICAL_PT_MYOTOMES: ClinicalMyotomeRootGroup[] = [
  // --- CERVICAL & UPPER EXTREMITY (C1–T1) ---
  {
    root: 'C1-C2',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C1-C2:cervical_flexion',
      movementEn: 'Upper cervical flexion',
      movementAr: 'ثني أعلى الرقبة',
      muscleEn: 'Longus capitis, Rectus capitis anterior',
      muscleAr: 'الرأسية الطويلة والمستقيمة الرأسية الأمامية',
      peripheralNerveEn: 'Cervical ventral rami (C1–C2)',
      peripheralNerveAr: 'الفروع الأمامية الرقبية (C1–C2)',
    },
    secondaryTests: [
      {
        testId: 'clinical:C1-C2:cervical_extension',
        movementEn: 'Upper cervical extension',
        movementAr: 'بسط أعلى الرقبة',
        muscleEn: 'Suboccipital muscles',
        muscleAr: 'عضلات تحت القذال',
        peripheralNerveEn: 'Suboccipital nerve (C1–C2)',
        peripheralNerveAr: 'العصب تحت القذالي (C1–C2)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C3',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C3:cervical_lateral_flexion',
      movementEn: 'Cervical lateral flexion',
      movementAr: 'الإمالة الجانبية للرقبة',
      muscleEn: 'Scalenes',
      muscleAr: 'العضلات الأخمعية',
      peripheralNerveEn: 'Cervical plexus (C3–C4)',
      peripheralNerveAr: 'الضفيرة الرقبية (C3–C4)',
    },
    secondaryTests: [
      {
        testId: 'clinical:C3:diaphragm_screen',
        movementEn: 'Diaphragmatic excursion (C3–C5)',
        movementAr: 'التنفس الحجابي (C3–C5)',
        muscleEn: 'Diaphragm',
        muscleAr: 'الحجاب الحاجز',
        peripheralNerveEn: 'Phrenic nerve (C3–C5)',
        peripheralNerveAr: 'العصب الحجابي (C3–C5)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C4',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C4:shoulder_elevation',
      movementEn: 'Shoulder elevation (shrug)',
      movementAr: 'رفع الكتفين للأعلى',
      muscleEn: 'Upper Trapezius, Levator scapulae',
      muscleAr: 'شبه المنحرفة العلوية ورافعة لوح الكتف',
      peripheralNerveEn: 'CN XI & C3–C4 / Dorsal scapular n.',
      peripheralNerveAr: 'العصب الإضافي و C3–C4 والكتفي الظهراني',
    },
    secondaryTests: [],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C5',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C5:elbow_flexion',
      movementEn: 'Elbow flexors (ASIA Key Muscle)',
      movementAr: 'ثني المرفق (قابضات المرفق — ASIA C5)',
      muscleEn: 'Biceps brachii, Brachialis',
      muscleAr: 'ذات الرأسين العضدية والعضدية',
      peripheralNerveEn: 'Musculocutaneous nerve (C5–C6)',
      peripheralNerveAr: 'العصب الجلدي العضلي (C5–C6)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:C5',
    },
    secondaryTests: [
      {
        testId: 'clinical:C5:shoulder_abduction',
        movementEn: 'Shoulder: Flexion, extension, abduction, adduction, internal & external rotation',
        movementAr: 'الكتف: ثني، بسط، تبعيد، تقريب، دوران داخلي وخارجي',
        muscleEn: 'Deltoid, Rotator cuff, Pectoralis major (clavicular), Latissimus/Teres',
        muscleAr: 'الدالية، الكفة المدورة، الصدرية الكبرى',
        peripheralNerveEn: 'Axillary, Suprascapular & Subscapular nerves (C5–C6)',
        peripheralNerveAr: 'العصب الإبطي وفوق الكتف وتحت الكتف (C5–C6)',
      },
      {
        testId: 'clinical:C5:elbow_supination',
        movementEn: 'Elbow: Supination',
        movementAr: 'المرفق: استلقاء الساعد (Supination)',
        muscleEn: 'Biceps brachii, Supinator',
        muscleAr: 'ذات الرأسين والعضلة الباسطة للاستلقاء',
        peripheralNerveEn: 'Musculocutaneous & Radial nerve (C5–C6)',
        peripheralNerveAr: 'العصب الجلدي العضلي والكعبري (C5–C6)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C6',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C6:wrist_extension',
      movementEn: 'Wrist extensors (ASIA Key Muscle)',
      movementAr: 'بسط الرسغ (باسطات الرسغ — ASIA C6)',
      muscleEn: 'Extensor carpi radialis longus & brevis (ECRL, ECRB)',
      muscleAr: 'باسطة الرسغ الكعبرية الطويلة والقصيرة',
      peripheralNerveEn: 'Radial nerve (C6–C7)',
      peripheralNerveAr: 'العصب الكعبري (C6–C7)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:C6',
    },
    secondaryTests: [
      {
        testId: 'clinical:C6:elbow_pronation',
        movementEn: 'Elbow: Pronation',
        movementAr: 'المرفق: كبّ الساعد (Pronation)',
        muscleEn: 'Pronator teres',
        muscleAr: 'الكابّة المدورة',
        peripheralNerveEn: 'Median nerve (C6–C7)',
        peripheralNerveAr: 'العصب الناصف (C6–C7)',
      },
      {
        testId: 'clinical:C6:wrist_flexion',
        movementEn: 'Wrist: Flexion',
        movementAr: 'الرسغ: ثني (Wrist flexion)',
        muscleEn: 'Flexor carpi radialis (FCR)',
        muscleAr: 'قابضة الرسغ الكعبرية',
        peripheralNerveEn: 'Median nerve (C6–C7)',
        peripheralNerveAr: 'العصب الناصف (C6–C7)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C7',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C7:elbow_extension',
      movementEn: 'Elbow extensors (ASIA Key Muscle)',
      movementAr: 'بسط المرفق (باسطة المرفق — ASIA C7)',
      muscleEn: 'Triceps brachii',
      muscleAr: 'ثلاثية الرؤوس العضدية',
      peripheralNerveEn: 'Radial nerve (C6–C8)',
      peripheralNerveAr: 'العصب الكعبري (C6–C8)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:C7',
    },
    secondaryTests: [
      {
        testId: 'clinical:C7:finger_extension',
        movementEn: 'Finger: Flexion at proximal joint, extension',
        movementAr: 'الأصابع: ثني المفصل القريب وبسط الأصابع',
        muscleEn: 'Flexor digitorum superficialis (FDS), Extensor digitorum (EDC)',
        muscleAr: 'قابضة الأصابع السطحية وباسطة الأصابع المشتركة',
        peripheralNerveEn: 'Median & Posterior interosseous nerves (C7–C8)',
        peripheralNerveAr: 'العصب الناصف وبين العظام الخلفي (C7–C8)',
      },
      {
        testId: 'clinical:C7:thumb_plane',
        movementEn: 'Thumb: Flexion, extension and abduction in plane of thumb',
        movementAr: 'الإبهام: ثني وبسط وتبعيد في مستوى الإبهام',
        muscleEn: 'EPL, EPB, APL, FPB',
        muscleAr: 'باسطات وقابضات ومبعدة الإبهام الطويلة',
        peripheralNerveEn: 'Radial (PIN) & Median nerves (C7–C8)',
        peripheralNerveAr: 'العصب الكعبري والناصف (C7–C8)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'C8',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:C8:finger_flexion_dip',
      movementEn: 'Finger flexors — middle finger distal phalanx (ASIA Key Muscle)',
      movementAr: 'ثني السلامى البعيدة للإصبع الأوسط (قابضات الأصابع — ASIA C8)',
      muscleEn: 'Flexor digitorum profundus (FDP)',
      muscleAr: 'قابضة الأصابع العميقة (FDP)',
      peripheralNerveEn: 'Median (AIN) & Ulnar nerves (C8–T1)',
      peripheralNerveAr: 'العصب الناصف والزندي (C8–T1)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:C8',
    },
    secondaryTests: [
      {
        testId: 'clinical:C8:finger_mcp_flexion',
        movementEn: 'Finger: Flexion at MCP joint',
        movementAr: 'الأصابع: ثني المفاصل السنعية السلامية (MCP)',
        muscleEn: 'Lumbricals, Interossei',
        muscleAr: 'العضلات الخراطينية وبين العظام',
        peripheralNerveEn: 'Median & Ulnar nerves (C8–T1)',
        peripheralNerveAr: 'العصب الناصف والزندي (C8–T1)',
      },
      {
        testId: 'clinical:C8:thumb_opp_add_abd',
        movementEn: 'Thumb: Opposition, adduction and abduction perpendicular to palm',
        movementAr: 'الإبهام: مقابلة وتقريب وتبعيد عمودي على راحة اليد',
        muscleEn: 'Opponens pollicis, Adductor pollicis, Abductor pollicis brevis',
        muscleAr: 'مقابلة ومقربة ومبعدة الإبهام القصيرة',
        peripheralNerveEn: 'Median & Ulnar nerves (C8–T1)',
        peripheralNerveAr: 'العصب الناصف والزندي (C8–T1)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'T1',
    regionGroup: 'cervical',
    primaryTest: {
      testId: 'clinical:T1:little_finger_abduction',
      movementEn: 'Finger abductors — little finger (ASIA Key Muscle)',
      movementAr: 'تبعيد إصبع الخنصر (مبعدة الخنصر — ASIA T1)',
      muscleEn: 'Abductor digiti minimi (ADM)',
      muscleAr: 'مبعدة إصبع الخنصر (ADM)',
      peripheralNerveEn: 'Ulnar nerve — Deep branch (C8–T1)',
      peripheralNerveAr: 'العصب الزندي — الفرع العميق (C8–T1)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:T1',
    },
    secondaryTests: [
      {
        testId: 'clinical:T1:finger_interossei',
        movementEn: 'Finger: Abduction of the index finger',
        movementAr: 'الأصابع: تبعيد إصبع السبابة (Abduction of index finger)',
        muscleEn: 'First dorsal interosseous (FDI)',
        muscleAr: 'العضلة بين العظام الظهرانية الأولى (FDI)',
        peripheralNerveEn: 'Ulnar nerve — Deep branch (C8–T1)',
        peripheralNerveAr: 'العصب الزندي — الفرع العميق (C8–T1)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },

  // --- LUMBAR & SACRAL MYOTOMES (L1–S2) ---
  {
    root: 'L1-L2',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:L1-L2:hip_flexion',
      movementEn: 'Hip flexors (ASIA L2 Key Muscle)',
      movementAr: 'ثني الورك (قابضات الورك — ASIA L2)',
      muscleEn: 'Iliopsoas',
      muscleAr: 'العضلة الحرقفية القطنية',
      peripheralNerveEn: 'L1–L3 rami & Femoral nerve (L2–L3)',
      peripheralNerveAr: 'الفروع القطنية والعصب الفخذي (L2–L3)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:L2',
    },
    secondaryTests: [
      {
        testId: 'clinical:L1-L2:hip_adduction',
        movementEn: 'Hip: Adduction',
        movementAr: 'الورك: تقريب (Hip adduction)',
        muscleEn: 'Adductor longus, brevis & magnus',
        muscleAr: 'المقربات الفخذية',
        peripheralNerveEn: 'Obturator nerve (L2–L4)',
        peripheralNerveAr: 'العصب الساد (L2–L4)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'L3',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:L3:knee_extension',
      movementEn: 'Knee extensors (ASIA L3 Key Muscle)',
      movementAr: 'بسط الركبة (باسطات الركبة — ASIA L3)',
      muscleEn: 'Quadriceps femoris',
      muscleAr: 'رباعية الرؤوس الفخذية',
      peripheralNerveEn: 'Femoral nerve (L2–L4)',
      peripheralNerveAr: 'العصب الفخذي (L2–L4)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:L3',
    },
    secondaryTests: [
      {
        testId: 'clinical:L3:hip_er',
        movementEn: 'Hip: External rotation',
        movementAr: 'الورك: دوران خارجي (Hip external rotation)',
        muscleEn: 'Hip external rotators',
        muscleAr: 'العضلات المدورة الخارجية للورك',
        peripheralNerveEn: 'Obturator & Sacral plexus branches (L3–S1)',
        peripheralNerveAr: 'العصب الساد وفروع الضفيرة (L3–S1)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'L4',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:L4:ankle_dorsiflexion',
      movementEn: 'Ankle dorsiflexors (ASIA L4 Key Muscle)',
      movementAr: 'العطف الظهري للكاحل (رفع القدم للأعلى — ASIA L4)',
      muscleEn: 'Tibialis anterior',
      muscleAr: 'العضلة الظنبوبية الأمامية',
      peripheralNerveEn: 'Deep fibular (peroneal) nerve (L4–L5)',
      peripheralNerveAr: 'العصب الشظوي العميق (L4–L5)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:L4',
    },
    secondaryTests: [
      {
        testId: 'clinical:L4:hip_ext_abd_ir',
        movementEn: 'Hip: Extension, abduction, internal rotation',
        movementAr: 'الورك: بسط، تبعيد، دوران داخلي',
        muscleEn: 'Gluteus medius, minimus, Tensor fasciae latae',
        muscleAr: 'الألوية الوسطى والصغرى وموترة اللفافة العريضة',
        peripheralNerveEn: 'Superior & Inferior gluteal nerves (L4–S1)',
        peripheralNerveAr: 'العصب الإليوي العلوي والسفلي (L4–S1)',
      },
      {
        testId: 'clinical:L4:knee_flexion',
        movementEn: 'Knee: Flexion',
        movementAr: 'الركبة: ثني (Knee flexion)',
        muscleEn: 'Hamstrings',
        muscleAr: 'عضلات خلف الفخذ (المأبضيات)',
        peripheralNerveEn: 'Sciatic nerve (L4–S2)',
        peripheralNerveAr: 'العصب الوركي (L4–S2)',
      },
      {
        testId: 'clinical:L4:ankle_inv_ev',
        movementEn: 'Ankle: Inversion and eversion',
        movementAr: 'الكاحل: انقلاب داخلي وخارجي (Inversion & eversion)',
        muscleEn: 'Tibialis anterior/posterior, Fibularis longus/brevis',
        muscleAr: 'الظنبوبية الأمامية/الخلفية والشظويات',
        peripheralNerveEn: 'Deep/Superficial fibular & Tibial nerves (L4–S1)',
        peripheralNerveAr: 'العصب الشظوي والظنبوبي (L4–S1)',
      },
      {
        testId: 'clinical:L4:toe_mp_ip_ext',
        movementEn: 'Toe: MP and IP extension',
        movementAr: 'أصابع القدم: بسط المفاصل المشطية والسلامية (MP & IP extension)',
        muscleEn: 'Extensor digitorum longus & brevis (EDL, EDB)',
        muscleAr: 'باسطة أصابع القدم الطويلة والقصيرة',
        peripheralNerveEn: 'Deep fibular nerve (L4–S1)',
        peripheralNerveAr: 'العصب الشظوي العميق (L4–S1)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'L5',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:L5:great_toe_extension',
      movementEn: 'Long toe extensors (ASIA L5 Key Muscle)',
      movementAr: 'بسط إبهام القدم (الباسطة الطويلة للإبهام — ASIA L5)',
      muscleEn: 'Extensor hallucis longus (EHL)',
      muscleAr: 'باسطة إبهام القدم الطويلة (EHL)',
      peripheralNerveEn: 'Deep fibular (peroneal) nerve (L5–S1)',
      peripheralNerveAr: 'العصب الشظوي العميق (L5–S1)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:L5',
    },
    secondaryTests: [
      {
        testId: 'clinical:L5:hallux_toe_flex_abd',
        movementEn: 'Hallux and Toe: DIP and PIP flexion and abduction',
        movementAr: 'إبهام وأصابع القدم: ثني المفاصل السلامية (PIP & DIP) والتبعيد',
        muscleEn: 'Flexor digitorum longus/brevis, Flexor hallucis longus, Abductor hallucis',
        muscleAr: 'قابضات ومبعدات أصابع وإبهام القدم',
        peripheralNerveEn: 'Tibial nerve (L5–S2)',
        peripheralNerveAr: 'العصب الظنبوبي (L5–S2)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'S1',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:S1:ankle_plantarflexion',
      movementEn: 'Ankle plantar flexors (ASIA S1 Key Muscle)',
      movementAr: 'العطف الأخمصي للكاحل (دفع القدم للأسفل — ASIA S1)',
      muscleEn: 'Gastrocnemius, Soleus',
      muscleAr: 'عضلات ربلة الساق (الساقية والنعلية)',
      peripheralNerveEn: 'Tibial nerve (S1–S2)',
      peripheralNerveAr: 'العصب الظنبوبي (S1–S2)',
      isAsiaKeyMuscle: true,
      asiaTestId: 'asia:S1',
    },
    secondaryTests: [
      {
        testId: 'clinical:S1:hallux_adduction',
        movementEn: 'Hallux: Adduction',
        movementAr: 'إبهام القدم: تقريب (Hallux adduction)',
        muscleEn: 'Adductor hallucis',
        muscleAr: 'مقربة إبهام القدم',
        peripheralNerveEn: 'Lateral plantar nerve — Tibial (S1–S2)',
        peripheralNerveAr: 'العصب الأخمصي الوحشي — الظنبوبي (S1–S2)',
      },
    ],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
  {
    root: 'S2',
    regionGroup: 'lumbar_sacral',
    primaryTest: {
      testId: 'clinical:S2:knee_flexion',
      movementEn: 'Intrinsic foot & pelvic floor screening (S2)',
      movementAr: 'العضلات الدقيقة للقدم وقاع الحوض (S2)',
      muscleEn: 'Intrinsic foot muscles',
      muscleAr: 'العضلات الداخلية للقدم',
      peripheralNerveEn: 'Tibial / Pudendal nerves (S2–S4)',
      peripheralNerveAr: 'العصب الظنبوبي والفرجي (S2–S4)',
    },
    secondaryTests: [],
    clinicalPearlAr: '',
    clinicalPearlEn: '',
  },
];

// -----------------------------------------------------------------------
// 3. Entry Resolution & ASIA / ISNCSCI Motor Score Calculator
// -----------------------------------------------------------------------

/**
 * Finds the persisted MyotomeMotorEntry for a given testId while maintaining
 * seamless compatibility with:
 *   1. Legacy entries that only stored `rootLevel` (before `testId` existed)
 *   2. Cross-linked ASIA <-> Clinical PT key muscle tests (e.g., `asia:C5` <-> `clinical:C5:elbow_flexion`)
 */
export function findMyotomeEntry(
  entries: MyotomeMotorEntry[],
  testId: string,
  rootLevel: string,
  linkedTestId?: string,
  allowLegacyRootFallback = false
): MyotomeMotorEntry | undefined {
  const byExactId = entries.find((e) => e.testId === testId);
  if (byExactId) return byExactId;

  if (linkedTestId) {
    const byLinked = entries.find((e) => e.testId === linkedTestId);
    if (byLinked) return byLinked;
  }

  if (allowLegacyRootFallback) {
    const legacy = entries.find((e) => !e.testId && e.rootLevel === rootLevel);
    if (legacy) return legacy;
  }

  return undefined;
}

export interface AsiaMotorTotals {
  rightUEMS: number;
  leftUEMS: number;
  totalUEMS: number;
  rightUEMSHasNT: boolean;
  leftUEMSHasNT: boolean;
  rightUEMSRecorded: number;
  leftUEMSRecorded: number;

  rightLEMS: number;
  leftLEMS: number;
  totalLEMS: number;
  rightLEMSHasNT: boolean;
  leftLEMSHasNT: boolean;
  rightLEMSRecorded: number;
  leftLEMSRecorded: number;

  totalMotor: number;
  anyNT: boolean;
  recordedMuscles: number;
}

function parseNumericMmtGrade(grade: MyotomeMotorEntry['rightGrade']): number | null {
  if (!grade || grade === 'NT') return null;
  const base = Number.parseInt(String(grade).replace(/[+-]/g, ''), 10);
  if (Number.isNaN(base) || base < 0 || base > 5) return null;
  return base;
}

/**
 * Computes official ASIA / ISNCSCI (2019) Motor Subscores:
 * - UEMS: C5–T1 (max 25 Right, 25 Left, 50 Total)
 * - LEMS: L2–S1 (max 25 Right, 25 Left, 50 Total)
 * - Total Motor: max 100
 * Flags `HasNT` whenever any key muscle is scored `NT`.
 */
export function computeAsiaMotorTotals(entries: MyotomeMotorEntry[]): AsiaMotorTotals {
  let rightUEMS = 0;
  let leftUEMS = 0;
  let rightUEMSHasNT = false;
  let leftUEMSHasNT = false;
  let rightUEMSRecorded = 0;
  let leftUEMSRecorded = 0;

  let rightLEMS = 0;
  let leftLEMS = 0;
  let rightLEMSHasNT = false;
  let leftLEMSHasNT = false;
  let rightLEMSRecorded = 0;
  let leftLEMSRecorded = 0;

  let recordedMuscles = 0;

  for (const keyMuscle of ASIA_ISNCSCI_KEY_MUSCLES) {
    // Note: For legacy entries saved without testId, C5 was previously labeled "Shoulder Abduction",
    // NOT Elbow Flexors, so only fall back to legacy root entries for C6..S1 or if label matches elbow flexion.
    const found =
      findMyotomeEntry(
        entries,
        keyMuscle.testId,
        keyMuscle.rootLevel,
        keyMuscle.linkedClinicalTestId,
        keyMuscle.rootLevel !== 'C5'
      ) ||
      (keyMuscle.rootLevel === 'C5'
        ? entries.find(
            (e) =>
              !e.testId &&
              e.rootLevel === 'C5' &&
              /elbow|مرفق|biceps/i.test(`${e.movementLabelEn} ${e.movementLabelAr}`)
          )
        : undefined);

    if (!found) continue;

    const r = found.rightGrade;
    const l = found.leftGrade;
    if (r !== null || l !== null) recordedMuscles += 1;

    if (keyMuscle.extremity === 'upper') {
      if (r === 'NT') {
        rightUEMSHasNT = true;
        rightUEMSRecorded += 1;
      } else {
        const val = parseNumericMmtGrade(r);
        if (val !== null) {
          rightUEMS += val;
          rightUEMSRecorded += 1;
        }
      }
      if (l === 'NT') {
        leftUEMSHasNT = true;
        leftUEMSRecorded += 1;
      } else {
        const val = parseNumericMmtGrade(l);
        if (val !== null) {
          leftUEMS += val;
          leftUEMSRecorded += 1;
        }
      }
    } else {
      if (r === 'NT') {
        rightLEMSHasNT = true;
        rightLEMSRecorded += 1;
      } else {
        const val = parseNumericMmtGrade(r);
        if (val !== null) {
          rightLEMS += val;
          rightLEMSRecorded += 1;
        }
      }
      if (l === 'NT') {
        leftLEMSHasNT = true;
        leftLEMSRecorded += 1;
      } else {
        const val = parseNumericMmtGrade(l);
        if (val !== null) {
          leftLEMS += val;
          leftLEMSRecorded += 1;
        }
      }
    }
  }

  const totalUEMS = rightUEMS + leftUEMS;
  const totalLEMS = rightLEMS + leftLEMS;

  return {
    rightUEMS,
    leftUEMS,
    totalUEMS,
    rightUEMSHasNT,
    leftUEMSHasNT,
    rightUEMSRecorded,
    leftUEMSRecorded,
    rightLEMS,
    leftLEMS,
    totalLEMS,
    rightLEMSHasNT,
    leftLEMSHasNT,
    rightLEMSRecorded,
    leftLEMSRecorded,
    totalMotor: totalUEMS + totalLEMS,
    anyNT: rightUEMSHasNT || leftUEMSHasNT || rightLEMSHasNT || leftLEMSHasNT,
    recordedMuscles,
  };
}

// -----------------------------------------------------------------------
// 4. Full Reference Encyclopedia (C1–S3) — Corrected Anatomical Details
// -----------------------------------------------------------------------
export const MYOTOME_DEFINITIONS: MyotomeDefinition[] = [
  {
    rootLevel: 'C1',
    regionGroup: 'cervical',
    predominantMovementEn: 'Upper cervical flexion and nodding',
    predominantMovementAr: 'ثني الرقبة العلوي وإيماءة الرأس للأمام',
    keyMuscles: [
      {
        nameEn: 'Longus capitis and Rectus capitis anterior',
        nameAr: 'العضلة الرأسية الطويلة والعضلة المستقيمة الرأسية الأمامية',
        peripheralNerveEn: 'Cervical ventral rami (C1–C2)',
        peripheralNerveAr: 'الفروع الأمامية للأعصاب الرقبية (C1–C2)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Supine; patient tucks chin and flexes craniocervical junction against gentle resistance on forehead.',
    testingPositionAr: 'استلقاء على الظهر؛ يضم المريض الذقن للداخل ويثني أعلى الرقبة ضد مقاومة خفيفة على الجبهة.',
    differentialClinicalNotesEn: 'Pure C1 weakness is rare; evaluated cautiously in atlanto-occipital instability or upper cervical trauma.',
    differentialClinicalNotesAr: 'ضعف C1 المنعزل نادر جداً؛ يُقيّم بحذر في حالات عدم ثبات المفصل الفهقي القذالي وإصابات أعلى الرقبة.',
    primarySourceCitation: "Magee DJ. Orthopedic Physical Assessment; DeJong's Neurologic Examination.",
  },
  {
    rootLevel: 'C2',
    regionGroup: 'cervical',
    predominantMovementEn: 'Upper cervical extension and stabilization',
    predominantMovementAr: 'بسط الرقبة للخلف وتثبيت العمود الفقري الرقبي العلوي',
    keyMuscles: [
      {
        nameEn: 'Suboccipital muscles and Longus colli',
        nameAr: 'عضلات تحت القذال والعضلة العنقية الطويلة',
        peripheralNerveEn: 'Suboccipital nerve (C1) and cervical plexus (C1–C2)',
        peripheralNerveAr: 'العصب تحت القذالي والضفيرة الرقبية (C1–C2)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Prone or seated; patient extends upper cervical spine against gentle manual resistance on the occiput.',
    testingPositionAr: 'جلوس أو استلقاء بطني؛ يدفع المريض رأسه للخلف ضد مقاومة يد الفاحص الخفيفة على مؤخرة الرأس.',
    differentialClinicalNotesEn: 'Associated with cervicogenic occipital headache or atlanto-axial subluxation in rheumatoid arthritis.',
    differentialClinicalNotesAr: 'يرتبط بالصداع القذالي المنشأ وانخلاع المفصل الفهقي المحوري لدى مرضى التهاب المفاصل الروماتويدي.',
    primarySourceCitation: 'Kendall FP. Muscles: Testing and Function.',
  },
  {
    rootLevel: 'C3',
    regionGroup: 'cervical',
    predominantMovementEn: 'Cervical lateral flexion',
    predominantMovementAr: 'الإمالة الجانبية للرقبة',
    keyMuscles: [
      {
        nameEn: 'Scalenus anterior, medius, and posterior',
        nameAr: 'العضلات الأخمعية (الأمامية، الوسطى، والخلفية)',
        peripheralNerveEn: 'Cervical plexus branches (C3–C4)',
        peripheralNerveAr: 'فروع الضفيرة الرقبية (C3–C4)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Diaphragm (phrenic contribution)',
        nameAr: 'الحجاب الحاجز (العصب الحجابي)',
        peripheralNerveEn: 'Phrenic nerve (C3–C5)',
        peripheralNerveAr: 'العصب الحجابي (C3–C5)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Seated upright; patient tilts ear toward shoulder against resistance applied to lateral temporal bone.',
    testingPositionAr: 'جلوس مستقيم؛ يميل المريض أذنه نحو الكتف ضد مقاومة يد الفاحص على جانب الرأس فوق الأذن.',
    differentialClinicalNotesEn: 'Major contributor to the phrenic nerve (C3–C5); lesions above C3–C4 compromise ventilation.',
    differentialClinicalNotesAr: 'مساهم رئيسي في العصب الحجابي (C3–C5)؛ الإصابات العليا قد تؤثر على التنفس الحجابي.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Magee DJ.',
  },
  {
    rootLevel: 'C4',
    regionGroup: 'cervical',
    predominantMovementEn: 'Shoulder elevation (shrug)',
    predominantMovementAr: 'رفع الكتفين للأعلى (Shoulder Shrug)',
    keyMuscles: [
      {
        nameEn: 'Upper Trapezius',
        nameAr: 'العضلة شبه المنحرفة العلوية',
        peripheralNerveEn: 'Spinal accessory nerve (CN XI) & C3–C4',
        peripheralNerveAr: 'العصب الشوكي الإضافي (CN XI) مع ألياف C3–C4',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Levator scapulae',
        nameAr: 'العضلة رافعة لوح الكتف',
        peripheralNerveEn: 'Dorsal scapular nerve (C3–C5)',
        peripheralNerveAr: 'العصب الكتفي الظهراني (C3–C5)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Seated upright; patient shrugs both shoulders upward toward ears while examiner pushes down firmly.',
    testingPositionAr: 'جلوس مستقيم؛ يرفع المريض كتفيه نحو أذنيه بينما يدفع الفاحص الكتفين للأسفل.',
    differentialClinicalNotesEn: 'Differentiated from isolated CN XI palsy by cervical radicular pain and C4 AC-joint sensory change.',
    differentialClinicalNotesAr: 'يُفرّق عن شلل العصب القحفي الحادي عشر (CN XI) بوجود ألم رقبي جذري ونقص حس فوق المفصل الأخرمي الترقوي.',
    primarySourceCitation: 'Kendall FP. Muscles: Testing and Function.',
  },
  {
    rootLevel: 'C5',
    regionGroup: 'cervical',
    predominantMovementEn: 'Elbow flexion (ASIA C5 Key) & Shoulder abduction (Ortho C5)',
    predominantMovementAr: 'ثني المرفق (معيار ASIA C5) وتبعيد الكتف (الفحص العظمي C5)',
    keyMuscles: [
      {
        nameEn: 'Biceps brachii & Brachialis (ASIA C5 Key Muscle)',
        nameAr: 'ذات الرأسين العضدية والعضدية (العضلة الأساسية في ASIA C5)',
        peripheralNerveEn: 'Musculocutaneous nerve (C5–C6)',
        peripheralNerveAr: 'العصب الجلدي العضلي (C5–C6)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Deltoid & Supraspinatus',
        nameAr: 'العضلة الدالية وفوق الشوكة',
        peripheralNerveEn: 'Axillary nerve & Suprascapular nerve (C5–C6)',
        peripheralNerveAr: 'العصب الإبطي والعصب فوق الكتف (C5–C6)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Infraspinatus & Teres minor',
        nameAr: 'العضلة تحت الشوكة والمدورة الصغيرة',
        peripheralNerveEn: 'Suprascapular & Axillary nerves (C5–C6)',
        peripheralNerveAr: 'العصب فوق الكتف والإبطي (C5–C6)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'ASIA C5: Elbow flexion against resistance with forearm supinated. Ortho C5: Shoulder abduction to 90° against downward resistance.',
    testingPositionAr: 'في ASIA C5: ثني المرفق ضد المقاومة والساعد مستلقٍ. في الفحص العظمي C5: تبعيد الكتف 90 درجة ضد مقاومة للأسفل.',
    differentialClinicalNotesEn: 'Isolated axillary nerve palsy weakens Deltoid while sparing Biceps and C5/C6 reflex. C5 radiculopathy weakens both Deltoid and Biceps and depresses Biceps reflex.',
    differentialClinicalNotesAr: 'التفريق السريري الذهبي: أذية العصب الإبطي المنفردة تضعف الدالية فقط وتبقي ذات الرأسين ومنعكس Biceps سليمين، بينما اعتلال جذر C5 يضعف العضلتين معاً.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Wainner RS et al. Spine (2003).',
  },
  {
    rootLevel: 'C6',
    regionGroup: 'cervical',
    predominantMovementEn: 'Wrist extension (ASIA C6 Key) & Neutral elbow flexion',
    predominantMovementAr: 'بسط الرسغ (معيار ASIA C6) وثني المرفق بالوضع المحايد',
    keyMuscles: [
      {
        nameEn: 'Extensor carpi radialis longus & brevis (ECRL / ECRB — ASIA C6 Key)',
        nameAr: 'باسطة الرسغ الكعبرية الطويلة والقصيرة (معيار ASIA C6)',
        peripheralNerveEn: 'Radial nerve (C6–C7)',
        peripheralNerveAr: 'العصب الكعبري (C6–C7)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Brachioradialis',
        nameAr: 'العضلة العضدية الكعبرية',
        peripheralNerveEn: 'Radial nerve (C5–C6)',
        peripheralNerveAr: 'العصب الكعبري (C5–C6)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Forearm pronated/supported; patient extends wrist toward radial side against resistance.',
    testingPositionAr: 'الساعد مستند؛ يبسط المريض الرسغ للأعلى والجهة الكعبرية ضد مقاومة يد الفاحص.',
    differentialClinicalNotesEn: 'Wrist extension is the official ASIA C6 key motor test. Correlates with Brachioradialis reflex depression and thumb sensation.',
    differentialClinicalNotesAr: 'بسط الرسغ هو الاختبار الحركي المعتمد دولياً لجذر C6 في ASIA. يترافق مع تراجع منعكس العضدية الكعبرية وخدر الإبهام.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Kendall FP.',
  },
  {
    rootLevel: 'C7',
    regionGroup: 'cervical',
    predominantMovementEn: 'Elbow extension (ASIA C7 Key), Wrist flexion & Finger extension',
    predominantMovementAr: 'بسط المرفق (معيار ASIA C7)، ثني الرسغ، وبسط الأصابع',
    keyMuscles: [
      {
        nameEn: 'Triceps brachii (ASIA C7 Key Muscle)',
        nameAr: 'العضلة ثلاثية الرؤوس العضدية (معيار ASIA C7)',
        peripheralNerveEn: 'Radial nerve (C6–C8)',
        peripheralNerveAr: 'العصب الكعبري (C6–C8)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Flexor carpi radialis (FCR)',
        nameAr: 'قابضة الرسغ الكعبرية',
        peripheralNerveEn: 'Median nerve (C6–C7)',
        peripheralNerveAr: 'العصب الناصف (C6–C7)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Extensor digitorum communis (EDC)',
        nameAr: 'باسطة الأصابع المشتركة',
        peripheralNerveEn: 'Posterior interosseous nerve (C7–C8)',
        peripheralNerveAr: 'العصب بين العظام الخلفي (C7–C8)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Shoulder abducted 90° or supported; elbow flexed 45°; patient extends elbow against resistance applied at distal forearm.',
    testingPositionAr: 'الكتف مسند والمرفق مثني 45 درجة؛ يبسط المريض ساعده ضد مقاومة الفاحص على أسفل الساعد.',
    differentialClinicalNotesEn: 'Most commonly injured cervical root. Paired with diminished Triceps reflex and middle finger paresthesia.',
    differentialClinicalNotesAr: 'الجذر الأكثر إصابة بين جذور الرقبة. يرافقه ضعف منعكس Triceps وخدر الإصبع الأوسط.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Wainner RS et al. (2003).',
  },
  {
    rootLevel: 'C8',
    regionGroup: 'cervical',
    predominantMovementEn: 'Finger DIP flexion (ASIA C8 Key) & Thumb extension',
    predominantMovementAr: 'ثني السلامى البعيدة للأصابع (معيار ASIA C8) وبسط الإبهام',
    keyMuscles: [
      {
        nameEn: 'Flexor digitorum profundus — middle finger DIP (ASIA C8 Key)',
        nameAr: 'قابضة الأصابع العميقة — الإصبع الأوسط (معيار ASIA C8)',
        peripheralNerveEn: 'Median nerve — Anterior interosseous (digits 2–3); Ulnar nerve (digits 4–5) (C8–T1)',
        peripheralNerveAr: 'العصب الناصف — بين العظام الأمامي (الإصبع 2–3) والزندي (4–5) (C8–T1)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Extensor pollicis longus (EPL)',
        nameAr: 'باسطة الإبهام الطويلة',
        peripheralNerveEn: 'Posterior interosseous nerve (C7–C8)',
        peripheralNerveAr: 'العصب بين العظام الخلفي (C7–C8)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Forearm supinated; stabilize proximal and middle phalanges of middle finger while patient flexes the DIP joint against resistance.',
    testingPositionAr: 'الساعد مستلقٍ؛ يثبت الفاحص السلاميتين القريبة والوسطى للإصبع الأوسط بينما يثني المريض السلامى البعيدة ضد المقاومة.',
    differentialClinicalNotesEn: 'Differentiate from ulnar nerve entrapment at elbow: C8 lesion impairs median-innervated FPL/FDP(middle) and PIN-innervated EPL as well.',
    differentialClinicalNotesAr: 'يُفرّق عن انضغاط العصب الزندي في نفق المرفق: أذية جذر C8 تضعف أيضاً العضلات المغذاة بالعصب الناصف وبين العظام الخلفي.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised).',
  },
  {
    rootLevel: 'T1',
    regionGroup: 'thoracic',
    predominantMovementEn: 'Little finger abduction (ASIA T1 Key) & Intrinsic hand muscles',
    predominantMovementAr: 'تبعيد إصبع الخنصر (معيار ASIA T1) وعضلات اليد الدقيقة',
    keyMuscles: [
      {
        nameEn: 'Abductor digiti minimi (ADM — ASIA T1 Key Muscle)',
        nameAr: 'مبعدة الخنصر (معيار ASIA T1)',
        peripheralNerveEn: 'Deep branch of ulnar nerve (C8–T1)',
        peripheralNerveAr: 'الفرع العميق للعصب الزندي (C8–T1)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'First dorsal interosseous (FDI) & Abductor pollicis brevis (APB)',
        nameAr: 'العضلة بين العظام الظهرانية الأولى ومبعدة الإبهام القصيرة',
        peripheralNerveEn: 'Ulnar nerve (FDI) & Median recurrent branch (APB) (C8–T1)',
        peripheralNerveAr: 'العصب الزندي (FDI) والعصب الناصف (APB) (C8–T1)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Hand flat; patient abducts little finger away from ring finger against resistance.',
    testingPositionAr: 'اليد منبسطة؛ يباعد المريض إصبع الخنصر عن البنصر ضد مقاومة الفاحص.',
    differentialClinicalNotesEn: 'Combined median (APB) + ulnar (ADM/FDI) intrinsic weakness differentiates T1/lower-trunk TOS from ulnar neuropathy.',
    differentialClinicalNotesAr: 'ضعف APB (الناصف) مع ADM (الزندي) يفرّق اعتلال T1 أو مخرج الصدر عن أذية العصب الزندي المنفردة.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Kendall FP.',
  },
  {
    rootLevel: 'L1',
    regionGroup: 'lumbar',
    predominantMovementEn: 'Hip flexion (upper iliopsoas contribution)',
    predominantMovementAr: 'ثني مفصل الورك (المساهمة العلوية للحرقفية القطنية)',
    keyMuscles: [
      {
        nameEn: 'Psoas major (upper fibers)',
        nameAr: 'العضلة القطنية الكبرى (الألياف العلوية)',
        peripheralNerveEn: 'Lumbar plexus anterior rami (L1–L3)',
        peripheralNerveAr: 'الفروع الأمامية للضفيرة القطنية (L1–L3)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Seated or supine; patient flexes hip against resistance on distal anterior thigh.',
    testingPositionAr: 'جلوس أو استلقاء؛ يثني المريض الورك ضد مقاومة على أسفل الفخذ الأمامي.',
    differentialClinicalNotesEn: 'Overlaps heavily with L2; isolated L1 motor weakness is uncommon.',
    differentialClinicalNotesAr: 'يتداخل بشدة مع L2؛ ضعف L1 الحركي المنفرد نادر سريرياً.',
    primarySourceCitation: "Magee DJ; DeJong's Neurologic Examination.",
  },
  {
    rootLevel: 'L2',
    regionGroup: 'lumbar',
    predominantMovementEn: 'Hip flexion (ASIA L2 Key) & Hip adduction',
    predominantMovementAr: 'ثني الورك (معيار ASIA L2) وتقريب الورك',
    keyMuscles: [
      {
        nameEn: 'Iliopsoas (Psoas major & Iliacus — ASIA L2 Key Muscle)',
        nameAr: 'العضلة الحرقفية القطنية (معيار ASIA L2)',
        peripheralNerveEn: 'Anterior rami L1–L3 (Psoas major) & Femoral nerve L2–L3 (Iliacus)',
        peripheralNerveAr: 'الفروع الأمامية L1–L3 (القطنية الكبرى) والعصب الفخذي L2–L3 (الحرقفية)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Hip Adductors (Adductor longus, brevis, magnus)',
        nameAr: 'عضلات تقريب الفخذ',
        peripheralNerveEn: 'Obturator nerve (L2–L4)',
        peripheralNerveAr: 'العصب الساد (L2–L4)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Supine (ASIA) or seated; flex hip to 90° against downward resistance applied just above the knee.',
    testingPositionAr: 'استلقاء (ASIA) أو جلوس؛ يثني المريض الورك ضد مقاومة للأسفل فوق الركبة مباشرة.',
    differentialClinicalNotesEn: 'L2 is the official ASIA key level for hip flexors; testing hip adductors (obturator n.) distinguishes L2 root from femoral neuropathy.',
    differentialClinicalNotesAr: 'المستوى الحركي المعتمد في ASIA لثني الورك؛ فحص المقربات (العصب الساد) يفرّق اعتلال جذر L2 عن أذية العصب الفخذي.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Kendall FP.',
  },
  {
    rootLevel: 'L3',
    regionGroup: 'lumbar',
    predominantMovementEn: 'Knee extension (ASIA L3 Key) & Hip adduction',
    predominantMovementAr: 'بسط الركبة (معيار ASIA L3) وتقريب الورك',
    keyMuscles: [
      {
        nameEn: 'Quadriceps femoris (ASIA L3 Key Muscle)',
        nameAr: 'العضلة رباعية الرؤوس الفخذية (معيار ASIA L3)',
        peripheralNerveEn: 'Femoral nerve (L2–L4)',
        peripheralNerveAr: 'العصب الفخذي (L2–L4)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Supine with knee supported at ~30° flexion (ASIA) or seated at 90°; patient extends knee against resistance above ankle.',
    testingPositionAr: 'استلقاء مع إسناد الركبة بزاوية 30 درجة (ASIA) أو جلوس بزاوية 90 درجة؛ يبسط المريض الركبة ضد مقاومة فوق الكاحل.',
    differentialClinicalNotesEn: 'Official ASIA L3 key motor level. Overlaps L4 in Quadriceps and patellar reflex.',
    differentialClinicalNotesAr: 'المستوى الحركي المعتمد في ASIA لباسطات الركبة. يتداخل مع L4 في رباعية الرؤوس ومنعكس الرضفة.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Magee DJ.',
  },
  {
    rootLevel: 'L4',
    regionGroup: 'lumbar',
    predominantMovementEn: 'Ankle dorsiflexion & inversion (ASIA L4 Key)',
    predominantMovementAr: 'العطف الظهري للكاحل والانقلاب الداخلي (معيار ASIA L4)',
    keyMuscles: [
      {
        nameEn: 'Tibialis anterior (ASIA L4 Key Muscle)',
        nameAr: 'العضلة الظنبوبية الأمامية (معيار ASIA L4)',
        peripheralNerveEn: 'Deep fibular (peroneal) nerve (L4–L5)',
        peripheralNerveAr: 'العصب الشظوي العميق (L4–L5)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Quadriceps femoris (shared L3–L4 contribution)',
        nameAr: 'رباعية الرؤوس الفخذية (مساهمة مشتركة L3–L4)',
        peripheralNerveEn: 'Femoral nerve (L2–L4)',
        peripheralNerveAr: 'العصب الفخذي (L2–L4)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Supine or seated; patient dorsiflexes ankle against downward resistance on dorsomedial foot.',
    testingPositionAr: 'استلقاء أو جلوس؛ يرفع المريض قدمه للأعلى والداخل ضد مقاومة الفاحص على ظهر القدم.',
    differentialClinicalNotesEn: 'Official ASIA L4 key motor level. Correlates with patellar reflex and medial malleolus sensation.',
    differentialClinicalNotesAr: 'المستوى الحركي المعتمد في ASIA لرفع القدم. يتطابق مع منعكس الرضفة وإحساس الكعب الإنسي.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); van der Windt DA et al. Cochrane (2010).',
  },
  {
    rootLevel: 'L5',
    regionGroup: 'lumbar',
    predominantMovementEn: 'Great toe extension (ASIA L5 Key) & Hip abduction',
    predominantMovementAr: 'بسط إبهام القدم (معيار ASIA L5) وتبعيد الورك',
    keyMuscles: [
      {
        nameEn: 'Extensor hallucis longus (EHL — ASIA L5 Key Muscle)',
        nameAr: 'باسطة إبهام القدم الطويلة (معيار ASIA L5)',
        peripheralNerveEn: 'Deep fibular (peroneal) nerve (L5–S1)',
        peripheralNerveAr: 'العصب الشظوي العميق (L5–S1)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Gluteus medius & minimus',
        nameAr: 'الألوية الوسطى والصغرى',
        peripheralNerveEn: 'Superior gluteal nerve (L4–S1, predominantly L5)',
        peripheralNerveAr: 'العصب الإليوي العلوي (L4–S1، أساساً L5)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Tibialis posterior & Extensor digitorum longus',
        nameAr: 'الظنبوبية الخلفية وباسطة أصابع القدم الطويلة',
        peripheralNerveEn: 'Tibial nerve (TP) & Deep fibular nerve (EDL)',
        peripheralNerveAr: 'العصب الظنبوبي (TP) والشظوي العميق (EDL)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Great toe dorsiflexion against downward pressure on proximal/distal phalanx; hip abduction tested side-lying.',
    testingPositionAr: 'يرفع المريض إبهام قدمه للأعلى ضد مقاومة؛ ويُفحص تبعيد الورك بالاستلقاء الجانبي.',
    differentialClinicalNotesEn: 'Common fibular nerve compression at fibular neck weakens EHL/TA but SPARES Gluteus medius and Tibialis posterior; L5 radiculopathy weakens them too.',
    differentialClinicalNotesAr: 'انضغاط العصب الشظوي عند رأس الشظية يضعف EHL ورفع القدم لكنه يُبقي الألوية الوسطى والظنبوبية الخلفية سليمتين؛ بينما اعتلال جذر L5 يضعفهما أيضاً.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Kendall FP; Magee DJ.',
  },
  {
    rootLevel: 'S1',
    regionGroup: 'sacral',
    predominantMovementEn: 'Ankle plantarflexion (ASIA S1 Key), Foot eversion & Hip extension',
    predominantMovementAr: 'العطف الأخمصي للكاحل (معيار ASIA S1)، قلب القدم للخارج، وبسط الورك',
    keyMuscles: [
      {
        nameEn: 'Gastrocnemius & Soleus (ASIA S1 Key Muscle)',
        nameAr: 'عضلات ربلة الساق الساقية والنعلية (معيار ASIA S1)',
        peripheralNerveEn: 'Tibial nerve (S1–S2)',
        peripheralNerveAr: 'العصب الظنبوبي (S1–S2)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Fibularis (Peroneus) longus & brevis',
        nameAr: 'العضلة الشظوية الطويلة والقصيرة',
        peripheralNerveEn: 'Superficial fibular nerve (L5–S1)',
        peripheralNerveAr: 'العصب الشظوي السطحي (L5–S1)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Gluteus maximus',
        nameAr: 'العضلة الألوية الكبرى',
        peripheralNerveEn: 'Inferior gluteal nerve (L5–S2)',
        peripheralNerveAr: 'العصب الإليوي السفلي (L5–S2)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Weight-bearing: single-leg heel raises (≥10 reps). Supine (ASIA): forceful plantarflexion against examiner resistance.',
    testingPositionAr: 'بالوقوف: رفع العقب المتكرر على قدم واحدة (10 مرات). بالاستلقاء (ASIA): دفع القدم للأسفل ضد مقاومة الفاحص.',
    differentialClinicalNotesEn: 'Manual testing in bed often misses Grade 4 calf weakness; single-leg heel raises are essential in ambulatory patients. Correlates with Achilles reflex.',
    differentialClinicalNotesAr: 'الفحص اليدوي بالسرير يغفل ضعف الدرجة 4 في ربلة الساق؛ رفع العقب بالوقوف على ساق واحدة ضروري للمرضى القادرين على الوقوف.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Bohannon RW (2005).',
  },
  {
    rootLevel: 'S2',
    regionGroup: 'sacral',
    predominantMovementEn: 'Knee flexion & intrinsic toe flexion',
    predominantMovementAr: 'ثني مفصل الركبة وثني أصابع القدم',
    keyMuscles: [
      {
        nameEn: 'Hamstrings (Biceps femoris, Semitendinosus, Semimembranosus)',
        nameAr: 'عضلات خلف الفخذ (المأبضيات)',
        peripheralNerveEn: 'Sciatic nerve (L5–S2)',
        peripheralNerveAr: 'العصب الوركي (L5–S2)',
        isPrimaryRoot: true,
      },
      {
        nameEn: 'Flexor digitorum longus (FDL) & Flexor hallucis longus (FHL)',
        nameAr: 'قابضات أصابع القدم الطويلة',
        peripheralNerveEn: 'Tibial nerve (S1–S2)',
        peripheralNerveAr: 'العصب الظنبوبي (S1–S2)',
        isPrimaryRoot: false,
      },
    ],
    testingPositionEn: 'Prone; knee flexed to 60–70°; examiner resists further flexion at the posterior ankle.',
    testingPositionAr: 'استلقاء بطني؛ يثني المريض ركبته 60–70 درجة ويقاوم سحب الفاحص للكاحل.',
    differentialClinicalNotesEn: 'Hamstrings span L5–S2; S2 lesions also affect intrinsic foot musculature.',
    differentialClinicalNotesAr: 'تتلقى عضلات خلف الفخذ تعصيباً مشتركاً من L5 إلى S2، ويؤثر ضعف S2 أيضاً على عضلات باطن القدم.',
    primarySourceCitation: "Kendall FP; DeJong's Neurologic Examination.",
  },
  {
    rootLevel: 'S3',
    regionGroup: 'sacral',
    predominantMovementEn: 'Voluntary anal sphincter contraction (VAC) & pelvic floor',
    predominantMovementAr: 'الانقباض الإرادي للمصرة الشرجية الخارجية ودعم قاع الحوض',
    keyMuscles: [
      {
        nameEn: 'External anal sphincter & Levator ani',
        nameAr: 'المصرة الشرجية الخارجية والعضلة رافعة الشرج',
        peripheralNerveEn: 'Pudendal nerve (S2–S4)',
        peripheralNerveAr: 'العصب الفرجي (S2–S4)',
        isPrimaryRoot: true,
      },
    ],
    testingPositionEn: 'Specialized VAC / pelvic floor assessment (used in SCI sacral sparing and Cauda Equina screening).',
    testingPositionAr: 'تقييم سريري متخصص للتحكم الإرادي بالمصرة وقاع الحوض (الإبقاء العجزي ومتلازمة ذيل الفرس).',
    differentialClinicalNotesEn: 'EMERGENCY RED FLAG: Bilateral loss of S3–S4 sphincter function with saddle anesthesia constitutes Cauda Equina Syndrome requiring urgent surgical MRI triage.',
    differentialClinicalNotesAr: 'علامة حمراء طارئة: فقدان التحكم بالمصرة الشرجية أو البولية مع خدر السرج يمثل متلازمة ذيل الفرس ويستدعي تحويلاً جراحياً فورياً.',
    primarySourceCitation: 'ASIA / ISNCSCI Standards (2019 Revised); Finucane LM et al. JOSPT (2020).',
  },
];

export function getMyotomeByRoot(root: SpinalLevel): MyotomeDefinition | undefined {
  return MYOTOME_DEFINITIONS.find((m) => m.rootLevel === root);
}

export function searchMyotomes(query: string): MyotomeDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return MYOTOME_DEFINITIONS;
  const words = q.split(/\s+/).filter(Boolean);

  return MYOTOME_DEFINITIONS.filter((m) => {
    const textCorpus = [
      m.rootLevel,
      m.predominantMovementEn,
      m.predominantMovementAr,
      m.testingPositionEn,
      m.testingPositionAr,
      m.differentialClinicalNotesEn,
      m.differentialClinicalNotesAr,
      ...m.keyMuscles.flatMap((k) => [
        k.nameEn,
        k.nameAr,
        k.peripheralNerveEn,
        k.peripheralNerveAr,
      ]),
    ]
      .join(' ')
      .toLowerCase();

    return words.every((w) => textCorpus.includes(w));
  });
}

export const MYOTOMES_CATALOG_GOVERNANCE = {
  source: 'ASIA / ISNCSCI (2019 Revised) 10 Key Muscles & Kendall/Magee Comprehensive Clinical Myotome Screening',
  reviewedBy: null as string | null,
  reviewedDate: null as string | null,
};
