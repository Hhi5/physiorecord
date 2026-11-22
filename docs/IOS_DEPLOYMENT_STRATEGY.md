# خطة التوفير طويل الأمد لنظام iOS (iPhone & iPad) — PhysioRecord

هذا الدليل يوضح الخطة العملية **طويلة الأمد وغير التجريبية** لتوفير تطبيق **PhysioRecord** لأجهزة **iPhone و iPad** دون الاعتماد على طرق التوقيع المؤقتة التي تنتهي صلاحيتها كل 7 أيام (مثل AltStore / Sideloadly).

---

## لماذا نرفض التوقيع المؤقت (7 أيام) للسجلات الطبية؟

تثبيت ملف `.ipa` بشهادة Apple مجانية (Free Provisioning Profile) يُبطل التطبيق تلقائياً بعد 7 أيام ويتطلب إعادة التوقيع من حاسوب كل أسبوع؛ وفي حال إزالة التطبيق وإعادة تثبيته تُفقد قاعدة البيانات المحلية غير المنسوخة. لذلك **يُمنع الاعتماد على التوقيع المؤقت في عيادات العلاج الطبيعي**.

---

## المسار الأول (متاح فوراً، دائم، مجاني $0/سنة): تطبيق iOS مستقل (Standalone PWA)

هذا هو المسار الأفضل والمستقر تماماً للاستخدام اليومي الفوري على iPhone و iPad اليوم:

1. **استضافة HTTPS مستقرة ومجانية مدى الحياة ($0 + Bandwidth غير محدود) عبر Cloudflare Pages**:
   - ادخل إلى `https://dash.cloudflare.com` ← **Workers & Pages** ← **Create** ← **Pages** ← **Connect to Git** واختر مستودع `Hhi5/physiorecord`.
   - اضبط إعدادات البناء التالية مرة واحدة فقط:
     - **Framework preset**: `Vite` (أو `None`)
     - **Build command**: `npm run build:web`
     - **Build output directory**: `dist`
     - **Environment variable** (اختياري لتثبيت الإصدار): `NODE_VERSION = 22`
   - اضغط **Save and Deploy** ← خلال دقيقة واحدة يصبح رابطك الثابت جاهزاً (مثل `https://physiorecord.pages.dev`) ويتحدث تلقائياً مع كل `git push`.
   - **قاعدة أساسية**: الحفاظ على نفس النطاق (Origin) دائماً لأن iOS يربط قاعدة البيانات المشفرة (`IndexedDB`) باسم النطاق.
2. **بوابة حماية وتوجيه المنصات المدمجة (`PlatformAccessGateScreen`)**:
   - **iPhone / iPad داخل تبويب Safari العادي**: يُمنع إنشاء خزينة داخل التبويب (حمايةً من مسح Safari بعد 7 أيام) وتظهر شاشة التثبيت بـ 3 خطوات. بمجرد الفتح من أيقونة الشاشة الرئيسية يفتح التطبيق كاملاً أوفلاين.
   - **iPhone / iPad داخل Chrome / Edge / WhatsApp / Telegram**: تظهر شاشة «افتح الرابط في Safari أولاً» مع زر نسخ الرابط بضغطة واحدة.
   - **Android و Windows/Desktop من المتصفح**: يُمنع استخدام نسخة الويب ويتم توجيه المستخدم مباشرةً لتحميل التطبيق الرسمي المجاني (`.apk` أو `.exe`) من GitHub Releases.
3. **التثبيت والتحديثات التلقائية بدون App Store**:
   - التطبيق يتضمن بالفعل `apple-touch-icon` (`180×180` PNG)، و`manifest.webmanifest` (`display: standalone`)، وملف `public/_headers` المضبوط لعدم تخزين `/sw.js` مؤقتاً.
   - عند رفع أي تحديث جديد على GitHub، يعيد Cloudflare Pages بناء الواجهة تلقائياً؛ وأول ما يفتح مستخدم الآيفون التطبيق وهو متصل بالإنترنت، يتحقق الـ Service Worker في الخلفية ويحمّل الواجهة الجديدة **دون المساس ببيانات المرضى المشفّرة (`IndexedDB`)** ويعرض شريط **«تحديث الآن»**.
4. **حماية التخزين والعمل أوفلاين 100%**:
   - تطبيقات الشاشة الرئيسية (Standalone PWA) تحصل على تخزين محلي معزول ومستقر أكثر من تبويبات Safari العادية، مع Service Worker يعمل أوفلاين بالكامل.
   - **دعم Face ID / Touch ID**: على iOS 18+ يدعم Safari امتداد `WebAuthn PRF Passkey` لفتح الخزينة بالوجه أو البصمة مباشرة، مع وجود `Quick PIN` كبديل فوري.
   - **حماية البيانات طويلة الأمد**: تفعيل **مزامنة Google Drive المشفّرة طرفياً (`E2EE`)** أو حفظ نسخة مشفّرة دورية (`.ptbackup`) يضمن عدم ضياع أي ملف مريض حتى لو ضاع الآيفون أو تم استبداله، مع مزامنة فورية بين **Windows + Android + iPhone**.

---

## المسار الثاني (طويل الأمد للنشر الرسمي على App Store): تطبيق Capacitor iOS أصلي

تمت تهيئة المشروع مسبقاً لينتقل بسلاسة إلى **App Store / TestFlight** عندما تقرر الاستثمار في حساب مطور Apple ($99/سنة):

### 1. ما هو جاهز في الكود بالفعل الآن
- **`capacitor.config.json`**: يحتوي على إعدادات `ios` الإنتاجية (`scheme: "PhysioRecord"`, `contentInset: "automatic"`, `limitsNavigationsToAppBoundDomains: true`, `appId: "org.physiorecord.app"`).
- **`npm run build:ios:web`**: يبني حزمة الويب المخصصة لـ `WKWebView` على iOS مع سياسة أمان `IOS_META_CSP` الصارمة ودون تعارض مع Service Worker.
- **نفس الكود بنسبة 99%**: جميع شاشات React و Dexie المشفرة وواجهة الطباعة وتخزين المرفقات تعمل مباشرة داخل Capacitor iOS.

### 2. خطوات الإطلاق الرسمي على App Store (دون الحاجة لشراء Mac!)
يمكن بناء وتوقيع ورفع نسخة iOS تلقائياً بالكامل عبر **GitHub Actions (`macos-15` runner)** مجاناً للمستودعات العامة:

1. **الاشتراك في Apple Developer Program** ($99 سنوياً) باسم المطور أو العيادة (يمنح توزيعاً دائماً على App Store + TestFlight حتى 10,000 مستخدم دون انتهاء صلاحية أسبوعي).
2. **إضافة منصة iOS مرة واحدة**:
   ```bash
   npm install -D @capacitor/ios
   npm run build:ios:web
   npx cap add ios
   npx cap sync ios
   ```
3. **تكافؤ البصمة الأصلي (Native Keychain + LocalAuthentication)**:
   - إضافة Plugin أصلي صغير بلغة Swift (مكافئ تماماً لـ `AndroidBiometricVaultPlugin` في مجلد `android/`) يحفظ مفتاح التغليف داخل **iOS Secure Enclave / Keychain** محمياً بـ Face ID / Touch ID (`LAContext`).
4. **متطلبات مراجعة Apple App Store (لتجنّب الرفض)**:
   - **تصريح التشفير (`ITSAppUsesNonExemptEncryption`)**: تعيينه في `Info.plist` والإقرار بأن التطبيق يستخدم تشفيراً قياسياً لحماية بيانات المستخدم المحلية (`AES-GCM` / HTTPS).
   - **أذونات الخصوصية (`Info.plist`)**: إضافة وصف واضح باللغتين العربية والإنجليزية لـ `NSFaceIDUsageDescription` و `NSPhotoLibraryUsageDescription` (لصور التقييم السريري) و `NSMicrophoneUsageDescription` (للإملاء الصوتي إن فُعّل).
   - **سياسة الخصوصية (`Privacy Nutrition Labels`)**: إعلان **"Data Not Collected"** لأن جميع بيانات المرضى تبقى مشفّرة على الجهاز ولا تصل لخادم المطور.
   - **التوقيع والرفع الآلي عبر GitHub Actions**: تخزين شهادة التوزيع `.p12` وملف Provisioning Profile ومفتاح App Store Connect API في GitHub Secrets، وبناء `.ipa` ورفعه تلقائياً إلى **TestFlight / App Store** عند كل إصدار (`v1.x.x`).

---

## ملخص المقارنة لاتخاذ القرار

| المعيار | المسار 1: iOS Standalone PWA (جاهز الآن) | المسار 2: App Store عبر Capacitor iOS |
| :--- | :--- | :--- |
| **التكلفة السنوية** | **$0 مجاناً للأبد** | $99 / سنة (Apple Developer) |
| **صلاحية التطبيق** | **دائم (لا ينتهي كل 7 أيام)** | **دائم عبر App Store** |
| **العمل بدون إنترنت** | نعم 100% (Service Worker + IndexedDB) | نعم 100% (حزمة محلية + WKWebView) |
| **سرعة وصول التحديثات** | فورية تلقائياً دون مراجعة Apple | خلال 24–48 ساعة (مراجعة App Store) |
| **المزامنة مع الويندوز والأندرويد** | نعم (Google Drive E2EE + LAN + `.ptbackup`) | نعم (نفس البروتوكول تماماً) |
| **حاجة لجهاز Mac** | لا يحتاج Mac أبداً | لا يحتاج Mac (يُبنى على GitHub Actions `macos-15`) |
