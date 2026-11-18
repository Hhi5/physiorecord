# دليل التحديثات المباشرة وتوقيع الإصدارات — PhysioRecord
# In-Place App Updates & Signing Guide (Android / Windows / Web PWA)

يضمن هذا الدليل أن يحصل المستخدمون على التحديثات الجديدة **فوق التطبيق المثبّت حالياً** دون الحاجة لحذف التطبيق ودون فقدان قاعدة البيانات المشفرة المحلية (`IndexedDB`).

This guide explains how **PhysioRecord** ships non-destructive, in-place upgrades across **Android (APK)**, **Windows (Electron Setup EXE)**, and **Web (PWA)** while preserving all encrypted clinic records.

---

## 1. إعداد مفتاح توقيع أندرويد الموحد (لمرة واحدة فقط)
## 1. One-Time Setup: Persistent Android Release Keystore

يعتمد نظام أندرويد على قاعدة صارمة: **لا يمكن تحديث التطبيق فوق نسخة قديمة إلا إذا كان يحمل نفس معرّف الحزمة (`org.physiorecord.app`) + نفس مفتاح التوقيع الرقمي (Keystore) + رقم `versionCode` أعلى.**

1. شغّل الأمر التالي محلياً على جهاز التطوير (يتطلب Java JDK `keytool`):

   ```bash
   npm run android:keystore:init
   ```

2. سيقوم السكربت بتوليد ملف المفتاح `.keystore/physiorecord-release.jks` (مستبعد تماماً من Git عبر `.gitignore`) ويطبع لك بصمة `SHA-256` وسلسلة `Base64` الجاهزة.

3. أضف الأسرار (Secrets) التالية في مستودع GitHub تحت:
   **Settings → Secrets and variables → Actions → Repository secrets**

   | Secret Name | الوصف / Description |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | سلسلة Base64 الخاصة بملف `.keystore/physiorecord-release.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | كلمة مرور ملف Keystore |
   | `ANDROID_KEY_ALIAS` | الاسم المستعار للمفتاح (الافتراضي `physiorecord_release`) |
   | `ANDROID_KEY_PASSWORD` | كلمة مرور المفتاح الداخلي |
   | `ANDROID_CERT_SHA256` *(اختياري ومُوصى به)* | بصمة شهادة SHA-256 للتحقق التلقائي من تطابق الشهادة قبل نشر أي APK |

> **حماية إلزامية في خط الإنتاج (`release.yml`):**
> إذا فُقدت أسرار التوقيع عند إطلاق نسخة رسمية، سيتوقف البناء تلقائياً ويرفض إنتاج APK موقّع بمفتاح مؤقت (`debug.keystore`) حتى لا يضطر المستخدمون لحذف التطبيق القديم.
> *(لا يُسمح ببناء APK تجريبي غير موقّع إلا عبر تشغيل يدوي صريح بخيار `allow_unsigned_debug=true`)*.

> **تنبيه أمني:** احتفظ بنسخة مشفرة آمنة من ملف `physiorecord-release.jks` وكلمات المرور خارج جهازك الرئيسي. فقدان ملف Keystore يمنع إصدار تحديثات أندرويد متوافقة فوق النسخ المثبّتة.

---

## 2. توحيد أرقام الإصدارات قبل النشر
## 2. Single Source of Truth Versioning

قبل إنشاء Tag جديد (مثل `v1.2.0`):

```bash
node scripts/sync-version.mjs --version=v1.2.0
```

يقوم هذا الأمر بتحديث جميع المواضع تلقائياً:
- `package.json` (`"version": "1.2.0"`)
- `src/utils/settingsOnboardingPhaseF.ts` (`APP_SEMVER_VERSION = '1.2.0'`)
- `android/app/build.gradle` (`versionName "1.2.0"` و `versionCode` التصاعدي `major * 10000 + minor * 100 + patch`)

كما يقوم خط النشر في GitHub Actions (`.github/workflows/release.yml`) بمزامنة رقم الإصدار من Tag الإطلاق تلقائياً عبر جميع المنصات.

---

## 3. كيف يتم التحديث على كل منصة بدون حذف البيانات؟
## 3. Platform Upgrade Guarantees

1. **Android (`org.physiorecord.app`)**:
   - يظل `applicationId` ثابتاً والمفتاح موحداً.
   - تثبيت ملف APK الرسمي الأحدث يقوم بترقية التطبيق مباشرة ويُبقي قاعدة بيانات WebView (`IndexedDB`) كما هي.
2. **Windows (`org.physiorecord.desktop`)**:
   - استخدم دائماً مثبّت **`PhysioRecord-Setup-*.exe`** (NSIS بوضع `perMachine: false`, `deleteAppDataOnUninstall: false`, `oneClick: false`).
   - التثبيت فوق النسخة الحالية يحدّث ملفات البرنامج مع بقاء بيانات العيادة المشفّرة في `%APPDATA%\PhysioRecord` سليمة.
   - *(تجنّب استبدال التثبيت بنسخة Portable كمسار بديل إلا كنسخة إضافية)*.
3. **Web PWA (`/sw.js`)**:
   - يعتمد `Service Worker` على اسم Cache مرتبط ببصمة البناء (`__BUILD_HASH__`) ويزيل الملفات القديمة تلقائياً بعد التفعيل دون المساس بـ `IndexedDB`.
   - يظهر للمستخدم شريط تحديث مع زر **"نسخ احتياطي أولاً (.ptbackup)"** قبل إعادة التحميل.

---

## 4. درع النسخ الاحتياطي المسبق داخل التطبيق
## 4. In-App Update Center & Pre-Update Backup Shield

في **الإعدادات ← الأمان (الإصدارات والتحديثات)** يجد المستخدم بطاقة **"التحديثات الآمنة دون مسح البيانات"**:
- فحص يدوي للتحديثات (بدون أي اتصال تلقائي بالإنترنت حفاظاً على الخصوصية `connect-src 'none'`).
- تنبيه فوري بوضع آخر نسخة احتياطية مشفرة (`.ptbackup`).
- نافذة **درع حماية البيانات قبل التحديث** التي تقترح حفظ نسخة احتياطية مشفرة قبل تنزيل أو تفعيل التحديث الجديد.
