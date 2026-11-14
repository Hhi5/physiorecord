// =======================================================================
// PhysioRecord — Original Bilingual Informed Consent Templates (Phase 4.8)
// Openly authored original clinical consent text for physiotherapy practice.
// Tracked in CONTENT_LICENSES.md.
// =======================================================================

import type { ConsentTemplateDefinition } from '../types/clinicManagement';

export const CONSENT_TEMPLATES: ConsentTemplateDefinition[] = [
  {
    id: 'treatment',
    version: '1.0',
    titleAr: 'إقرار الموافقة المستنيرة للتقييم والعلاج الطبيعي',
    titleEn: 'Informed Consent for Physiotherapy Assessment & Treatment',
    summaryAr: 'يغطي الفحص السريري، العلاج اليدوي، التمارين العلاجية، والأجهزة الفيزيائية.',
    summaryEn: 'Covers physical examination, manual therapy, therapeutic exercise, and physical agents.',
    bodyAr:
      'أقر بأنني قد تلقيت شرحاً واضحاً حول طبيعة الفحص السريري وبرنامج العلاج الطبيعي المقترح، بما يشمل التمارين العلاجية، العلاج اليدوي، أو الأجهزة الكهربائية والحرارية عند الحاجة. أتفهم إمكانية حدوث شد أو ألم عضلي مؤقت بعد الجلسة، وأتعهد بإبلاغ المعالج فوراً بأي أعراض غير معتادة أو موانع طبية (مثل منظم ضربات القلب أو الحمل أو الكسور الحديثة). لي الحق الكامل في طرح الأسئلة أو إيقاف أو رفض أي إجراء علاجي في أي وقت.',
    bodyEn:
      'I confirm that the proposed physiotherapy assessment and treatment plan—including therapeutic exercises, manual therapy, and physical agents where indicated—has been explained to me clearly. I understand that temporary post-session soreness may occur, and I agree to inform my therapist immediately of any unusual symptoms or medical precautions (such as pacemakers, pregnancy, or recent fractures). I retain the right to ask questions or decline/stop any procedure at any time.',
  },
  {
    id: 'data_storage',
    version: '1.0',
    titleAr: 'الموافقة على حفظ السجلات السريرية المشفرة محلياً',
    titleEn: 'Consent for Local Encrypted Clinical Record Storage',
    summaryAr: 'يوضح حفظ البيانات السريرية مشفرة محلياً على جهاز العيادة فقط بدون خوادم خارجية.',
    summaryEn: 'Explains local device-only encrypted clinical record keeping with zero external servers.',
    bodyAr:
      'أوافق على توثيق وحفظ سجلي السريري والمالي وجلسات المتابعة داخل منظومة العيادة المحلية المشفرة (PhysioRecord) على هذا الجهاز حصراً لغرض الرعاية الصحية المستمرة والمتابعة الطبية. أتفهم أن بياناتي مشفرة محلياً ولا تُرسل إلى أي سحابة أو طرف ثالث دون طلبي أو موافقتي الخطية الصريحة، وأنه يحق لي طلب نسخة مطبوعة من تقاريري أو ملخصاتي الطبية في أي وقت.',
    bodyEn:
      'I consent to recording and storing my clinical, assessment, and billing records within the clinic’s local encrypted system (PhysioRecord) exclusively on this device for continuity of healthcare. I understand that my records are encrypted locally, are never transmitted to external cloud servers or third parties without my explicit request/written authorization, and that I may request printed copies of my reports at any time.',
  },
  {
    id: 'photography',
    version: '1.0',
    titleAr: 'الموافقة الاختيارية على التوثيق الصوري لمتابعة القوام والحركة',
    titleEn: 'Optional Consent for Clinical Photography / Movement Assessment',
    summaryAr: 'اختياري لتقييم التناظر القوامي أو مدى حركة المفصل أثناء التقييم.',
    summaryEn: 'Optional consent for posture alignment or joint range-of-motion clinical reference.',
    bodyAr:
      'أوافق طوعاً وبصورة اختيارية على التقاط صور سريرية موضعية أو لقطات لمتابعة تطور القوام والمدى الحركي أو التئام الأنسجة بغرض التوثيق الطبي ومتابعة التحسن فقط. يُمنع منعاً باتاً نشر هذه الصور أو مشاركتها عبر الإنترنت أو أي وسيلة غير تعليمية/علاجية، مع الالتزام بإخفاء الهوية والملامح الشخصية ما لم يُطلب غير ذلك صراحةً، ويمكنني سحب هذه الموافقة في أي وقت.',
    bodyEn:
      'I voluntarily give optional consent for localized clinical photographs or movement-analysis captures strictly to document baseline posture, joint range of motion, or recovery progress within my private medical file. Publishing or sharing any images online or for non-clinical purposes is strictly prohibited, identifiable facial features will be avoided/obscured, and I may revoke this optional consent at any time.',
  },
];
