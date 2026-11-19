## ملخص التغييرات / Summary of Changes
<!-- اشرح التغييرات السريرية أو الهندسية في هذا الطلب / Describe the clinical or engineering changes introduced by this PR -->

- **المشكلة المرتبطة / Related Issue:** Closes #

---

## 1. قائمة التحقق من التخصيصات العراقية والثوابت المعمارية / Iraqi Clinic & Architectural Invariants Checklist
- [ ] **التشغيل المحلي الكامل (Zero External Network / Telemetry):** لا توجد أي طلبات HTTP خارجية أو استدعاءات CDN في وقت التشغيل.
- [ ] **تشفير البيانات وعدم قابلية تعديل الملاحظات النهائية (Encryption & Clinical Immutability):** السجلات السريرية مشفرة عبر `AES-256-GCM`، وملاحظات `SOAP` المعتمدة نهائياً غير قابلة للتعديل إلا عبر الملاحق (`clinicalAddenda`).
- [ ] **سلامة مخطط قاعدة البيانات (`Dexie v1–v10` Append-Only):** لم يتم تعديل أي إصدار سابق في `src/db/db.ts` (راجع [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)).
- [ ] **الحفاظ على تخصيصات العيادات العراقية (Preserved Iraqi Clinic Customizations):**
  - [ ] رمز العملة يُعرض **بعد** الرقم (`25,000 د.ع`) مع الحفاظ على الدينار العراقي (`IQD`) افتراضياً.
  - [ ] نماذج الفواتير والمصاريف تبدأ بقيم فارغة/صفرية (`0`) دون أسعار مفروضة مسبقاً.
  - [ ] دعم طرق الدفع العراقية (`نقداً`, `ZainCash`, `QiCard`, `أخرى`) وأنواع الفواتير (`جلسة مفردة`, `كورس`, `فحص`).
  - [ ] دعم الواجهة باللغات الثلاث (`عربي` RTL، `کوردی` RTL، `EN` LTR) وأحجام نصوص `>= 12px` (`text-xs`) وأرقام لاتينية (`0-9`) داخل `<bdi dir="ltr">`.
  - [ ] خلو مقاييس النتائج (`ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS`) من أي نصوص أسئلة محمية بحقوق النشر.

---

## 2. بوابات التحقق الآلية الإلزامية / Mandatory Verification Gates
يرجى تأكيد تشغيل واجتياز الأوامر التالية محلياً:

- [ ] `npm run check:licenses` — فحص توافق رخص الاعتماديات (`GPL-3.0-or-later` / `MIT` / `Apache-2.0` / `ISC` / `OFL-1.1`)
- [ ] `npm run check:content` — فحص سجل التراخيص للملفات المرئية والسريرية في `CONTENT_LICENSES.md`
- [ ] `npm run lint` — فحص الأنواع البرمجية (`tsc --noEmit`)
- [ ] `npm test` — نجاح كافة اختبارات الوحدات والتشفير والترحيل (`Vitest`)
- [ ] `npm run build` — نجاح بناء حزمة الإنتاج (`Vite`)
- [ ] `npm run check:perf` — اجتياز ميزانية الأداء وحجم الحزمة (`Performance Budget Gate`)
- [ ] `npm run test:e2e` — (عند تعديل الواجهات أو التدفقات) اجتياز اختبارات Playwright الشاملة، انعدام الشبكة، وإمكانية الوصول (`axe-core`)
