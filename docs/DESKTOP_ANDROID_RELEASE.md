# دليل البناء والتوزيع والاختبار الميداني — PhysioRecord (Web / Android APK / Windows Desktop)

يوثق هذا الدليل خطوات البناء المحلي، إعدادات الذاكرة لأجهزة **8 GB RAM (Ryzen 5 3500U)**، إدارة مفتاح التوقيع الرقمي لنظام أندرويد (`Keystore`)، وبروتوكول اختبار بقاء البيانات (`Data-Survival Test`) عبر المنصات الثلاث.

---

## 1. الهوية الثابتة للتطبيق (Locked App Identity — لا تُغيّر أبداً بعد الإصدار الأول)

يرتبط محرك التخزين المحلي المشفر (`IndexedDB` + `WebCrypto AES-GCM Vault`) بمصدر المتصفح (`Origin`) ومسار ملفات النظام:

| المعرف | القيمة المعتمدة | سبب الثبات الإلزامي |
| :--- | :--- | :--- |
| **`appId` / `applicationId`** | `org.physiorecord.app` | تغيير `applicationId` في أندرويد يمنع تثبيت التحديث فوق النسخة الحالية وينشئ تطبيقاً منفصلاً بقاعدة بيانات فارغة. |
| **`productName` / `app.setName`** | `PhysioRecord` | يحدد مسار مجلد البيانات على ويندوز `%APPDATA%\PhysioRecord`. تغييره يجعل التطبيق يبحث في مجلد جديد فارغ. |
| **Android Origin Scheme** | `https://localhost` | يضمن `window.isSecureContext === true` لعمل `crypto.subtle` وثبات `IndexedDB` عبر تحديثات APK. |
| **Windows Electron Scheme** | `app://bundle` | بروتوكول محلي معزول وموثوق يربط قاعدة البيانات بمجلد `IndexedDB/app_bundle_0.indexeddb.leveldb` دائماً. |

---

## 2. التوافق الشامل مع جميع هواتف الأندرويد (Universal Android Compatibility)

صُمم مشروع الأندرويد في `android/` ليعمل على **جميع هواتف الأندرويد** القديمة والحديثة:
1. **Universal APK (`abiFilters "arm64-v8a", "armeabi-v7a", "x86_64"`)**: يدعم المعالجات الحديثة `64-bit` والهواتف الاقتصادية/القديمة `32-bit`.
2. **`minSdkVersion = 24` (Android 7.0+)**: يغطي أكثر من 99.5% من أجهزة أندرويد الفعالة ويتوافق مع متطلبات Capacitor 8.
3. **بديل ضغط تلقائي (`CompressionStream` Fallback)**: عند تصدير `.ptbackup` على هواتف ذات `Android System WebView` قديم لا يدعم `CompressionStream('gzip')`، يتحول التطبيق تلقائياً إلى `compression: 'none'` مع الحفاظ الكامل على تشفير `AES-256-GCM` وتوقيع `HMAC-SHA256`.
4. **دعم جميع مديري الملفات (Samsung, Xiaomi MIUI/HyperOS, Huawei EMUI, Infinix, Tecno, Oppo)**:
   - عند الحفظ: يستخدم `Intent.ACTION_CREATE_DOCUMENT` (Storage Access Framework) أو نافذة المشاركة الأصلية `Intent.ACTION_SEND` عبر `FileProvider`.
   - عند الاستيراد: يقبل `<input type="file" accept=".ptbackup,.json,application/json,application/octet-stream,*/*" />` لتمكين اختيار ملفات `.ptbackup` حتى لو صنّفها الهاتف كـ `application/octet-stream`.

---

## 3. البناء والاختبار على حاسوب Windows (Ryzen 5 3500U — 8 GB RAM) عبر كابل USB

لتجنب استهلاك الذاكرة العشوائية، **لا تشغل محاكي الأندرويد (`AVD Emulator`)**؛ استخدم هاتفاً حقيقياً عبر USB:

### أ. تجهيز الهاتف عبر `adb`
1. فعّل **خيارات المطور (Developer Options)** -> **تصحيح أخطاء USB (USB Debugging)** على الهاتف.
2. وصّل الهاتف بالحاسوب عبر USB وتأكد من ظهوره:
   ```bash
   adb devices
   ```

### ب. بناء وتثبيت نسخة الأندرويد محلياً
تم ضبط `android/gradle.properties` مسبقاً بحد أقصى `-Xmx1280m` وإيقاف `Gradle Daemon` لحماية ذاكرة الـ 8 GB (يتطلب Java 21 متوافقاً مع Capacitor 8):
```bash
npm ci
npm run android:sync
cd android
./gradlew assembleDebug --no-daemon
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### ج. بناء وتشغيل نسخة سطح المكتب Windows Electron محلياً
```bash
npm install --no-save electron@34.3.0 electron-builder@25.1.8
npm run electron:start
# أو لإنتاج ملفات التثبيت والنسخة المحمولة Setup + Portable .exe داخل مجلد release/:
npm run electron:dist
```

---

## 4. توليد وحفظ مفتاح توقيع الأندرويد (`Release Keystore`)

> **تحذير حرج**: يرفض نظام أندرويد تثبيت أي تحديث APK فوق النسخة السابقة (`INSTALL_PARSE_FAILED_INCONSISTENT_CERTIFICATES`) إذا لم يكن موقّعاً بنفس مفتاح الـ Keystore الأصلي. فقدان هذا المفتاح يعني اضطرار المستخدمين لتصدير `.ptbackup` ثم حذف التطبيق القديم وتثبيت الجديد.

### خطوات التوليد (تُنفّذ مرة واحدة فقط خارج المستودع):
```bash
keytool -genkeypair -v \
  -keystore physiorecord-release.jks \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -alias physiorecord
```
1. احتفظ بنسختين offline من ملف `physiorecord-release.jks` وكلمة المرور (على قرص USB خارجي مشفر وفي مدير كلمات مرور).
2. لا تضع ملف `.jks` داخل مستودع Git أبداً (محمي في `.gitignore`).
3. لتمكين التوقيع التلقائي في GitHub Actions، أضف الأسرار الأربعة التالية في **Settings -> Secrets and variables -> Actions**:
   - `ANDROID_KEYSTORE_BASE64`: ناتج تحويل الملف إلى Base64 (`base64 -w 0 physiorecord-release.jks`).
   - `ANDROID_KEYSTORE_PASSWORD`: كلمة مرور مخزن المفاتيح.
   - `ANDROID_KEY_ALIAS`: `physiorecord`.
   - `ANDROID_KEY_PASSWORD`: كلمة مرور المفتاح.

---

## 5. بروتوكول التحقق الميداني واختبار بقاء البيانات (Data-Survival & Restore Protocol)

قبل اعتماد أي إصدار، نفّذ الاختبارين التاليين على هاتف أندرويد حقيقي وعلى نظام Windows:

### الاختبار الأول: بقاء البيانات بعد ترقية الإصدار (In-Place Upgrade Data-Survival)
1. ثبّت الإصدار `v1.0.0`، أنشئ خزنة مشفرة (`Vault`)، وأضف مريضاً حقيقياً تجريبياً مع جلسة علاجية وفاتورة بالدينار العراقي (`25,000 د.ع`).
2. ارفع رقم الإصدار في `package.json` إلى `1.0.1` وشغّل `npm run sync:version` (يرفع `versionCode` تلقائياً من `10000` إلى `10001`).
3. ابنِ النسخة الجديدة وثبّتها فوق النسخة الحالية بدون حذف (`adb install -r` على أندرويد، أو تشغيل `PhysioRecord-Setup-1.0.1-x64.exe` على ويندوز).
4. افتح التطبيق بكلمة المرور وتأكد من وجود المريض، الجلسة، والفاتورة دون أي فقدان.

### الاختبار الثاني: النقل والاستعادة المتقاطعة (`.ptbackup` Cross-Platform Round-Trip)
1. من تطبيق الأندرويد، افتح **النسخ الاحتياطي والاستعادة** -> **تصدير نسخة احتياطية مشفرة (`.ptbackup`)**، واحفظ الملف أو شاركه عبر زر **مشاركة ملف النسخة الاحتياطية (Share)**.
2. انقل ملف `.ptbackup` إلى حاسوب Windows، وافتح تطبيق سطح المكتب `PhysioRecord`، ثم اختر **استعادة من ملف `.ptbackup`**، وتأكد من نجاح فك التشفير ومطابقة جميع السجلات.
