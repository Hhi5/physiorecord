// =======================================================================
// PhysioRecord — Synthetic Clinical Demonstration Data (CC0-1.0)
// Original fictional Iraqi patients, +964 phones, and Iraqi cities/districts
// used by tests, demos, screenshots, and Public Demo Mode (Phase F4).
// =======================================================================

import type { PatientClinicalData } from '../types/clinical';

export interface SyntheticPatientSeed extends PatientClinicalData {
  id: string;
}

export const SYNTHETIC_DATA_LICENSE = 'CC0-1.0' as const;

export const IRAQI_SYNTHETIC_CITIES_AND_DISTRICTS: ReadonlyArray<{
  cityAr: string;
  cityEn: string;
  districtAr: string;
  districtEn: string;
  landmarkAr: string;
}> = [
  {
    cityAr: 'بغداد',
    cityEn: 'Baghdad',
    districtAr: 'المنصور',
    districtEn: 'Al-Mansour',
    landmarkAr: 'قرب تقاطع الرواد — شارع 14 رمضان',
  },
  {
    cityAr: 'بغداد',
    cityEn: 'Baghdad',
    districtAr: 'الكرادة',
    districtEn: 'Al-Karrada',
    landmarkAr: 'قرب ساحة كهرمانة — الكرادة داخل',
  },
  {
    cityAr: 'البصرة',
    cityEn: 'Basra',
    districtAr: 'العشار',
    districtEn: 'Al-Ashar',
    landmarkAr: 'قرب كورنيش شط العرب — شارع الوطن',
  },
  {
    cityAr: 'أربيل',
    cityEn: 'Erbil',
    districtAr: 'عينكاوا',
    districtEn: 'Ankawa',
    landmarkAr: 'قرب شارع 100 متر — عينكاوا',
  },
  {
    cityAr: 'النجف',
    cityEn: 'Najaf',
    districtAr: 'حي السعد',
    districtEn: 'Al-Saad District',
    landmarkAr: 'قرب شارع الروان — مجاور مستشفى الصدر',
  },
  {
    cityAr: 'نينوى — الموصل',
    cityEn: 'Nineveh — Mosul',
    districtAr: 'حي الزهور',
    districtEn: 'Al-Zuhoor',
    landmarkAr: 'قرب دورة العبادي — الجانب الأيسر',
  },
  {
    cityAr: 'كربلاء',
    cityEn: 'Karbala',
    districtAr: 'حي الحسين',
    districtEn: 'Al-Hussein District',
    landmarkAr: 'قرب شارع السناتر — مقابل الصيدلية المركزية',
  },
  {
    cityAr: 'السليمانية',
    cityEn: 'Sulaymaniyah',
    districtAr: 'بختياري',
    districtEn: 'Bakhtyari',
    landmarkAr: 'قرب شارع سالم — مجمع العيادات التخصصية',
  },
];

const LEGACY_DEMO_PHONE_REPLACEMENTS: Readonly<Record<string, string>> = {
  '+964 770 123 4567': '+964 700 000 0147',
  '0770 123 4567': '+964 700 000 0147',
  '+964 780 987 6543': '+964 700 000 0283',
  '0780 987 6543': '+964 700 000 0283',
  '+964 790 321 0987': '+964 700 000 0391',
  '0790 321 0987': '+964 700 000 0391',
  '+964 771 789 1234': '+964 700 000 0465',
  '0771 789 1234': '+964 700 000 0465',
  '+964 750 216 5498': '+964 700 000 0528',
  '0750 216 5498': '+964 700 000 0528',
};

export function sanitizeLegacyDemoPhone(rawPhone?: string | null, fallbackIndex = 1): string {
  if (!rawPhone) return `+964 700 000 ${String(1000 + (fallbackIndex % 8999)).padStart(4, '0')}`;
  const trimmed = rawPhone.trim();
  if (LEGACY_DEMO_PHONE_REPLACEMENTS[trimmed]) {
    return LEGACY_DEMO_PHONE_REPLACEMENTS[trimmed];
  }
  return trimmed;
}

export const SYNTHETIC_PATIENTS: SyntheticPatientSeed[] = [
  {
    id: "syn-patient-001",
    mrn: "PT-000001",
    isDemo: true,
    fullName: "Mazin Raed Al-Rubaie",
    fullNameAr: "مازن رائد الربيعي",
    dateOfBirth: "1994-06-18",
    age: 32,
    gender: "male",
    phone: "+964 700 000 0147",
    phoneNumber: "+964 700 000 0147",
    address: "بغداد — المنصور",
    occupation: "مهندس شبكات ورياضي هاوٍ",
    dominantHand: "right",
    medicalHistory: "إصابة رياضية بقطع كامل في الرباط الصليبي الأمامي للركبة اليمنى أثناء مباراة كرة قدم.",
    previousSurgeries: "جراحة ترميم الرباط الصليبي الأمامي وزراعة وتر الركبة الذاتي قبل 4 أسابيع.",
    currentMedications: "باراسيتامول 1 جم عند الحاجة، مكملات كالسيوم وفيتامين د.",
    allergies: "لا يوجد حساسية دوائية معروفة",
    comorbidities: "لا يوجد أمراض مزمنة مصاحبة.",
    precautions: "تجنب تمارين السلسلة الحركية المفتوحة لربلة الركبة بين زوايا 0-45 درجة للشهرين الأولين. الالتزام بالدعامة الحركية أثناء المشي.",
    redFlags: "مراقبة علامات تجلط الأوردة العميقة (DVT): أي تورم مفاجئ أو حرارة موضعية في عضلة الساق تتطلب إحالة إسعافية فورية.",
    psychosocialFactors: "دافعية عالية جداً للعودة للرياضة، مع بعض القلق المبدئي من تحميل الوزن الكامل.",
    generalNotes: "المريض ملتزم بالتعليمات ولديه وعي حركي ممتاز. الجلسات تركز حالياً على استعادة الامتداد الكامل للركبة وتنشيط العضلة رباعية الرؤوس."
  },
  {
    id: "syn-patient-002",
    mrn: "PT-000002",
    isDemo: true,
    fullName: "Salwa Qasim Al-Taie",
    fullNameAr: "سلوى قاسم الطائي",
    dateOfBirth: "1964-10-11",
    age: 62,
    gender: "female",
    phone: "+964 700 000 0283",
    phoneNumber: "+964 700 000 0283",
    address: "بغداد — الكرادة",
    occupation: "مشرفة تربوية متقاعدة",
    dominantHand: "right",
    medicalHistory: "جلطة دماغية نقص تروية في الشريان الدماغي الأوسط الأيسر قبل 3 أشهر، نتج عنها شلل نصفي أيمن مع حبسة كلامية خفيفة.",
    previousSurgeries: "لا يوجد جراحات سابقة.",
    currentMedications: "أسبرين 81 مجم، أتورفاستاتين 40 مجم، أملوديبين 5 مجم.",
    allergies: "حساسية من البنسلين.",
    comorbidities: "ارتفاع ضغط الدم، خلل دهون الدم.",
    precautions: "خطر السقوط، استخدام حزام الأمان للنقل، مراقبة ضغط الدم قبل وبعد الجلسة.",
    redFlags: "ارتفاع ضغط الدم الانقباضي فوق 180 ملم زئبق أثناء الجهد يتطلب إيقاف الجلسة فوراً.",
    psychosocialFactors: "دعم عائلي ممتاز من الأبناء، تعاني من إحباط أحياناً بسبب صعوبة استخدام اليد اليمنى في الكتابة.",
    generalNotes: "التركيز على إعادة التأهيل العصبي: التدريب على التوازن، استعادة نمط المشي المتناسق، وتسهيل حركات الطرف العلوي الأيمن."
  },
  {
    id: "syn-patient-003",
    mrn: "PT-000003",
    isDemo: true,
    fullName: "Jasim Tariq Al-Nuaimi",
    fullNameAr: "جاسم طارق النعيمي",
    dateOfBirth: "1959-03-22",
    age: 67,
    gender: "male",
    phone: "+964 700 000 0391",
    phoneNumber: "+964 700 000 0391",
    address: "البصرة — العشار",
    occupation: "تاجر مواد غذائية",
    dominantHand: "right",
    medicalHistory: "مرض شرايين تاجية ثلاثي الوعاء. خضع لجراحة مجازة الشريان التاجي قبل 6 أسابيع. تحويل لبرنامج التأهيل القلبي الرئوي من الدرجة الثانية.",
    previousSurgeries: "جراحة مجازة الشريان التاجي وشق القص قبل 6 أسابيع.",
    currentMedications: "بيسوبرولول 5 مجم، ليزينوبريل 10 مجم، أتورفاستاتين 80 مجم، أسبرين.",
    allergies: "لا يوجد.",
    comorbidities: "داء السكري من النوع الثاني.",
    precautions: "احتياطات عظم القص: عدم رفع أكثر من 3 كجم، تجنب الدفع أو السحب بقوة بكلتا اليدين لمدة 8 أسابيع بعد الجراحة.",
    redFlags: "ألم في الصدر، ضيق تنفس حاد غير متناسب، عدم انتظام ضربات القلب، أو هبوط تشبع الأكسجين تحت 90%.",
    psychosocialFactors: "حرص كبير على تحسين كفاءة القلب وممارسة المشي بانتظام.",
    generalNotes: "يتم قياس العلامات الحيوية بدقة (النبض، ضغط الدم، تشبع الأكسجين، ومقياس بورغ للجهد الإدراكي)."
  },
  {
    id: "syn-patient-004",
    mrn: "PT-000004",
    isDemo: true,
    fullName: "Karam Mohanad Al-Bayati",
    fullNameAr: "كرم مهند البياتي",
    dateOfBirth: "2018-08-09",
    age: 8,
    gender: "male",
    phone: "+964 700 000 0465",
    phoneNumber: "+964 700 000 0465",
    address: "أربيل — عينكاوا",
    occupation: "طالب بالمرحلة الابتدائية",
    dominantHand: "left",
    medicalHistory: "شلل دماغي تشنجي ثنائي الطرفين ناتج عن ولادة مبكرة (30 أسبوع حمل).",
    previousSurgeries: "حقن توكسين البوتولينوم في عضلات الساقين القابضة قبل 4 أشهر.",
    currentMedications: "باكلوفين شراب.",
    allergies: "لا يوجد.",
    comorbidities: "صعوبات طفيفة في التناسق الحركي البصري.",
    precautions: "",
    redFlags: "",
    psychosocialFactors: "طفل محب للعب والتعلم، يتفاعل بشكل إيجابي مع الجلسات المعتمدة على الألعاب الحركية.",
    generalNotes: "التركيز على إطالة عضلات الساق المشدودة، تقوية عضلات الجذع وعضلات الحوض، وتحسين نمط المشي المستقل بدون عكازات."
  },
  {
    id: "syn-patient-005",
    mrn: "PT-000005",
    isDemo: true,
    fullName: "Rana Waleed Al-Ameri",
    fullNameAr: "رنا وليد العامري",
    dateOfBirth: "1977-05-19",
    age: 49,
    gender: "female",
    phone: "+964 700 000 0528",
    phoneNumber: "+964 700 000 0528",
    address: "النجف — حي السعد",
    occupation: "مهندسة معمارية",
    dominantHand: "right",
    medicalHistory: "التهاب محفظة الكتف اللاصق بالكتف الأيمن في مرحلة التيبس، مصحوب بمتلازمة انحشار الكفة المدورة.",
    previousSurgeries: "لا يوجد.",
    currentMedications: "إيبوبروفين 400 مجم عند اللزوم، حقنة كورتيزون موضعية بالمفصل قبل شهرين.",
    allergies: "حساسية من السلفا.",
    comorbidities: "داء السكري من النوع الثاني.",
    precautions: "",
    redFlags: "",
    psychosocialFactors: "إجهاد مهني بسبب حاجة عملها الهندسي والمكتبي إلى تثبيت الكتف لساعات طويلة.",
    generalNotes: "الخطة تتضمن تحريك المفصل بدرجات حرية متزايدة، وإبر جافة للزناد العضلي، وبرنامج منزلي يومي باستخدام عصا القياس والبكرة."
  }
];

const EXTRA_IRAQI_SYNTHETIC_TEMPLATES: ReadonlyArray<{
  firstAr: string;
  firstEn: string;
  fatherAr: string;
  fatherEn: string;
  familyAr: string;
  familyEn: string;
  gender: 'male' | 'female';
  birthYear: number;
  occupationAr: string;
  historyAr: string;
  carrierPrefix: '770' | '771' | '780' | '781' | '790' | '750';
}> = [
  {
    firstAr: 'حسنين',
    firstEn: 'Hassanein',
    fatherAr: 'علي',
    fatherEn: 'Ali',
    familyAr: 'الكاظمي',
    familyEn: 'Al-Kadhimi',
    gender: 'male',
    birthYear: 1988,
    occupationAr: 'موظف مصرفي',
    historyAr: 'انزلاق غضروفي قطني بين الفقرتين L4-L5 مع ألم جذري يمتد للطرف السفلي الأيسر.',
    carrierPrefix: '770',
  },
  {
    firstAr: 'زينب',
    firstEn: 'Zainab',
    fatherAr: 'حيدر',
    fatherEn: 'Haider',
    familyAr: 'الربيعي',
    familyEn: 'Al-Rubaie',
    gender: 'female',
    birthYear: 1993,
    occupationAr: 'صيدلانية',
    historyAr: 'متلازمة الألم الرضفي الفخذي بالركبة اليسرى نتيجة صعود السلالم المتكرر.',
    carrierPrefix: '780',
  },
  {
    firstAr: 'عمر',
    firstEn: 'Omar',
    fatherAr: 'طارق',
    fatherEn: 'Tariq',
    familyAr: 'الجبوري',
    familyEn: 'Al-Jubouri',
    gender: 'male',
    birthYear: 1981,
    occupationAr: 'مدرس تربية رياضية',
    historyAr: 'التهاب اللفافة الأخمصية المزمن بالقدم اليمنى مع تيبس صباحي.',
    carrierPrefix: '790',
  },
  {
    firstAr: 'نور',
    firstEn: 'Noor',
    fatherAr: 'باسم',
    fatherEn: 'Basim',
    familyAr: 'الدليمي',
    familyEn: 'Al-Dulaimi',
    gender: 'female',
    birthYear: 1999,
    occupationAr: 'مصممة جرافيك',
    historyAr: 'ألم رقبي ميكانيكي مع صداع عنقي المنشأ مرتبط بالجلوس الطويل أمام الحاسوب.',
    carrierPrefix: '750',
  },
  {
    firstAr: 'مصطفى',
    firstEn: 'Mustafa',
    fatherAr: 'كريم',
    fatherEn: 'Kareem',
    familyAr: 'الزبيدي',
    familyEn: 'Al-Zubaidi',
    gender: 'male',
    birthYear: 1974,
    occupationAr: 'مهندس مدني',
    historyAr: 'خشونة مفصل الركبة الثنائية من الدرجة الثانية مع ضعف العضلة رباعية الرؤوس.',
    carrierPrefix: '771',
  },
];

/**
 * Deterministic CC0-1.0 Iraqi synthetic patient & clinic dataset generator
 * for automated tests, offline demos, and screenshots (Phase F4).
 */
export function generateSyntheticIraqiPatients(options?: {
  count?: number;
  seedOffset?: number;
}): SyntheticPatientSeed[] {
  const count = Math.max(1, Math.min(50, options?.count ?? SYNTHETIC_PATIENTS.length));
  const seedOffset = Math.max(0, options?.seedOffset ?? 0);
  const results: SyntheticPatientSeed[] = [];

  for (let i = 0; i < count; i++) {
    if (i < SYNTHETIC_PATIENTS.length && seedOffset === 0) {
      results.push({ ...SYNTHETIC_PATIENTS[i] });
      continue;
    }

    const idx = i + seedOffset;
    const tpl = EXTRA_IRAQI_SYNTHETIC_TEMPLATES[idx % EXTRA_IRAQI_SYNTHETIC_TEMPLATES.length];
    const loc =
      IRAQI_SYNTHETIC_CITIES_AND_DISTRICTS[idx % IRAQI_SYNTHETIC_CITIES_AND_DISTRICTS.length];
    const seqNum = i + 1;
    const mrn = `PT-${String(seqNum).padStart(6, '0')}`;
    const last4 = String(1000 + ((idx * 731) % 8999)).padStart(4, '0');
    const phone = `+964 700 000 ${last4}`;
    const age = 2026 - tpl.birthYear;
    const month = String((idx % 12) + 1).padStart(2, '0');
    const day = String(((idx * 3) % 27) + 1).padStart(2, '0');

    results.push({
      id: `syn-patient-${String(seqNum).padStart(3, '0')}`,
      mrn,
      isDemo: true,
      fullName: `${tpl.firstEn} ${tpl.fatherEn} ${tpl.familyEn}`,
      fullNameAr: `${tpl.firstAr} ${tpl.fatherAr} ${tpl.familyAr}`,
      dateOfBirth: `${tpl.birthYear}-${month}-${day}`,
      age,
      gender: tpl.gender,
      phone,
      phoneNumber: phone,
      address: `${loc.cityAr} — ${loc.districtAr}`,
      occupation: tpl.occupationAr,
      dominantHand: idx % 5 === 0 ? 'left' : 'right',
      medicalHistory: tpl.historyAr,
      previousSurgeries: 'لا يوجد جراحات سابقة.',
      currentMedications: 'باراسيتامول عند اللزوم.',
      allergies: 'لا يوجد حساسية دوائية معروفة',
      comorbidities: 'لا يوجد أمراض مزمنة مصاحبة.',
      precautions: 'مراعاة التدرج في التحميل الحركي وتجنب الإجهاد المفاجئ.',
      redFlags: '',
      psychosocialFactors: 'تعاون ممتاز مع برنامج التمارين العلاجية المنزلية.',
      generalNotes: `بيانات تجريبية أصلية (CC0-1.0) — ${loc.cityAr} (${loc.landmarkAr}).`,
    });
  }

  return results;
}

