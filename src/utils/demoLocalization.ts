// =======================================================================
// PhysioRecord — Dynamic Multilingual Demo Data Localization (ar / en / ckb)
// Pure lookup & resolver helpers for synthetic demonstration records only.
// Real user-entered clinical records are returned untouched.
// =======================================================================

import type { SupportedLanguage } from '../context/LanguageContext';

export interface LocalizedDemoEntry {
  ar: string;
  en: string;
  ckb: string;
}

export interface LocalizedDemoPatientProfile {
  fullName: LocalizedDemoEntry;
  address: LocalizedDemoEntry;
  occupation: LocalizedDemoEntry;
  medicalHistory: LocalizedDemoEntry;
  previousSurgeries: LocalizedDemoEntry;
  currentMedications: LocalizedDemoEntry;
  allergies: LocalizedDemoEntry;
  comorbidities: LocalizedDemoEntry;
  precautions: LocalizedDemoEntry;
  redFlags: LocalizedDemoEntry;
  psychosocialFactors: LocalizedDemoEntry;
  generalNotes: LocalizedDemoEntry;
}

const DEMO_TEXT_TRANSLATIONS: ReadonlyArray<LocalizedDemoEntry> = [
  // Core 5 Synthetic Patient Names
  {
    ar: 'مازن رائد الربيعي',
    en: 'Mazin Raed Al-Rubaie',
    ckb: 'مازن ڕائید ئەلڕوبەیعی',
  },
  {
    ar: 'سلوى قاسم الطائي',
    en: 'Salwa Qasim Al-Taie',
    ckb: 'سەلوا قاسم ئەلتائی',
  },
  {
    ar: 'جاسم طارق النعيمي',
    en: 'Jasim Tariq Al-Nuaimi',
    ckb: 'جاسم تارق ئەلنوعەیمی',
  },
  {
    ar: 'كرم مهند البياتي',
    en: 'Karam Mohanad Al-Bayati',
    ckb: 'کەرەم موهەند ئەلبەیاتی',
  },
  {
    ar: 'رنا وليد العامري',
    en: 'Rana Waleed Al-Ameri',
    ckb: 'ڕەنا وەلید ئەلعامری',
  },
  // Extra 5 Synthetic Iraqi Patient Names
  {
    ar: 'حسنين علي الكاظمي',
    en: 'Hassanein Ali Al-Kadhimi',
    ckb: 'حەسەنەین عەلی ئەلکازمی',
  },
  {
    ar: 'زينب حيدر الربيعي',
    en: 'Zainab Haider Al-Rubaie',
    ckb: 'زەینەب حەیدەر ئەلڕوبەیعی',
  },
  {
    ar: 'عمر طارق الجبوري',
    en: 'Omar Tariq Al-Jubouri',
    ckb: 'عومەر تارق ئەلجبووری',
  },
  {
    ar: 'نور باسم الدليمي',
    en: 'Noor Basim Al-Dulaimi',
    ckb: 'نوور باسم ئەلدولەیمی',
  },
  {
    ar: 'مصطفى كريم الزبيدي',
    en: 'Mustafa Kareem Al-Zubaidi',
    ckb: 'مستەفا کەریم ئەلزوبەیدی',
  },

  // Cities & Districts
  { ar: 'بغداد — المنصور', en: 'Baghdad — Al-Mansour', ckb: 'بەغدا — مەنسوور' },
  { ar: 'بغداد — الكرادة', en: 'Baghdad — Al-Karrada', ckb: 'بەغدا — کەڕادە' },
  { ar: 'البصرة — العشار', en: 'Basra — Al-Ashar', ckb: 'بەسڕە — عەشار' },
  { ar: 'أربيل — عينكاوا', en: 'Erbil — Ankawa', ckb: 'هەولێر — عەنکاوە' },
  { ar: 'النجف — حي السعد', en: 'Najaf — Al-Saad District', ckb: 'نەجەف — گەڕەکی سەعد' },
  { ar: 'نينوى — الموصل — حي الزهور', en: 'Nineveh — Mosul — Al-Zuhoor', ckb: 'نەینەوا — مووسڵ — گەڕەکی زهوور' },
  { ar: 'كربلاء — حي الحسين', en: 'Karbala — Al-Hussein District', ckb: 'کەربەلا — گەڕەکی حوسێن' },
  { ar: 'السليمانية — بختياري', en: 'Sulaymaniyah — Bakhtyari', ckb: 'سلێمانی — بەختیاری' },

  // Occupations
  { ar: 'مهندس شبكات ورياضي هاوٍ', en: 'Network Engineer & Amateur Athlete', ckb: 'ئەندازیاری تۆڕ و وەرزشوانی ئارەزوومەند' },
  { ar: 'مشرفة تربوية متقاعدة', en: 'Retired Educational Supervisor', ckb: 'سەرپەرشتیاری پەروەردەیی خانەنشینکراو' },
  { ar: 'تاجر مواد غذائية', en: 'Food Supplies Merchant', ckb: 'بازرگانی خۆراک' },
  { ar: 'طالب بالمرحلة الابتدائية', en: 'Primary School Student', ckb: 'قوتابی قۆناغی بنەڕەتی' },
  { ar: 'مهندسة معمارية', en: 'Architect', ckb: 'ئەندازیاری تەلارسازی' },
  { ar: 'موظف مصرفي', en: 'Bank Employee', ckb: 'فەرمانبەری بانک' },
  { ar: 'صيدلانية', en: 'Pharmacist', ckb: 'دەرمانساز' },
  { ar: 'مدرس تربية رياضية', en: 'Physical Education Teacher', ckb: 'مامۆستای پەروەردەی وەرزشی' },
  { ar: 'مصممة جرافيك', en: 'Graphic Designer', ckb: 'دیزاینەری گرافیک' },
  { ar: 'مهندس مدني', en: 'Civil Engineer', ckb: 'ئەندازیاری شارستانی' },

  // Medical Histories (Core 5 + Extra 5)
  {
    ar: 'إصابة رياضية بقطع كامل في الرباط الصليبي الأمامي للركبة اليمنى أثناء مباراة كرة قدم.',
    en: 'Sports injury with complete right knee anterior cruciate ligament (ACL) tear during a football match.',
    ckb: 'پێکانی وەرزشی بە پچڕانی تەواوی بەستەری خاچی پێشەوەی ئەژنۆی ڕاست (ACL) لە کاتی یاری تۆپی پێدا.',
  },
  {
    ar: 'جلطة دماغية نقص تروية في الشريان الدماغي الأوسط الأيسر قبل 3 أشهر، نتج عنها شلل نصفي أيمن مع حبسة كلامية خفيفة.',
    en: 'Left middle cerebral artery (MCA) ischemic stroke 3 months ago, resulting in right-sided hemiparesis with mild aphasia.',
    ckb: 'جەڵتەی مێشکی کەمخوێنی لە خوێنبەری ناوەڕاستی چەپی مێشک پێش ٣ مانگ، کە بووە هۆی لاوازی لای ڕاستی جەستە لەگەڵ سستی کەم لە قسەکردندا.',
  },
  {
    ar: 'مرض شرايين تاجية ثلاثي الوعاء. خضع لجراحة مجازة الشريان التاجي قبل 6 أسابيع. تحويل لبرنامج التأهيل القلبي الرئوي من الدرجة الثانية.',
    en: 'Three-vessel coronary artery disease; 6 weeks post-CABG surgery. Referred for Phase II cardiopulmonary rehabilitation.',
    ckb: 'نەخۆشی سێ خوێنبەری تاجی دڵ. پێش ٦ هەفتە نەشتەرگەری گۆڕینی خوێنبەری دڵی (CABG) بۆ کراوە. نێردراوە بۆ بەرنامەی چاکسازی دڵ و سییەکان قۆناغی دووەم.',
  },
  {
    ar: 'شلل دماغي تشنجي ثنائي الطرفين ناتج عن ولادة مبكرة (30 أسبوع حمل).',
    en: 'Spastic diplegic cerebral palsy secondary to preterm birth (30 weeks gestation).',
    ckb: 'شەلەلی مێشکی گرژبوو لە هەردوو قاچدا بەهۆی لەدایکبوونی پێشوەختە (هەفتەی ٣٠ی دووگیانی).',
  },
  {
    ar: 'التهاب محفظة الكتف اللاصق بالكتف الأيمن في مرحلة التيبس، مصحوب بمتلازمة انحشار الكفة المدورة.',
    en: 'Right shoulder adhesive capsulitis (frozen stage) with concurrent rotator cuff impingement syndrome.',
    ckb: 'هەوکردنی لکێنەری کێسەی شانی ڕاست لە قۆناغی ڕەقبووندا، هاوشان لەگەڵ گیرانی ماسولکەکانی سووڕێنەری شان.',
  },
  {
    ar: 'انزلاق غضروفي قطني بين الفقرتين L4-L5 مع ألم جذري يمتد للطرف السفلي الأيسر.',
    en: 'Lumbar disc herniation at L4–L5 with left lower-extremity radicular pain.',
    ckb: 'خلیسکانى دیسکی پشت لە نێوان بڕبڕەکانی L4-L5 لەگەڵ ئازاری دەماری کە بۆ قاچی چەپ درێژ دەبێتەوە.',
  },
  {
    ar: 'متلازمة الألم الرضفي الفخذي بالركبة اليسرى نتيجة صعود السلالم المتكرر.',
    en: 'Left knee patellofemoral pain syndrome aggravated by repetitive stair climbing.',
    ckb: 'نیشانەی ئازاری کڵاوەی ئەژنۆی چەپ بەهۆی سەرکەوتنی بەردەوام بەسەر پلیکانەکاندا.',
  },
  {
    ar: 'التهاب اللفافة الأخمصية المزمن بالقدم اليمنى مع تيبس صباحي.',
    en: 'Chronic right-foot plantar fasciitis with morning stiffness.',
    ckb: 'هەوکردنی درێژخایەنی پەردەی بنی پێی ڕاست لەگەڵ ڕەقبوونی بەیانیان.',
  },
  {
    ar: 'ألم رقبي ميكانيكي مع صداع عنقي المنشأ مرتبط بالجلوس الطويل أمام الحاسوب.',
    en: 'Mechanical neck pain with cervicogenic headache linked to prolonged computer work.',
    ckb: 'ئازاری میکانیکی مل لەگەڵ سەرئێشەی سەرچاوە لە مل پەیوەست بە دانیشتنی زۆر لەبەردەم کۆمپیوتەر.',
  },
  {
    ar: 'خشونة مفصل الركبة الثنائية من الدرجة الثانية مع ضعف العضلة رباعية الرؤوس.',
    en: 'Bilateral Grade II knee osteoarthritis with quadriceps muscle weakness.',
    ckb: 'داخورانی هەردوو جومگەی ئەژنۆ لە پلەی دووەم لەگەڵ لاوازی ماسولکەی چوارسەری ڕان.',
  },

  // Previous Surgeries
  {
    ar: 'جراحة ترميم الرباط الصليبي الأمامي وزراعة وتر الركبة الذاتي قبل 4 أسابيع.',
    en: 'ACL reconstruction with autograft 4 weeks ago.',
    ckb: 'نەشتەرگەری چاککردنەوەی بەستەری ACL بە ژێی خۆیی پێش ٤ هەفتە.',
  },
  { ar: 'لا يوجد جراحات سابقة.', en: 'No previous surgeries.', ckb: 'هیچ نەشتەرگەرییەکی پێشوو نییە.' },
  { ar: 'لا يوجد.', en: 'None.', ckb: 'نییە.' },
  {
    ar: 'جراحة مجازة الشريان التاجي وشق القص قبل 6 أسابيع.',
    en: 'Coronary artery bypass grafting (CABG) via median sternotomy 6 weeks ago.',
    ckb: 'نەشتەرگەری گۆڕینی خوێنبەری تاجی دڵ و کردنەوەی ئێسکی سنگ پێش ٦ هەفتە.',
  },
  {
    ar: 'حقن توكسين البوتولينوم في عضلات الساقين القابضة قبل 4 أشهر.',
    en: 'Botulinum toxin injections to bilateral calf plantarflexors 4 months ago.',
    ckb: 'دەرزی بۆتۆلینۆم بۆ ماسولکەکانی پشتی قاچ پێش ٤ مانگ.',
  },

  // Medications
  {
    ar: 'باراسيتامول 1 جم عند الحاجة، مكملات كالسيوم وفيتامين د.',
    en: 'Paracetamol 1 g PRN, calcium and vitamin D supplements.',
    ckb: 'پاراسیتامۆڵ ١ گرام لە کاتی پێویستدا، تەواوکەری کالیسیۆم و ڤیتامین D.',
  },
  {
    ar: 'أسبرين 81 مجم، أتورفاستاتين 40 مجم، أملوديبين 5 مجم.',
    en: 'Aspirin 81 mg, Atorvastatin 40 mg, Amlodipine 5 mg.',
    ckb: 'ئەسپرین ٨١ ملگم، ئەتۆرڤاستاتین ٤٠ ملگم، ئەملۆدیپین ٥ ملگم.',
  },
  {
    ar: 'بيسوبرولول 5 مجم، ليزينوبريل 10 مجم، أتورفاستاتين 80 مجم، أسبرين.',
    en: 'Bisoprolol 5 mg, Lisinopril 10 mg, Atorvastatin 80 mg, Aspirin.',
    ckb: 'بیسۆپرۆلۆڵ ٥ ملگم، لیزینۆپریل ١٠ ملگم، ئەتۆرڤاستاتین ٨٠ ملگم، ئەسپرین.',
  },
  { ar: 'باكلوفين شراب.', en: 'Baclofen oral suspension.', ckb: 'شرووبی باکلۆفین.' },
  {
    ar: 'إيبوبروفين 400 مجم عند اللزوم، حقنة كورتيزون موضعية بالمفصل قبل شهرين.',
    en: 'Ibuprofen 400 mg PRN; intra-articular corticosteroid injection 2 months ago.',
    ckb: 'ئیبوپرۆفین ٤٠٠ ملگم لە کاتی پێویستدا، دەرزی کۆرتیزۆنی ناو جومگە پێش ٢ مانگ.',
  },
  { ar: 'باراسيتامول عند اللزوم.', en: 'Paracetamol PRN.', ckb: 'پاراسیتامۆڵ لە کاتی پێویستدا.' },

  // Allergies & Comorbidities
  { ar: 'لا يوجد حساسية دوائية معروفة', en: 'No known drug allergies (NKDA)', ckb: 'هیچ هەستیارییەکی دەرمانی ناسراو نییە' },
  { ar: 'حساسية من البنسلين.', en: 'Penicillin allergy.', ckb: 'هەستیاری بە پەنیسیلین.' },
  { ar: 'حساسية من السلفا.', en: 'Sulfa drug allergy.', ckb: 'هەستیاری بە سەلفا.' },
  { ar: 'لا يوجد أمراض مزمنة مصاحبة.', en: 'No chronic comorbidities.', ckb: 'هیچ نەخۆشییەکی درێژخایەنی هاوڕێ نییە.' },
  { ar: 'ارتفاع ضغط الدم، خلل دهون الدم.', en: 'Hypertension, dyslipidemia.', ckb: 'بەرزی پەستانی خوێن، ناڕێکی چەوری خوێن.' },
  { ar: 'داء السكري من النوع الثاني.', en: 'Type 2 diabetes mellitus.', ckb: 'نەخۆشی شەکرەی جۆری دووەم.' },
  { ar: 'صعوبات طفيفة في التناسق الحركي البصري.', en: 'Mild visuomotor coordination difficulties.', ckb: 'کێشەی کەم لە هاوئاهەنگی بینین و جووڵەدا.' },

  // Precautions & Red Flags
  {
    ar: 'تجنب تمارين السلسلة الحركية المفتوحة لربلة الركبة بين زوايا 0-45 درجة للشهرين الأولين. الالتزام بالدعامة الحركية أثناء المشي.',
    en: 'Avoid open kinetic chain knee extension between 0–45° for the first 2 months. Maintain hinged knee brace during ambulation.',
    ckb: 'دوورکەوتنەوە لە ڕاهێنانی زنجیرەی کراوەی ئەژنۆ لە نێوان گۆشەی ٠–٤٥ پلە بۆ دوو مانگی یەکەم. بەکارهێنانی بەستەری ئەژنۆ لە کاتی ڕۆیشتندا.',
  },
  {
    ar: 'مراقبة علامات تجلط الأوردة العميقة (DVT): أي تورم مفاجئ أو حرارة موضعية في عضلة الساق تتطلب إحالة إسعافية فورية.',
    en: 'Monitor for DVT signs: any sudden calf swelling or localized warmth requires immediate emergency referral.',
    ckb: 'چاودێریکردنی نیشانەکانی خوێنمەینی قووڵ (DVT): هەر ئاوسانێکی لەناکاو یان گەرمی لە پوزدا پێویستی بە ناردنی بەپەلەی فریاکەوتن هەیە.',
  },
  {
    ar: 'خطر السقوط، استخدام حزام الأمان للنقل، مراقبة ضغط الدم قبل وبعد الجلسة.',
    en: 'Fall risk; use gait belt for transfers and monitor blood pressure pre- and post-session.',
    ckb: 'مەترسی کەوتن، بەکارهێنانی پشتێنی سەلامەتی بۆ گواستنەوە، چاودێریکردنی پەستانی خوێن پێش و پاش دانیشتن.',
  },
  {
    ar: 'ارتفاع ضغط الدم الانقباضي فوق 180 ملم زئبق أثناء الجهد يتطلب إيقاف الجلسة فوراً.',
    en: 'Systolic blood pressure > 180 mmHg during exertion requires immediate session termination.',
    ckb: 'بەرزبوونەوەی پەستانی خوێنی سەرەوە لە سەرووی ١٨٠ ملم جیوە لە کاتی هەوڵدا پێویستی بە وەستاندنی دەستبەجێی دانیشتنەکە هەیە.',
  },
  {
    ar: 'احتياطات عظم القص: عدم رفع أكثر من 3 كجم، تجنب الدفع أو السحب بقوة بكلتا اليدين لمدة 8 أسابيع بعد الجراحة.',
    en: 'Sternal precautions: no lifting > 3 kg and avoid forceful bilateral pushing or pulling for 8 weeks post-op.',
    ckb: 'ئاگاداری ئێسکی سنگ: هەڵنەگرتنی زیاتر لە ٣ کیلۆگرام، دوورکەوتنەوە لە پاڵنان یان ڕاکێشانی توند بە هەردوو دەست بۆ ماوەی ٨ هەفتە پاش نەشتەرگەری.',
  },
  {
    ar: 'ألم في الصدر، ضيق تنفس حاد غير متناسب، عدم انتظام ضربات القلب، أو هبوط تشبع الأكسجين تحت 90%.',
    en: 'Chest pain, disproportionate acute dyspnea, arrhythmia, or SpO2 drop below 90%.',
    ckb: 'ئازاری سنگ، تەنگەنەفەسی توند، ناڕێکی لێدانی دڵ، یان دابەزینی ئۆکسجینی خوێن بۆ خوار ٩٠٪.',
  },
  {
    ar: 'مراعاة التدرج في التحميل الحركي وتجنب الإجهاد المفاجئ.',
    en: 'Progress mechanical loading gradually and avoid sudden overexertion.',
    ckb: 'ڕەچاوکردنی پلەبەندی لە بارگرانی جووڵەیی و دوورکەوتنەوە لە ماندووبوونی لەناکاو.',
  },

  // Psychosocial Factors & General Notes
  {
    ar: 'دافعية عالية جداً للعودة للرياضة، مع بعض القلق المبدئي من تحميل الوزن الكامل.',
    en: 'High motivation to return to sport, with mild initial apprehension toward full weight-bearing.',
    ckb: 'پاڵنەرێکی زۆر بەرز بۆ گەڕانەوە بۆ وەرزش، لەگەڵ کەمێک دڵەڕاوکێی سەرەتایی لە بارخستنی تەواو.',
  },
  {
    ar: 'المريض ملتزم بالتعليمات ولديه وعي حركي ممتاز. الجلسات تركز حالياً على استعادة الامتداد الكامل للركبة وتنشيط العضلة رباعية الرؤوس.',
    en: 'Patient is adherent with strong motor awareness. Sessions focus on restoring full knee extension and quadriceps activation.',
    ckb: 'نەخۆشەکە پابەندە بە ڕێنماییەکان و هۆشیاری جووڵەیی نایابی هەیە. دانیشتنەکان ئێستا تیشک دەخەنە سەر گەڕاندنەوەی ڕاستکردنەوەی تەواوی ئەژنۆ و چالاککردنی ماسولکەی چوارسەری ڕان.',
  },
  {
    ar: 'دعم عائلي ممتاز من الأبناء، تعاني من إحباط أحياناً بسبب صعوبة استخدام اليد اليمنى في الكتابة.',
    en: 'Strong family support from children; occasional frustration with right-hand writing difficulty.',
    ckb: 'پاڵپشتی خێزانی نایاب لەلایەن منداڵەکانەوە، هەندێک جار هەست بە بێزاری دەکات بەهۆی سەختی بەکارهێنانی دەستی ڕاست لە نووسیندا.',
  },
  {
    ar: 'التركيز على إعادة التأهيل العصبي: التدريب على التوازن، استعادة نمط المشي المتناسق، وتسهيل حركات الطرف العلوي الأيمن.',
    en: 'Focus on neurorehabilitation: balance training, symmetrical gait retraining, and right upper-limb facilitation.',
    ckb: 'تیشک خستنە سەر چاکسازی دەماری: ڕاهێنانی هاوسەنگی، گەڕاندنەوەی شێوازی ڕێکی ڕۆیشتن، و ئاسانکاری جووڵەی دەستی ڕاست.',
  },
  {
    ar: 'حرص كبير على تحسين كفاءة القلب وممارسة المشي بانتظام.',
    en: 'Highly motivated to improve cardiac conditioning and walk regularly.',
    ckb: 'پەرۆشییەکی زۆر بۆ باشترکردنی توانای دڵ و ڕۆیشتنی بەردەوام.',
  },
  {
    ar: 'يتم قياس العلامات الحيوية بدقة (النبض، ضغط الدم، تشبع الأكسجين، ومقياس بورغ للجهد الإدراكي).',
    en: 'Vital signs closely monitored (HR, BP, SpO2, and Borg RPE scale).',
    ckb: 'نیشانە زیندەییەکان بە وردی دەپێورێن (لێدانی دڵ، پەستانی خوێن، ڕێژەی ئۆکسجین، و پێوەری بۆرگ بۆ هەوڵ).',
  },
  {
    ar: 'طفل محب للعب والتعلم، يتفاعل بشكل إيجابي مع الجلسات المعتمدة على الألعاب الحركية.',
    en: 'Playful, engaged child who responds positively to game-based motor therapy.',
    ckb: 'منداڵێکی خۆشەویستی یاری و فێربوونە، بە ئەرێنی لەگەڵ دانیشتنە یارییە جووڵەییەکاندا کارلێک دەکات.',
  },
  {
    ar: 'التركيز على إطالة عضلات الساق المشدودة، تقوية عضلات الجذع وعضلات الحوض، وتحسين نمط المشي المستقل بدون عكازات.',
    en: 'Focus on calf stretching, core/hip strengthening, and independent unassisted gait training.',
    ckb: 'تیشک خستنە سەر کشانی ماسولکە گرژەکانی قاچ، بەهێزکردنی ماسولکەکانی قەد و حەوز، و باشترکردنی ڕۆیشتنی سەربەخۆ بێ دارشەق.',
  },
  {
    ar: 'إجهاد مهني بسبب حاجة عملها الهندسي والمكتبي إلى تثبيت الكتف لساعات طويلة.',
    en: 'Occupational strain from sustained desk/drafting shoulder posture.',
    ckb: 'ماندووبوونی پیشەیی بەهۆی پێویستی کاری ئەندازیاری و نووسینگەیی بە جێگیرکردنی شان بۆ کاتژمێری درێژ.',
  },
  {
    ar: 'الخطة تتضمن تحريك المفصل بدرجات حرية متزايدة، وإبر جافة للزناد العضلي، وبرنامج منزلي يومي باستخدام عصا القياس والبكرة.',
    en: 'Plan includes graded joint mobilization, trigger-point dry needling, and daily home dowel/pulley exercises.',
    ckb: 'پلانەکە جووڵاندنی پلەبەندی جومگە، دەرزی وشک بۆ خاڵە گرژەکان، و بەرنامەی ماڵەوەی ڕۆژانە بە دار و پۆلی لەخۆدەگرێت.',
  },
  {
    ar: 'تعاون ممتاز مع برنامج التمارين العلاجية المنزلية.',
    en: 'Excellent adherence to the home exercise program.',
    ckb: 'هاوکاری نایاب لەگەڵ بەرنامەی ڕاهێنانی چارەسەری ماڵەوە.',
  },

  // Demo Operations: Episodes, Appointments, Waitlist, Invoices, Expenses
  {
    ar: 'تأهيل ما بعد عملية ترميم الرباط الصليبي الأمامي (ACL)',
    en: 'Post-Op ACL Reconstruction Rehabilitation',
    ckb: 'چاکسازی پاش نەشتەرگەری بەستەری ACL',
  },
  {
    ar: 'تأهيل عصبي للشلل النصفي الأيمن بعد جلطة دماغية',
    en: 'Post-Stroke Right Hemiparesis Neuro Rehab',
    ckb: 'چاکسازی دەماری بۆ لاوازی لای ڕاست پاش جەڵتەی مێشک',
  },
  {
    ar: 'علاج الكتف المتجمد الأيمن (Adhesive Capsulitis)',
    en: 'Right Frozen Shoulder (Adhesive Capsulitis) Rehab',
    ckb: 'چارەسەری شانی بەستووی ڕاست (Adhesive Capsulitis)',
  },
  {
    ar: 'وحدة التأهيل الرياضي 1',
    en: 'Sports Rehab Unit 1',
    ckb: 'یەکەی چاکسازی وەرزشی ١',
  },
  {
    ar: 'غرفة التأهيل العصبي 2',
    en: 'Neuro Rehab Room 2',
    ckb: 'ژووری چاکسازی دەماری ٢',
  },
  {
    ar: 'غرفة العلاج اليدوي 1',
    en: 'Manual Therapy Room 1',
    ckb: 'ژووری چارەسەری دەستی ١',
  },
  {
    ar: 'الجلسة الثالثة — تركيز على استعادة الامتداد الكامل للركبة',
    en: 'Session 3 — Focus on restoring full knee extension',
    ckb: 'دانیشتنی سێیەم — تیشک خستنە سەر گەڕاندنەوەی ڕاستکردنەوەی تەواوی ئەژنۆ',
  },
  {
    ar: 'إعادة تقييم التوازن والمشي المستقل',
    en: 'Re-evaluation of balance and independent gait',
    ckb: 'دووبارە هەڵسەنگاندنی هاوسەنگی و ڕۆیشتنی سەربەخۆ',
  },
  {
    ar: 'تحريك مفصلي تدريجي للمحفظة الخلفية والسفلية',
    en: 'Progressive joint mobilization of posterior and inferior capsule',
    ckb: 'جووڵاندنی پلەبەندی جومگە بۆ کێسەی پشتەوە و خوارەوە',
  },
  {
    ar: 'تأهيل قلبي رئوي بعد جراحة الشريان التاجي (CABG)',
    en: 'Cardiopulmonary Rehab Post-CABG',
    ckb: 'چاکسازی دڵ و سییەکان پاش نەشتەرگەری CABG',
  },
  {
    ar: 'تأهيل حركي للأطفال — شلل دماغي تشنجي',
    en: 'Pediatric Motor Rehab — Spastic Cerebral Palsy',
    ckb: 'چاکسازی جووڵەیی منداڵان — شەلەلی مێشکی گرژبوو',
  },
  {
    ar: 'السبت، الإثنين، الأربعاء',
    en: 'Sat, Mon, Wed',
    ckb: 'شەممە، دووشەممە، چوارشەممە',
  },
  {
    ar: 'الأحد، الثلاثاء، الخميس',
    en: 'Sun, Tue, Thu',
    ckb: 'یەکشەممە، سێشەممە، پێنجشەممە',
  },
  {
    ar: 'يفضل المواعيد الصباحية المبكرة مع مراقبة العلامات الحيوية',
    en: 'Prefers early morning slots with vital signs monitoring',
    ckb: 'کاتی بەیانی زوو پێ باشترە لەگەڵ چاودێریکردنی نیشانە زیندەییەکان',
  },
  {
    ar: 'باقة تأهيل الرباط الصليبي (10 جلسات)',
    en: 'ACL Rehab Package (10 Sessions)',
    ckb: 'پاکێجی چاکسازی ACL (١٠ دانیشتن)',
  },
  {
    ar: 'باقة تأهيل علاجي متكامل (10 جلسات)',
    en: '10-Session Comprehensive Rehab Package',
    ckb: 'پاکێجی چاکسازی چارەسەری تەواو (١٠ دانیشتن)',
  },
  {
    ar: 'تأهيل الشلل النصفي الأيمن',
    en: 'Right Hemiparesis Rehabilitation',
    ckb: 'چاکسازی لاوازی لای ڕاستی جەستە',
  },
  {
    ar: 'جلسة تأهيل عصبي + توازن وظيفي',
    en: 'Neuro Rehab & Balance Session',
    ckb: 'دانیشتنی چاکسازی دەماری + هاوسەنگی کارایی',
  },
  {
    ar: 'دفعة أولى نقداً عند بدء الكورس',
    en: 'Initial cash installment at course start',
    ckb: 'بڕی یەکەم بە کاش لە سەرەتای کۆرسەکەدا',
  },
  {
    ar: 'متبقي بذمة المريض 75,000 د.ع تسدد عند الجلسة الثامنة',
    en: 'Remaining balance 75,000 IQD due at session 8',
    ckb: 'بڕی ماوە 75,000 د.ع لە دانیشتنی هەشتەمدا دەدرێت',
  },
  {
    ar: 'تحويل زين كاش',
    en: 'ZainCash transfer',
    ckb: 'گواستنەوەی زەین کاش',
  },
  {
    ar: 'شراء أقطاب تحفيز كهربائي وجل سونار (تجريبي)',
    en: 'Ultrasound Gel & Electrodes Supply (Demo)',
    ckb: 'کڕینی جێڵی سۆنار و ئەلێکترۆد (تاقیکردنەوە)',
  },
  {
    ar: 'سجل مصروف تجريبي',
    en: 'Demo expense record',
    ckb: 'تۆماری خەرجیی تاقیکردنەوە',
  },
  // Default auto-created episode titles / complaints
  {
    ar: 'خطة علاجية جديدة',
    en: 'New Treatment Plan',
    ckb: 'پلانی چارەسەری نوێ',
  },
  {
    ar: 'دورة علاجية أولية',
    en: 'Initial Episode of Care',
    ckb: 'خولی چارەسەری سەرەتایی',
  },
  // Patient 1 seeded ACL episode strings (SyntheticDataModal)
  {
    ar: 'إعادة تأهيل الركبة اليمنى بعد ترميم الرباط الصليبي (Right ACL Rehab)',
    en: 'Right Knee Post-ACL Reconstruction Rehabilitation',
    ckb: 'چاکسازیی ئەژنۆی ڕاست پاش چاککردنەوەی بەستەری ACL',
  },
  {
    ar: 'تمزق كامل بالرباط الصليبي الأمامي الأيمن بعد الجراحة التعويضية (ACL Reconstruction)',
    en: 'Complete right anterior cruciate ligament tear post-ACL reconstruction',
    ckb: 'پچڕانی تەواوی بەستەری خاچی پێشەوەی ئەژنۆی ڕاست پاش نەشتەرگەری چاککردنەوەی ACL',
  },
  {
    ar: 'مرحلة التأهيل الحركي المبكر بعد الجراحة: عجز ثني وبسط وضعف رباعية الرؤوس',
    en: 'Early post-operative kinetic rehab phase: flexion/extension deficit and quadriceps weakness',
    ckb: 'قۆناغی سەرەتایی چاکسازیی جووڵە پاش نەشتەرگەری: کەمی نوشتاندنەوە و ڕاکێشان و لاوازی ماسولکەی چوارسەری ڕان',
  },
];

// Build fast case-trimmed lookup maps keyed by ar and en strings
const BY_KEY = new Map<string, LocalizedDemoEntry>();
for (const entry of DEMO_TEXT_TRANSLATIONS) {
  BY_KEY.set(entry.ar.trim(), entry);
  BY_KEY.set(entry.en.trim(), entry);
  BY_KEY.set(entry.ckb.trim(), entry);
}

/**
 * Localize a known synthetic/demo text string into the active UI language (`ar`, `en`, `ckb`).
 * Any real clinician-entered text that is not in the synthetic demo catalog is returned unchanged.
 */
export function localizeDemoText(
  text: string | undefined | null,
  language: SupportedLanguage
): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = BY_KEY.get(trimmed);
  if (match) {
    return match[language];
  }
  // Handle dynamic generated generalNotes prefix from generateSyntheticIraqiPatients
  if (trimmed.startsWith('بيانات تجريبية أصلية (CC0-1.0) — ')) {
    const suffix = trimmed.slice('بيانات تجريبية أصلية (CC0-1.0) — '.length);
    if (language === 'en') {
      return `Original synthetic demo data (CC0-1.0) — ${suffix}`;
    }
    if (language === 'ckb') {
      return `داتای تاقیکردنەوەی ڕەسەن (CC0-1.0) — ${suffix}`;
    }
  }
  return text;
}

/**
 * Localize a pair of (ar, en) strings (such as invoice/expense `titleAr` & `titleEn`)
 * with full Kurdish (`ckb`) support for known synthetic demo records.
 */
export function localizeDemoBilingualTitle(
  titleAr: string | undefined | null,
  titleEn: string | undefined | null,
  language: SupportedLanguage
): string {
  const arVal = (titleAr || '').trim();
  const enVal = (titleEn || '').trim();
  if (language === 'ckb') {
    const fromAr = arVal ? BY_KEY.get(arVal) : undefined;
    if (fromAr) return fromAr.ckb;
    const fromEn = enVal ? BY_KEY.get(enVal) : undefined;
    if (fromEn) return fromEn.ckb;
    return arVal || enVal;
  }
  if (language === 'en') {
    if (enVal) return enVal;
    return localizeDemoText(arVal, 'en');
  }
  return arVal || enVal;
}
