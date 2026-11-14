# PhysioRecord — نظام السجلات السريرية للعلاج الطبيعي (المحلي والمشفّر)

[![CI Verification](.github/workflows/ci.yml)](.github/workflows/ci.yml)

**PhysioRecord** هو تطبيق ويب محلي أولاً (Local-First) لإدارة عيادات العلاج الطبيعي والتوثيق السريري دون خادم سحابي (Zero Server)، مصمّم باللغات العربية (RTL) والكردية السورانية (ckb RTL) مع دعم كامل للغة الإنجليزية (LTR)، ومهيأ خصيصاً لبيئة عيادات العلاج الطبيعي في العراق.

> **الترخيص (License — `GPL-3.0-or-later`):**  
> يخضع **PhysioRecord** لرخصة **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)** — راجع ملف [`LICENSE`](LICENSE) و[`NOTICE`](NOTICE) — توافقاً مع اشتقاق دوال التشفير في `src/crypto/vault.ts` من مشروع [`Niema-Lab/PhysioMeter`](https://github.com/Niema-Lab/PhysioMeter) (`GPL-3.0`). كافة الاعتماديات البرمجية مرخّصة برخص متساهلة متوافقة مع `GPL-3.0` (`MIT` / `Apache-2.0` / `ISC` / `0BSD` / `OFL-1.1`).

---

## الميزات الأساسية (Core Capabilities)

- **تشغيل محلي بالكامل بدون سحابة (Offline & Local-First)**: تعمل كافة الواجهات والخطوط (`@fontsource/inter`, `@fontsource/ibm-plex-sans-arabic`, `@fontsource/jetbrains-mono`) محلياً دون أي استدعاءات شبكة خارجية أو تتبّع (Telemetry).
- **خزينة مشفرة محلياً على هذا الجهاز (Encrypted Local Vault)**: تشفير قواعد بيانات المرضى والملفات السريرية عبر `WebCrypto AES-GCM` واشتقاق مفاتيح `PBKDF2-SHA256` و`HKDF-SHA256` مع مفتاح استرداد طارئ (Emergency Recovery Key).
- **توثيق سريري متخصص للعلاج الطبيعي**:
  - مخطط أعراض الجسم (Body Chart) بمسارات أمامية وخلفية.
  - قياس المدى الحركي للمفاصل (`ROM: AROM / PROM / AAROM`) واختبار القوة العضلية (`MMT`) بنظام حر/ذكي.
  - بطارية الفحوصات الاستفزازية التخصصية (`Orthopedic Special Tests`) لـ 9 مناطق مفصلية.
  - فحوصات الأعصاب (`Dermatomes ASIA/ISNCSCI`, `Myotomes`, `DTR`).
  - مقاييس النتائج السريرية (`Score-Entry` للنماذج المرخصة مثل `ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS` مع `MCID/MDC` وروابط المصادر الرسمية + الاختبارات الأدائية العامة `NPRS`, `PSFS`, `TUG`, `30s Chair Stand`, `5xSTS` + منشئ المقاييس المخصصة).
  - توثيق `SOAP` وجلسات المتابعة مع التثبيت النهائي والملاحق السريرية (`Addenda`).
- **إدارة العيادة والملف المالي العراقي**: الاستقبال والطابور، المواعيد اليومية والتكرار الأسبوعي التلقائي، الفواتير بالدينار العراقي (`د.ع` بعد الرقم) أو عملات `ISO 4217`، طرق الدفع العراقية (نقداً، زين كاش، كي كارد، أخرى)، وإعدادات الكادر والأمان.
- **النسخ الاحتياطي المشفر (`.ptbackup`)**: تصدير واستعادة مشفرة بكلمة مرور مستقلة (`PHYSIORECORD_BACKUP_V3.0` مع التوافق العكسي لإصدارات `V1.1` / `V2.0`).

---

## PhysioRecord (English Overview)

**PhysioRecord** is an offline-capable, browser-resident clinical physical therapy Electronic Health Record (EHR) built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **React Aria Components (`Apache-2.0`)**, and **Dexie / IndexedDB**. It requires no backend server, makes zero runtime network calls, and prioritizes Arabic (RTL) and Kurdish Sorani (ckb RTL) alongside full English (LTR) clinical workflows.

### Quick Start (Local Development & Public Demo Mode)

```bash
npm ci
npm run dev
```

- **Public Demo Mode (`?demo=1`)**: Append `?demo=1` (or `?publicDemo=true`, or build with `VITE_PUBLIC_DEMO=true`) to launch PhysioRecord with the persistent **Public Demo Mode** banner (`PublicDemoBanner.tsx`) and 1-click seeding/purging of `CC0-1.0` fictional Iraqi physical therapy cases (`src/data/syntheticPatients.ts`).

### Verification & Compliance Scripts

```bash
npm run lint             # TypeScript typecheck (tsc --noEmit)
npm test                 # Vitest unit & crypto/migration suites
npm run build            # Production Vite bundle
npm run check:perf       # Bundle size & 6x CPU performance budget gate (Phase A5)
npm run check:licenses   # Dependency SPDX license gate (R3)
npm run check:content    # Built-in SVG/asset/content manifest gate (0.5)
npm run sbom             # Generate CycloneDX SBOM (sbom.cdx.json)
npm run test:e2e         # Playwright E2E, zero-network, axe-core & RTL snapshots
npm audit --audit-level=high # Security audit check
```

## Documentation Index

- **[docs/INDEX.md](docs/INDEX.md) — البوابة الشاملة للتوثيق / Full Bilingual Documentation Portal (VitePress & GitHub Pages ready)**
- [CHANGELOG.md](CHANGELOG.md) — Release history (`v1.0.0` & `v1.1.0` Addendum Phases `A`–`F`)
- [LICENSE](LICENSE) — GNU General Public License v3.0 or later (`GPL-3.0-or-later`)
- [NOTICE](NOTICE) — Attribution & dependency/asset license summary
- [CONTENT_LICENSES.md](CONTENT_LICENSES.md) — Asset, SVG, font, and clinical catalog registry
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — Generated NPM dependency license inventory
- [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution rules, code conventions & license gate
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards
- [SECURITY.md](SECURITY.md) — Vulnerability disclosure & cryptographic boundaries
- [DISCLAIMER.md](DISCLAIMER.md) — Clinical responsibility & non-medical-device notice
- [PRIVACY.md](PRIVACY.md) — Local-only privacy statement
- [AGENTS.md](AGENTS.md) — Engineering invariants & owner customizations for AI/human contributors
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design & storage topology
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — Security assumptions, mitigations & honest gaps
- [docs/MIGRATIONS.md](docs/MIGRATIONS.md) — Dexie `v1`–`v10` schema evolution, `localStorage` & crypto migrations
- [docs/BACKUP_FORMAT.md](docs/BACKUP_FORMAT.md) — `.ptbackup` `V3.0` binary/JSON cryptographic specification
- [docs/FHIR_R4_MAPPING.md](docs/FHIR_R4_MAPPING.md) — HL7 FHIR R4 Bundle export mapping (`LOINC` / `SNOMED CT`)
- [docs/CONTENT_PACK_CONVENTION.md](docs/CONTENT_PACK_CONVENTION.md) — Community clinical `JSON` content pack convention & license rules
- [docs/TRANSLATION_GUIDE.md](docs/TRANSLATION_GUIDE.md) — Arabic (`ar`), Kurdish Sorani (`ckb`), and English (`en`) localization guide
