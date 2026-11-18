# بوابة التوثيق الشاملة — PhysioRecord Documentation Portal (`docs/INDEX.md`)

مرحباً بك في بوابة التوثيق الرسمية لنظام **PhysioRecord** (`v1.1.0`) — نظام السجلات الصحية الإلكترونية للعلاج الطبيعي المحلي أولاً (Local-First) والمشفّر بالكامل على جهاز العيادة دون خادم سحابي (Zero-Server)، والمصمّم خصيصاً لعيادات العلاج الطبيعي في العراق باللغات **العربية (RTL)**، **الكردية السورانية (`ckb` RTL)**، و**الإنجليزية (LTR)**.

Welcome to the official documentation portal for **PhysioRecord (`v1.1.0`)** — the offline-first, zero-server encrypted clinical physical therapy Electronic Health Record (EHR) built for solo and multi-therapist physical therapy clinics in Iraq with full **Arabic (RTL)**, **Kurdish Sorani (`ckb` RTL)**, and **English (LTR)** parity. This Markdown index is compatible with both **GitHub Pages** and **VitePress**.

---

## 1. البدء السريع ونظرة عامة (Quick Start & Overview)

| الوثيقة (Document) | الملخص بالعربية (Arabic Summary) | English Summary |
| --- | --- | --- |
| [`README.md`](../README.md) | دليل التشغيل السريع، الميزات السريرية والمالية العراقية (`25,000 د.ع`)، أوامر الفحص، ووضع العرض التجريبي (`?demo=1`). | Quick start guide, Iraqi clinical & financial customizations (`25,000 IQD`), verification scripts, and Public Demo Mode (`?demo=1`). |
| [`CHANGELOG.md`](../CHANGELOG.md) | سجل الإصدارات الكامل بما في ذلك الإصدار `1.1.0` (المراحل الإضافية `A` إلى `F`: المسودات المقاومة لانقطاع الكهرباء، القوالب الإقليمية، العمليات العراقية، وجودة البيانات). | Full release history including `v1.1.0` (Addendum Phases `A`–`F`: power-cut resilient drafts, regional presets, Iraqi operations, and data quality). |
| [`AGENTS.md`](../AGENTS.md) | الثوابت الهندسية والسريرية، التخصيصات المحمية لمالك العيادة، وسياسة التراخيص. | Architectural invariants, preserved clinic owner customizations, and open-source license enforcement rules. |

---

## 2. البنية المعمارية، التشفير، وترقيات قاعدة البيانات (Architecture, Security & Storage)

| الوثيقة (Document) | الملخص بالعربية (Arabic Summary) | English Summary |
| --- | --- | --- |
| [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) | البنية المحلية بدون خادم، طبقات الخدمة الموحدة (`Single-Writer` مع وحدات `src/services/operations/` و`settings/` و`workspace/{chart,session}/`)، وفصل الجداول السريرية المحمولة (`23` جدولاً) عن الجداول التقنية للجهاز (`5` جداول). | Local-first zero-server topology, centralized single-writer services (`src/services/operations/` & modular `settings/` / `workspace/` components), and separation of `23` portable clinical stores from `5` device-local stores. |
| [`docs/THREAT_MODEL.md`](THREAT_MODEL.md) | نموذج التهديدات الأمني، تشفير `WebCrypto AES-256-GCM`، اشتقاق `PBKDF2-SHA256` (`>= 600,000` تكرار) و`HKDF-SHA256` لكل سجل، وسجل التدقيق المتسلسل `SHA-256`. | Security threat model, `WebCrypto AES-256-GCM`, `600,000`-iteration `PBKDF2-SHA256`, per-record `HKDF-SHA256` subkeys, and `SHA-256` hash-chained audit logs. |
| [`docs/BACKUP_FORMAT.md`](BACKUP_FORMAT.md) | المواصفة القياسية لملف النسخ الاحتياطي المشفر `.ptbackup` الإصدار `V3.0` (ضغط `gzip` وتشفير مجزأ `256 KB` مع توافق عكسي لإصداري `V1.1` و`V2.0`). | Cryptographic specification for `.ptbackup` `V3.0` (streaming `gzip` + `256 KB` authenticated `AES-GCM` chunks with `V1.1`/`V2.0` backward compatibility). |
| [`docs/MIGRATIONS.md`](MIGRATIONS.md) | دليل ترقيات مخطط `Dexie / IndexedDB` التفصيلي من الإصدار `v1` حتى `v10` (بما فيها جدول المسودات `drafts`) وترحيل `localStorage` الآمن. | Per-version `Dexie / IndexedDB` schema migration reference from `v1` through `v10` (including the `v10` `drafts` crash buffer) and idempotent `localStorage` migration. |
| [`docs/DESKTOP_ANDROID_RELEASE.md`](DESKTOP_ANDROID_RELEASE.md) | دليل البناء والتوزيع لأندرويد (Capacitor Universal APK) وسطح المكتب (Windows Electron `.exe`) وحماية البيانات عند الترقية. | Build, distribution, and in-place data-survival testing guide for Android (Capacitor APK) and Windows Desktop (Electron NSIS/Portable). |
| [`docs/UPDATES_AND_SIGNING.md`](UPDATES_AND_SIGNING.md) | دليل توقيع تطبيق الأندرويد (`Keystore`) وتوحيد أرقام الإصدارات (`sync-version.mjs`) والتحديثات الموضعية دون فقدان البيانات. | Android Release Keystore setup, single-source-of-truth versioning (`sync-version.mjs`), and in-place upgrade signing rules. |
| [`docs/PERFORMANCE_BUDGET.json`](PERFORMANCE_BUDGET.json) | حدود الأداء وحجم الحزمة المستهدفة (`npm run check:perf`) للأجهزة الاقتصادية ومراقبة تقسيم الشيفرة البرمجية. | Target client bundle splitting thresholds and 6x-CPU runtime budgets enforced by `npm run check:perf`. |

---

## 3. المعايير السريرية، التبادل البيني، والترجمة (Clinical Interop, Content Packs & Localization)

| الوثيقة (Document) | الملخص بالعربية (Arabic Summary) | English Summary |
| --- | --- | --- |
| [`docs/FHIR_R4_MAPPING.md`](FHIR_R4_MAPPING.md) | ربط بيانات المرضى والحلقات والجلسات والمقاييس السريرية بمعيار `HL7 FHIR R4 Bundle` وأكواد `LOINC` / `SNOMED CT`. | Mapping of patients, episodes, encounters, and outcome observations to standard `HL7 FHIR R4` JSON Bundles (`LOINC` / `SNOMED CT`). |
| [`docs/CONTENT_PACK_CONVENTION.md`](CONTENT_PACK_CONVENTION.md) | مواصفة حزم المحتوى السريري المجتمعي (`JSON`) لقوالب الملاحظات والفحص الإقليمي، شروط الرخص المفتوحة (`CC0-1.0`, `CC-BY-4.0`, `MIT`)، والتحقق البرمجي عبر `validateCommunityContentPackMetadata()`. | Specification for community clinical `JSON` content packs (note snippets & exam presets), permitted SPDX licenses, and `validateCommunityContentPackMetadata()`. |
| [`docs/TRANSLATION_GUIDE.md`](TRANSLATION_GUIDE.md) | دليل تعريب وترجمة الواجهات للغات العربية (`ar`)، الكردية السورانية (`ckb` عبر `ckbDictionary.ts`)، والإنجليزية (`en`)، وقواعد اتجاه `RTL` والأرقام اللاتينية (`0-9`) والعملة العراقية (`25,000 د.ع`). | Localization guide covering Arabic (`ar`), Kurdish Sorani (`ckb` via `ckbDictionary.ts`), and English (`en`), `RTL` layout rules, Latin digits (`0-9`), and post-number currency formatting (`25,000 د.ع`). |
| [`docs/UI_DESIGN_SYSTEM_V2.md`](UI_DESIGN_SYSTEM_V2.md) | نظام التصميم الحديث `v2` لسطح المكتب والجوال: الرموز التصميمية، مكوّنات `pr-*`، قواعد RTL، وقالب طلب جاهز لأدوات الذكاء الاصطناعي. | Modern `v2` design system for desktop & mobile: tokens, `pr-*` components, RTL rules, and a copy-paste AI prompt template. |

---

## 4. الحوكمة المفتوحة المصدر، التراخيص، والخصوصية (Open-Source Governance, Licensing & Privacy)

| الوثيقة (Document) | الملخص بالعربية (Arabic Summary) | English Summary |
| --- | --- | --- |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | دليل المساهمة للمطورين والمعالجين الفيزيائيين، معايير الكود، وبوابات التحقق الآلية قبل فتح طلبات الدمج (`Pull Requests`). | Developer & clinician contribution guidelines, coding standards, and pre-PR automated verification gates. |
| [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | ميثاق سلوك المجتمع المفتوح المصدر لضمان بيئة تعاونية مهنية ومحترمة. | Community Code of Conduct fostering a welcoming, respectful open-source environment. |
| [`SECURITY.md`](../SECURITY.md) | سياسة الإبلاغ المسؤول عن الثغرات الأمنية وحدود الحماية التشفيرية المحلية. | Vulnerability disclosure policy and local cryptographic security boundaries. |
| [`CONTENT_LICENSES.md`](../CONTENT_LICENSES.md) | السجل الكامل لجميع الرسومات التشريحية (`SVG`)، الخطوط المحلية، والبيانات السريرية المدمجة المتحققة عبر `npm run check:content`. | Registry of all anatomical `SVG` assets, self-hosted fonts, and clinical catalogs verified by `npm run check:content`. |
| [`LICENSE`](../LICENSE) & [`NOTICE`](../NOTICE) | رخصة المشروع (`GPL-3.0-or-later`) وإشعارات الإسناد لمشروع `Niema-Lab/PhysioMeter` والاعتماديات المفتوحة. | Project license (`GPL-3.0-or-later`), `Niema-Lab/PhysioMeter` cryptographic attribution, and third-party notices. |
| [`PRIVACY.md`](../PRIVACY.md) & [`DISCLAIMER.md`](../DISCLAIMER.md) | بيان الخصوصية المحلي الصارم (صفر خوادم خارجية أو تتبع) وإخلاء المسؤولية الطبية والسريرية. | Zero-telemetry local privacy statement and clinical judgment / non-medical-device disclaimer. |

---

## 5. قوالب مجتمع GitHub (GitHub Issue & Pull Request Templates)

- **تقرير خطأ برمجي (Bug Report)**: [`.github/ISSUE_TEMPLATE/bug_report.md`](../.github/ISSUE_TEMPLATE/bug_report.md)
- **طلب ميزة سريرية أو تشغيلية (Feature Request)**: [`.github/ISSUE_TEMPLATE/feature_request.md`](../.github/ISSUE_TEMPLATE/feature_request.md)
- **مهمة مناسبة للمساهمين الجدد (Good First Issue)**: [`.github/ISSUE_TEMPLATE/good_first_issue.md`](../.github/ISSUE_TEMPLATE/good_first_issue.md)
- **قالب طلب الدمج (Pull Request Checklist)**: [`.github/pull_request_template.md`](../.github/pull_request_template.md)
