# PhysioRecord — نظام السجلات السريرية للعلاج الطبيعي (المحلي والمشفّر)

[![CI Verification](.github/workflows/ci.yml)](.github/workflows/ci.yml)

**PhysioRecord** (`v1.1.0`) هو تطبيق محلي أولاً (Local-First) لإدارة عيادات العلاج الطبيعي والتوثيق السريري دون خادم سحابي (Zero Server)، مصمّم باللغات **العربية (RTL)** و**الكردية السورانية (`ckb` RTL)** مع دعم كامل للغة **الإنجليزية (LTR)**، ومهيأ خصيصاً لعيادات العلاج الطبيعي في العراق، ويعمل عبر **Web (PWA)** و**Android (Capacitor APK)** و**Windows Desktop (Electron)**.

> **الترخيص (`GPL-3.0-or-later`):**  
> يخضع **PhysioRecord** لرخصة **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)** — راجع [`LICENSE`](LICENSE) و[`NOTICE`](NOTICE) — توافقاً مع اشتقاق دوال التشفير في [`src/crypto/vault.ts`](src/crypto/vault.ts) من مشروع [`Niema-Lab/PhysioMeter`](https://github.com/Niema-Lab/PhysioMeter) (`GPL-3.0`). كافة الاعتماديات مرخّصة برخص مفتوحة متوافقة (`MIT` / `Apache-2.0` / `ISC` / `0BSD` / `OFL-1.1`).

---

## نظرة عامة والميزات الأساسية (Core Capabilities)

- **تشغيل محلي بالكامل بدون سحابة أو تتبّع (Offline & Zero-Telemetry)**: تعمل كافة الواجهات والخطوط (`@fontsource/inter`, `@fontsource/ibm-plex-sans-arabic`, `@fontsource/jetbrains-mono`) محلياً من نفس المصدر (`Same-Origin`) مع سياسة `CSP` صارمة ودون أي استدعاءات شبكة خارجية.
- **خزينة مشفرة على الجهاز (Encrypted Local Vault)**: تشفير البيانات السريرية والتشغيلية في `IndexedDB` (`PhysioRecordDB`, Dexie `v1`–`v10`) عبر `WebCrypto AES-256-GCM`، اشتقاق مفاتيح `PBKDF2-HMAC-SHA256` (`>= 600,000` تكرار داخل Web Worker)، ومفاتيح فرعية `HKDF-SHA256` لكل سجل، مع مفتاح استرداد طارئ (`32` خانة)، دعم قفل عدم النشاط (مع خيار `"أبداً" / Never`)، وفتح اختياري بالبصمة عبر `WebAuthn PRF`.
- **حماية المسودات من انقطاع الكهرباء (`Dexie v10 drafts`)**: حفظ مؤتمت مشفر للمسودات أثناء العمل مع استرجاع فوري عند إعادة الفتح عبر `RecoveredWorkBanner.tsx`.
- **توثيق سريري متخصص للعلاج الطبيعي**:
  - مخطط الجسم التفاعلي (Body Chart) بمسارات أمامية وخلفية مع تخصيص نوع الألم واللون.
  - قياس المدى الحركي (`ROM: AROM / PROM / AAROM` دون عرض نطاقات مرجعية معيارية) واختبار القوة العضلية (`MMT`) بنظام حر أو ذكي.
  - بطارية الفحوصات الاستفزازية التخصصية (`Orthopedic Special Tests`) لـ 9 مناطق مفصلية.
  - الفحص العصبي (`ASIA/ISNCSCI Dermatomes`, `Myotomes`, `DTR`) وقوائم الفرز (`Red Flags`) والأهداف (`SMART / GAS`) والمؤشرات الحيوية (`BP`, `HR`, `SpO2`).
  - مقاييس النتائج السريرية (`Score-Entry` لـ `ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS` مع حساب `MCID/MDC` + الاختبارات الوظيفية `NPRS`, `PSFS`, `TUG`, `30s-CST`, `5xSTS` + منشئ المقاييس المخصصة).
  - توثيق `SOAP`، التثبيت النهائي بختم `SHA-256` غير قابل للتعديل، والتعديل عبر الملاحق السريرية فقط (`Append-Only Clinical Addenda`).
- **إدارة العيادة والملف المالي العراقي**:
  - وضع العمل الفردي (`Solo Mode`) ووضع الفريق متعدد الصلاحيات (`Team RBAC` مع `Admin PIN` وسجل تدقيق متسلسل `SHA-256`).
  - المواعيد اليومية والتكرار الأسبوعي اليدوي مع تنبيهات التضارب غير المانعة، زيارات المنازل العراقية، الفروع، الاستراحات وأيام الإغلاق.
  - الفواتير والأسعار الافتراضية الفارغة، العملات العالمية (`ISO 4217`) بوضع افتراضي للدينار العراقي (`25,000 د.ع` الرمز بعد الرقم)، طرق الدفع العراقية (`نقداً`، `ZainCash`، `QiCard`، `أخرى`)، الأقساط وتقادم الديون (`30/60/90+` يوم)، المصاريف المتكررة، تقارير إغلاق الصندوق (`Z-Reports`)، والطباعة `A4`/`A6`.
- **النسخ الاحتياطي المشفر والتبادل البيني**: تصدير واستيراد `.ptbackup` `V3.0` (`gzip` + تشفير مجزأ `AES-GCM` مع توافق `V1.1`/`V2.0`)، تصدير `HL7 FHIR R4 Bundle` و`CSV`/`XLSX`، وتصدير المواعيد `.ics`.
- **متعدد المنصات (`org.physiorecord.app`)**: Web PWA (`/sw.js` + `/manifest.webmanifest`), Android Universal APK (`Capacitor`), وWindows Desktop (`Electron` NSIS Setup + Portable `.exe`).

> ⚠️ **تنبيه سريري وإخلاء مسؤولية (Clinical & Non-Medical-Device Notice):**  
> **PhysioRecord** برنامج محلي لتنظيم السجلات السريرية وإدارة العيادة وليس جهازاً طبياً معتمداً. بعض الكتالوجات السريرية المدمجة موسومة بـ *"Pending Clinician Review"* وتخضع لمراجعة المعالج المختص قبل الاعتماد عليها. راجع [`DISCLAIMER.md`](DISCLAIMER.md) و[`CONTENT_LICENSES.md`](CONTENT_LICENSES.md).

---

## English Documentation

### Tech Stack

Verified directly against [`package.json`](package.json):

| Layer | Technologies |
| --- | --- |
| **UI & Styling** | React `19`, TypeScript `7`, Tailwind CSS v4 (`@tailwindcss/vite`), React Aria Components (`Apache-2.0`), Lucide Icons (`ISC`) |
| **Fonts (Self-Hosted)** | `@fontsource/ibm-plex-sans-arabic`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (`OFL-1.1`) |
| **Local Persistence & Search** | Dexie `4` (`IndexedDB` schema `v1`–`v10`), `MiniSearch` `7` (Arabic/Kurdish normalized search), `Zod` `4` |
| **Clinical Canvas** | `Konva` + `react-konva` (photo angle/posture studio & canvas measurement) |
| **Desktop & Mobile Shells** | Capacitor `8` (`@capacitor/android`, `@capacitor/core`), Electron `34` + `electron-builder` (`25.1.8`) |
| **Tooling & Testing** | Vite `8`, Vitest `5`, Playwright `1.65` + `@axe-core/playwright` |

### Folder Structure

```text
physiorecord/
├── .github/                  # CI & Release workflows, Dependabot, Issue/PR templates
├── android/                  # Capacitor Android project (Universal APK, org.physiorecord.app)
├── docs/                     # Bilingual technical & clinical docs portal (docs/INDEX.md)
├── e2e/                      # Playwright E2E, zero-network, axe-core & RTL visual tests
├── electron/                 # Electron main/preload shell for Windows Desktop builds
├── public/                   # Static icons & Cloudflare/static _headers
├── scripts/                  # Build target, PWA plugin, license/content/perf gates, keystore & SBOM
├── src/
│   ├── components/
│   │   ├── clinic/           # Today, Reception, Schedule, Finance Ledger, HEP, Modals & Panels
│   │   ├── layout/           # AppLayout & Sidebar navigation shell
│   │   ├── organui/          # Clinical progression SVG charts & medication schedule UI
│   │   ├── print/            # A4/A6 @media print portal (Invoices, Reports, Dossiers, HEP)
│   │   ├── settings/         # Modular Settings tabs & Display/Font preferences UI
│   │   ├── toolkit/          # ASIA/ISNCSCI sensory table reference
│   │   ├── ui/               # Project-owned accessible primitives (React Aria, Modals, Tabs)
│   │   ├── widgets/          # BodyChart, ROM, MMT, Neuro, SpecialTests, FunctionalScales, Gait
│   │   └── workspace/
│   │       ├── chart/        # MasterPatientChart modular tab & modal sub-panels
│   │       └── session/      # TreatmentSessionView SOAP, alerts, & addenda sub-panels
│   ├── context/              # Vault, Language (ar/ckb/en), Theme, Currency, Patient/Episode/Session
│   ├── crypto/               # WebCrypto AES-GCM vault, PBKDF2 Worker, backup (.ptbackup), recovery, WebAuthn PRF
│   ├── data/                 # Consent templates, CC0 note snippets, terminology & clinicalToolkit/ catalogs
│   ├── db/                   # Dexie v1–v10 schema (28 stores), registry & durability helpers
│   ├── hooks/                # Reusable hooks (useVirtualWindow)
│   ├── i18n/                 # Externalized ar/ckb/en dictionaries & Kurdish Sorani phrase mapper
│   ├── platform/             # Unified Web / Capacitor Android / Electron native bridge
│   ├── pwa/                  # Offline Service Worker registration & update client
│   ├── services/
│   │   ├── operations/       # Domain modules (vaultHydration, staffRbac, clinicalRecords, settings, scheduling, finance)
│   │   ├── clinicOperationsService.ts  # Single-writer operations facade & listener coordinator
│   │   └── ...               # episodeService, sessionService, soapService, draftRecoveryService, migration
│   ├── styles/themes/        # Semantic Tailwind v4 clinical palettes
│   ├── types/                # Clinical, toolkit, widget & clinic management TypeScript types
│   └── utils/                # Outcome MCID/MDC, FHIR R4 export, CSV/XLSX import, Iraqi finance/schedule helpers
├── AGENTS.md                 # Architectural invariants, license rules & preserved owner customizations
├── CONTENT_LICENSES.md       # Manifest for all SVGs, fonts & clinical datasets
└── sbom.cdx.json             # Generated CycloneDX Software Bill of Materials
```

### Setup & Installation

**Prerequisites**: Node.js `>= 20` (CI runs Node `22`), `npm`. For Android APK builds: Java 21 JDK (`keytool`) + Android SDK.

```bash
# Install dependencies strictly from package-lock.json
npm ci

# Start local development server on http://localhost:3000
npm run dev
```

#### Public Demo Mode

Append `?demo=1` (or `?publicDemo=true`) to the URL, or build with `VITE_PUBLIC_DEMO=true`, to display `PublicDemoBanner` with 1-click seeding/purging of `CC0-1.0` fictional Iraqi physical therapy cases (`src/data/syntheticPatients.ts`).

#### Multi-Platform Builds

```bash
# 1. Web PWA production bundle (emits /sw.js & /manifest.webmanifest)
npm run build:web

# 2. Android Universal APK preparation (Capacitor)
npm run android:keystore:init   # One-time local release keystore generation (.keystore/)
npm run android:sync            # Builds android web bundle + prepares manifest/config + npx cap sync android

# 3. Windows Desktop (Electron)
npm install --no-save electron@34.3.0 electron-builder@25.1.8
npm run electron:start          # Run desktop shell locally
npm run electron:dist           # Build NSIS Setup + Portable .exe into release/

# 4. Sync version across package.json, in-app metadata & Android versionCode
node scripts/sync-version.mjs --version=v1.1.0
```

See [`docs/DESKTOP_ANDROID_RELEASE.md`](docs/DESKTOP_ANDROID_RELEASE.md) and [`docs/UPDATES_AND_SIGNING.md`](docs/UPDATES_AND_SIGNING.md) for signing secrets and data-survival upgrade testing.

### Usage Overview

1. **Vault Creation & Recovery Key**: On first launch, create a master password (`10+` characters) and verify saving the 8-group (`32`-char) Emergency Recovery Key before entering the workspace.
2. **Workspace Mode**: Choose **Solo Mode** (fast Today command view + walk-in registration) or **Team Mode** (Reception Command Center, Staff Roster & Admin PIN RBAC).
3. **Clinical Episode & Session Loop**: Register or select a patient -> open an Episode of Care -> document Body Chart, ROM/MMT, Special Tests, Outcomes, Vitals, and SOAP -> Sign & Finalize (`SHA-256` sealed; edits append to `clinicalAddenda`).
4. **Scheduling & Iraqi Finance**: Book appointments (including concurrent slots & weekly recurring series) and record blank-default IQD (`د.ع`) invoices/installments using `نقداً`, `ZainCash`, `QiCard`, or `أخرى`.
5. **Encrypted Backups**: Export/restore `.ptbackup` `V3.0` files regularly from **Settings -> Security & Backup** or via local folder auto-backup (`FileSystemDirectoryHandle`).

### Configuration

- **Environment Variables** ([`.env.example`](.env.example)):
  - `VITE_APP_TARGET`: Optional build target (`web`, `android`, or `desktop`; set automatically by `scripts/build-target.mjs`).
  - `VITE_PUBLIC_DEMO`: Set to `true` to enable Public Demo Mode by default.
  - Zero API keys or cloud endpoints exist or are required.
- **Locked Persistent Identifiers (Do Not Change After Release)**:
  - `appId` / `applicationId`: `org.physiorecord.app` ([`capacitor.config.json`](capacitor.config.json), [`electron-builder.yml`](electron-builder.yml))
  - IndexedDB Name: `PhysioRecordDB` (and non-PHI font DB `PhysioRecordUiPrefsDB`)
  - UI `localStorage` keys: `physiorecord_*`

### Verification & Compliance Scripts

```bash
npm run check:licenses   # Verify SPDX licenses for all runtime & dev dependencies
npm run check:content    # Verify all SVGs, fonts & clinical datasets in CONTENT_LICENSES.md
npm run lint             # TypeScript static typecheck (tsc --noEmit)
npm test                 # Vitest unit, crypto, Dexie migration & domain tests
npm run build            # Vite production bundle + strict CSP & PWA generation
npm run sbom             # Regenerate CycloneDX SBOM (sbom.cdx.json)
npm run test:e2e         # Playwright E2E, zero-network same-origin, axe-core & RTL checks
npm audit --omit=dev --audit-level=high  # Production dependency vulnerability check
```

> Note: `npm run check:perf` measures built `dist/` bundle sizes against [`docs/PERFORMANCE_BUDGET.json`](docs/PERFORMANCE_BUDGET.json) thresholds for low-end clinics.

### Contribution Notes & License

- Read [`AGENTS.md`](AGENTS.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) before modifying database schemas (`Dexie v1`–`v10` are append-only), crypto primitives, preserved Iraqi clinic defaults, or third-party dependencies.
- All code and original project assets are licensed under **`GPL-3.0-or-later`** ([`LICENSE`](LICENSE)). See [`NOTICE`](NOTICE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for attributions.

### Documentation Portal

- **[docs/INDEX.md](docs/INDEX.md)** — Full bilingual Arabic/English documentation index
- [`CHANGELOG.md`](CHANGELOG.md) — Release notes (`v1.0.0` & `v1.1.0` Phases `A`–`F`)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Storage topology & service boundaries
- [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md) — Cryptography & threat boundaries
- [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) — Dexie `v1`–`v10` & `localStorage` migrations
- [`docs/BACKUP_FORMAT.md`](docs/BACKUP_FORMAT.md) — `.ptbackup` `V3.0` specification
- [`docs/FHIR_R4_MAPPING.md`](docs/FHIR_R4_MAPPING.md) — HL7 FHIR R4 Bundle mapping
- [`docs/TRANSLATION_GUIDE.md`](docs/TRANSLATION_GUIDE.md) — `ar` / `ckb` / `en` localization guide
- [`docs/UI_DESIGN_SYSTEM_V2.md`](docs/UI_DESIGN_SYSTEM_V2.md) — Design tokens & `pr-*` UI reference
- [`PRIVACY.md`](PRIVACY.md) · [`SECURITY.md`](SECURITY.md) · [`DISCLAIMER.md`](DISCLAIMER.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
