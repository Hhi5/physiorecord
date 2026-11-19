// =======================================================================
// PhysioRecord — Regional Red-Flag Screening Checklists (Phase 3.4 & 3.8)
// Original clinical synthesis written in our own words with primary peer-reviewed citations
// and explicit content governance metadata (`source`, `reviewedBy`, `reviewedDate`).
// =======================================================================

import type { ClinicalContentGovernance } from '../../types/clinical';

export interface RedFlagChecklistDefinition {
  itemId: string;
  regionId:
    | 'lumbar_pelvis'
    | 'cervical_craniovertebral'
    | 'thoracic_systemic'
    | 'lower_extremity'
    | 'upper_extremity';
  labelAr: string;
  labelEn: string;
  rationaleAr: string;
  rationaleEn: string;
  citation: string;
  urgency: 'immediate_emergency' | 'prompt_medical_referral' | 'precaution_screen';
  governance: ClinicalContentGovernance;
}

export interface RedFlagRegionGroup {
  regionId: RedFlagChecklistDefinition['regionId'];
  titleAr: string;
  titleEn: string;
  citation: string;
}

export const RED_FLAG_REGION_GROUPS: RedFlagRegionGroup[] = [
  {
    regionId: 'lumbar_pelvis',
    titleAr: 'العمود القطني والحوض (مثل ذيل الفرس والكسر)',
    titleEn: 'Lumbar Spine & Pelvis (Cauda Equina, Fracture, Progressive Deficit)',
    citation: 'Finucane et al. JOSPT 2020; Greenhalgh et al. BMJ Open 2018.',
  },
  {
    regionId: 'cervical_craniovertebral',
    titleAr: 'العمود العنقي وأعلى الرقبة (اعتلال النخاع والأوعية الدماغية)',
    titleEn: 'Cervical & Craniovertebral Region (Myelopathy, Vascular Screening)',
    citation: 'Rushton et al. IFOMPT Framework 2023; Cook et al. J Orthop Sports Phys Ther 2010.',
  },
  {
    regionId: 'thoracic_systemic',
    titleAr: 'العمود الصدري والأعراض الجهازية (الأورام والعدوى والقلبية)',
    titleEn: 'Thoracic Spine & Systemic Signs (Malignancy, Infection, Cardiopulmonary)',
    citation: 'Henschke et al. BMJ 2013; Downie et al. BMJ 2013.',
  },
  {
    regionId: 'lower_extremity',
    titleAr: 'الطرف السفلي (الخثار الوريدي العميق DVT والكسور الخفية والعدوى المفصلية)',
    titleEn: 'Lower Extremity (DVT, Occult/Stress Fracture, Septic Joint)',
    citation: 'Wells et al. NEJM 2003; Ottawa Ankle & Knee Rules (Stiell et al. JAMA 1994/1995).',
  },
  {
    regionId: 'upper_extremity',
    titleAr: 'الطرف العلوي (النقص العصبي/الوعائي أو العلامات الصدرية العلوية)',
    titleEn: 'Upper Extremity (Vascular Compromise, Acute Neuro Deficit, Apical Signs)',
    citation: 'Finucane et al. JOSPT 2020; NICE Suspected Cancer & MSK Red Flags.',
  },
];

export const RED_FLAG_CHECKLIST_CATALOG: RedFlagChecklistDefinition[] = [
  // --- LUMBAR & PELVIS ---
  {
    itemId: 'rf_lumb_cauda_equina',
    regionId: 'lumbar_pelvis',
    labelAr: 'اضطراب التحكم بالبول أو البراز أو خدر منطقة السرج (اشتباه متلازمة ذيل الفرس)',
    labelEn: 'New bladder/bowel retention or incontinence, or saddle anesthesia (Cauda Equina)',
    rationaleAr: 'تجمع أعراض احتباس البول أو فقدان الإحساس العجاني يستدعي تقييماً إسعافياً عاجلاً لجراحة الأعصاب.',
    rationaleEn: 'Sphincter dysfunction or perineal sensory loss requires emergency surgical evaluation.',
    citation: 'Finucane et al., JOSPT 2020 (IFOMPT Spinal Red Flags Framework).',
    urgency: 'immediate_emergency',
    governance: {
      source: 'Finucane LM et al. International Framework for Red Flags for Potential Serious Spinal Pathologies. JOSPT 2020.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
  {
    itemId: 'rf_lumb_progressive_neuro',
    regionId: 'lumbar_pelvis',
    labelAr: 'ضعف حركي مترقٍ بسرعة أو سقوط قدم حديث في الأطراف السفلية',
    labelEn: 'Rapidly progressive lower-limb motor weakness or acute foot drop',
    rationaleAr: 'تدهور القوة العصبية خلال أيام أو إصابة ثنائية الجانب قد يعكس انضغاطاً جذرياً شديداً.',
    rationaleEn: 'Progressive myotomal deficit warrants urgent physician correlation before manual therapy.',
    citation: 'Finucane et al., JOSPT 2020.',
    urgency: 'prompt_medical_referral',
    governance: {
      source: 'Finucane LM et al. JOSPT 2020.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
  {
    itemId: 'rf_lumb_fracture',
    regionId: 'lumbar_pelvis',
    labelAr: 'ألم ظهري حاد بعد رض كبير أو مع هشاشة عظام / استخدام طويل للستيرويدات',
    labelEn: 'Acute focal spinal pain after significant trauma, or minor trauma with osteoporosis / chronic steroids',
    rationaleAr: 'يرفع احتمال وجود كسر انضغاطي فقري يمنع معه التحريك القسري.',
    rationaleEn: 'Increases suspicion for vertebral compression fracture prior to mechanical loading.',
    citation: 'Downie et al., BMJ 2013; Henschke et al., BMJ 2009.',
    urgency: 'prompt_medical_referral',
    governance: {
      source: 'Downie A et al. Red flags to screen for malignancy and fracture in low back pain. BMJ 2013.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },

  // --- CERVICAL & CRANIOVERTEBRAL ---
  {
    itemId: 'rf_cerv_myelopathy',
    regionId: 'cervical_craniovertebral',
    labelAr: 'خراقة اليدين (تأزر دقيق ضعيف)، اضطراب المشية أو تشنج الساقين (اشتباه اعتلال النخاع)',
    labelEn: 'Loss of fine hand dexterity, gait unsteadiness, or bilateral upper/lower paresthesia (Myelopathy screen)',
    rationaleAr: 'مؤشرات إصابة العصبون الحركي العلوي في الحبل الشوكي العنقي.',
    rationaleEn: 'Clinical cluster suggestive of cervical spondylotic myelopathy.',
    citation: 'Cook et al., JOSPT 2010.',
    urgency: 'prompt_medical_referral',
    governance: {
      source: 'Cook C et al. Clinical finding cluster for cervical spine myelopathy. JOSPT 2010.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
  {
    itemId: 'rf_cerv_vascular_neuro',
    regionId: 'cervical_craniovertebral',
    labelAr: 'دوار مفاجئ، شفع بالرؤية، عسر بلع أو تلعثم بالكلام أو صداع قذالي شديد غير معتاد',
    labelEn: 'Sudden dizziness, diplopia, dysphagia, dysarthria, drop attacks, or atypical severe neck/occipital headache',
    rationaleAr: 'علامات قد ترتبط باضطراب وعائي عنقي دماغي (CAD)؛ يمنع التحريك العنقي النهائي ويجب الفحص الطبي.',
    rationaleEn: 'Potential craniovertebral vascular event indicators per IFOMPT framework.',
    citation: 'Rushton et al., IFOMPT Cervical Arterial Framework 2023.',
    urgency: 'immediate_emergency',
    governance: {
      source: 'Rushton A et al. International IFOMPT Cervical Framework (2023 update).',
      reviewedBy: null,
      reviewedDate: null,
    },
  },

  // --- THORACIC & SYSTEMIC ---
  {
    itemId: 'rf_sys_malignancy',
    regionId: 'thoracic_systemic',
    labelAr: 'سابق إصابة بالسرطان مع ألم مستمر لا يرتاح بالراحة أو الليل وفقدان وزن غير مبرر',
    labelEn: 'History of malignancy combined with constant night pain and unexplained weight loss',
    rationaleAr: 'تاريخ الأورام مع ألم غير ميكانيكي مستمر يتطلب استبعاد النقائل الطبية.',
    rationaleEn: 'Prior cancer history plus non-mechanical constant pain warrants physician workup.',
    citation: 'Henschke et al., Cochrane Database Syst Rev 2013.',
    urgency: 'prompt_medical_referral',
    governance: {
      source: 'Henschke N et al. Red flags to screen for malignancy in patients with low-back pain. Cochrane 2013.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
  {
    itemId: 'rf_sys_infection',
    regionId: 'thoracic_systemic',
    labelAr: 'حمى، قشعريرة، تعرق ليلي، أو جرح جراحي حديث / التهاب مع ارتفاع حرارة المفصل',
    labelEn: 'Fever, chills, night sweats, recent infection/surgery, or immunocompromised status with focal pain',
    rationaleAr: 'يرفع الاشتباه بعدوى العمود الفقري أو التهاب قرص أو التهاب مفصل قيحي.',
    rationaleEn: 'Raises suspicion for spinal infection or systemic inflammatory source.',
    citation: 'Finucane et al., JOSPT 2020.',
    urgency: 'immediate_emergency',
    governance: {
      source: 'Finucane LM et al. JOSPT 2020.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },

  // --- LOWER EXTREMITY ---
  {
    itemId: 'rf_le_dvt',
    regionId: 'lower_extremity',
    labelAr: 'تورم مفاجئ أحادي الجانب في ربلة الساق/الفخذ مع احمرار وسخونة وألم عميق (اشتباه DVT)',
    labelEn: 'Unilateral calf or thigh swelling, warmth, tenderness, or pitting edema (Suspected DVT)',
    rationaleAr: 'يُحظر التدليك العميق أو تحريك الطرف القسري عند الاشتباه بالخثار الوريدي العميق ويجب التحويل الفوري للدوبلر.',
    rationaleEn: 'Contraindicates deep manual therapy or vigorous exercise; requires immediate vascular rule-out.',
    citation: 'Wells et al., NEJM 2003 (Wells Criteria for DVT).',
    urgency: 'immediate_emergency',
    governance: {
      source: 'Wells PS et al. Evaluation of D-dimer in the diagnosis of suspected deep-vein thrombosis. NEJM 2003.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
  {
    itemId: 'rf_le_septic_or_fracture',
    regionId: 'lower_extremity',
    labelAr: 'عجز تام عن تحمل الوزن 4 خطوات مع ألم عظمي نقطي أو مفصل ساخن متورم بشدة',
    labelEn: 'Inability to bear weight for 4 steps with bony tenderness or acutely hot/locked joint',
    rationaleAr: 'تتوافق مع مؤشرات استبعاد الكسر (قواعد أوتاوا) أو التهاب المفصل الإنتاني.',
    rationaleEn: 'Aligns with Ottawa clinical fracture rules and acute joint infection screen.',
    citation: 'Stiell IG et al., JAMA 1994 & 1995 (Ottawa Ankle & Knee Rules).',
    urgency: 'prompt_medical_referral',
    governance: {
      source: 'Stiell IG et al. Ottawa Ankle/Knee Rules (JAMA 1994, 1995).',
      reviewedBy: null,
      reviewedDate: null,
    },
  },

  // --- UPPER EXTREMITY ---
  {
    itemId: 'rf_ue_vascular_neuro',
    regionId: 'upper_extremity',
    labelAr: 'برودة أو شحوب اليد مع ضعف النبض الكعبري أو خدر مفاجئ متصاعد بالذراع',
    labelEn: 'Acute pallor, coldness, diminished radial pulse, or sudden progressive upper limb weakness',
    rationaleAr: 'يشير لقصور شرياني أو عصبي حاد يستوجب التحويل الطبي الفوري.',
    rationaleEn: 'Indicates potential acute vascular or peripheral/central neurological compromise.',
    citation: 'Finucane et al., JOSPT 2020; IFOMPT Screening Standards.',
    urgency: 'immediate_emergency',
    governance: {
      source: 'Finucane LM et al. JOSPT 2020.',
      reviewedBy: null,
      reviewedDate: null,
    },
  },
];
