# سياسة الخصوصية والبيانات المحلية | Privacy Policy

## العربية

- **لا تغادر بياناتك هذا الجهاز نهائياً**: يعمل PhysioRecord بالكامل داخل متصفحك. لا يوجد خادم خلفي (No Backend)، ولا مزامنة سحابية، ولا جمع بيانات تحليلات أو إحصائيات استخدام (Zero Telemetry).
- **عدم وجود اتصالات خارجية**: جميع الخطوط والأيقونات والمكونات البرمجية مضمّنة محلياً داخل حزمة التطبيق، ويتم التحقق آلياً في الاختبارات من عدم إرسال أي طلب شبكة خارج نطاق التطبيق نفسه (`same-origin` فقط).
- **المسؤولية عن الجهاز الفيزيائي**: يجب على العيادة حماية جهاز الحاسوب بكلمة مرور نظام تشغيل، وقفل الخزينة عند ترك الشاشة، وحفظ ملفات النسخ الاحتياطية المشفرة (`.ptbackup`) في وسائط تخزين آمنة.

---

## English

- **Zero Data Exfiltration / No Cloud**: All patient demographics, clinical notes, schedules, and ledgers stay strictly inside your browser's local storage/IndexedDB on the device you run it on. PhysioRecord operates no server, database, analytics pipeline, or crash reporter.
- **No Third-Party Runtime Requests**: All UI code and font assets (`Inter`, `IBM Plex Sans Arabic`, `JetBrains Mono`) are self-hosted inside the application bundle. Automated Playwright verification fails on any non-same-origin network request.
- **Device & Backup Security**: Clinicians and clinic owners are responsible for OS-level device security, locking the vault when stepping away, and keeping encrypted `.ptbackup` exports on secure offline storage.
