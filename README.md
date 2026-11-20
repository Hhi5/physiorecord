<div align="center">

<img src="public/icons/physiorecord-icon.svg" alt="PhysioRecord Icon" width="88" height="88" />

# PhysioRecord

**Offline-First, Zero-Server, AES-256-GCM Encrypted Electronic Health Record (EHR) & Clinic Operations Platform for Physical Therapy**

[English](README.md) · [**العربية**](README.ar.md) · [Documentation Portal](docs/INDEX.md)

<p>
  <a href="https://github.com/Hhi5/physiorecord/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/Hhi5/physiorecord/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-GPL--3.0--or--later-0F766E?style=flat-square" alt="License: GPL-3.0-or-later" />
  </a>
  <img src="https://img.shields.io/badge/Version-v1.1.0-115E59?style=flat-square" alt="Version v1.1.0" />
  <img src="https://img.shields.io/badge/Architecture-Local--First%20%C2%B7%20Zero--Cloud-16A34A?style=flat-square" alt="Local-First Zero-Cloud" />
  <img src="https://img.shields.io/badge/Encryption-AES--256--GCM-0284C7?style=flat-square" alt="AES-256-GCM Encryption" />
  <img src="https://img.shields.io/badge/Languages-AR%20%C2%B7%20CKB%20%C2%B7%20EN-D97706?style=flat-square" alt="Languages: Arabic, Kurdish Sorani, English" />
  <img src="https://img.shields.io/badge/Platforms-Web%20PWA%20%7C%20Android%20APK%20%7C%20Windows%20EXE-334155?style=flat-square" alt="Platforms: Web PWA, Android APK, Windows EXE" />
</p>

[Overview](#overview) · [Screenshots](#interface-preview) · [Features](#core-capabilities) · [Security](#security--local-first-architecture) · [Quick Start](#quick-start) · [Builds](#multi-platform-builds) · [Docs](#documentation-portal)

</div>

---

## Overview

**PhysioRecord** (`v1.1.0`) is an open-source, zero-telemetry physical therapy EHR and clinic management suite designed for solo clinicians and multi-therapist practices. Every patient chart, clinical assessment, appointment, and financial ledger entry stays encrypted at rest on the clinic's own device—running identically as an installable **Web PWA**, **Android Universal APK**, or **Windows Desktop (`.exe`)** application with native **Arabic (RTL)**, **Kurdish Sorani (`ckb` RTL)**, and **English (LTR)** interfaces.

### Why PhysioRecord?

- **Complete Data Sovereignty:** Zero external servers, zero cloud accounts, and zero third-party network requests (`Same-Origin` strict `CSP` enforced by automated E2E tests).
- **Power-Cut Resilient Drafting:** Encrypted `IndexedDB` draft buffers (`Dexie v10`) auto-save clinical notes, flowsheets, invoices, and appointments every 2 seconds and flush on page hide so sudden power outages never erase active charting.
- **Built for Real PT Clinical Flow:** Interactive front/back anatomical Body Charts, `ROM`, `MMT`, Orthopedic Special Tests, `ASIA` Neuro tables, `MCID/MDC`-linked outcome calculators, and immutable `SHA-256` finalized `SOAP` notes.
- **Tailored for Iraqi Clinic Operations:** Supports solo and team RBAC modes, weekly recurring appointments, Iraqi home-visit addresses, multi-currency `ISO 4217` invoicing defaulting to IQD (`25,000 د.ع`), local payment channels (`نقداً`, `ZainCash`, `QiCard`, `أخرى`), installment debt aging, and A4/A6 thermal/office printouts.

---

## Interface Preview

<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/ui-redesign/desktop-today-ar.png" alt="PhysioRecord Desktop Today Command Center (Arabic RTL)" />
      <br />
      <sub><b>Desktop — Today Command Center (Arabic RTL)</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/ui-redesign/desktop-finance-en.png" alt="PhysioRecord Desktop Financial Ledger (English LTR)" />
      <br />
      <sub><b>Desktop — Financial Ledger & Packages (English LTR)</b></sub>
    </td>
  </tr>
</table>

<details>
<summary><strong>View more screenshots (Dark Mode & Mobile RTL)</strong></summary>
<br />
<table>
  <tr>
    <td align="center" width="50%">
      <img src="docs/ui-redesign/desktop-today-dark-ar.png" alt="PhysioRecord Desktop Dark Mode (Arabic RTL)" />
      <br />
      <sub><b>Desktop — Dark Mode (Arabic RTL)</b></sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/ui-redesign/mobile-today-ar.png" alt="PhysioRecord Mobile Today View" />
      <br />
      <sub><b>Mobile — Today Queue</b></sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/ui-redesign/mobile-patients-ar.png" alt="PhysioRecord Mobile Patient Directory" />
      <br />
      <sub><b>Mobile — Directory</b></sub>
    </td>
  </tr>
</table>
</details>

---

## Core Capabilities

### 1. Physical Therapy Clinical Documentation
- **Interactive Body Chart:** Front and back anatomical SVG views with pin markers, custom pain-type labels, per-pin color legends, and photo goniometric angle/plumb-line studio (`Konva`).
- **Musculoskeletal & Neuro Assessments:** Active/Passive/Assisted `ROM` (without distracting normative overlays), free-text or smart `MMT` (`0–5`), Orthopedic Special Tests across 9 joint regions, `ASIA/ISNCSCI` dermatomes/myotomes/DTR, regional Red Flags screening, and cardiopulmonary vitals (`BP`, `HR`, `SpO2`).
- **Outcome Measures & Goals:** Score-entry calculators (`ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS`) with `MCID/MDC` deltas, open functional tests (`NPRS`, `PSFS`, `TUG`, `30s-CST`, `5xSTS`), Custom Measure Builder, Problem Lists, and `SMART / GAS` goals.
- **Immutable `SOAP` + Flowsheets:** Unified visit charting with `/` slash templates, 1-tap regional exam presets, exercise flowsheet progression helpers, `SHA-256` finalization seals, and append-only `clinicalAddenda`.

### 2. Clinic Operations & Iraqi Finance
- **Solo & Team Workflows:** Switch between fast Solo Mode (10-second walk-in registration & Today command view) and multi-therapist Team Mode (`Reception Command Center`, Staff Roster, `Admin PIN` RBAC, and privacy screen blur).
- **Scheduling & Home Visits:** Daily/weekly manual recurring schedules with non-blocking overbooking warnings, Iraqi home-visit addresses (Neighborhood / Mahalla / Zukak / Landmark + travel buffer & fee), branches, closed days, and waiting-room Patient Kiosk mode.
- **Billing, Installments & Retention:** Blank-default invoice creation (`فحص`, `جلسة مفردة`, `كورس`), Iraqi payment methods (`نقداً`, `ZainCash`, `QiCard`, `أخرى`), multi-installment plans, `30/60/90+` day debt aging, recurring clinic expenses, daily `Z-Reports`, referring physician progress letters, and patient retention queues.

### 3. Portability, Printing & Offline Sharing
- **Print Portal (`A4` / `A6`):** Single-page auto-fitted invoices, receipts, referring physician reports, discharge summaries, full patient dossiers, visit/balance cards, HEP sheets, and signed informed consents.
- **Standards & Backups:** Encrypted `.ptbackup` `V3.0` archives (streaming `gzip` + `AES-GCM` chunks, backward compatible with `V1.1`/`V2.0`), `HL7 FHIR R4` JSON Bundles, `CSV`/`XLSX` patient onboarding with rollback, and privacy-filtered `.ics` calendar exports.

---

## Security & Local-First Architecture

```text
Clinician Password / WebAuthn PRF
   └─▶ PBKDF2-HMAC-SHA256 (>= 600,000 iterations in Web Worker)
         └─▶ Master Key (non-extractable WebCrypto)
               ├─▶ HKDF-SHA256 Per-Record Subkeys
               └─▶ AES-256-GCM Encrypted IndexedDB (PhysioRecordDB, Dexie v1–v10)
```

| Security Control | Implementation |
| --- | --- |
| **Encryption at Rest** | WebCrypto `AES-256-GCM` with atomic IV reservation & automatic 70% DEK rotation ([`src/crypto/vault.ts`](src/crypto/vault.ts)) |
| **Key Derivation & Unlock** | `PBKDF2-HMAC-SHA256` (`>= 600,000` iterations) inside a Web Worker + optional `WebAuthn PRF` passkey unlock |
| **Account Recovery & Lock** | Verified 32-character (`8×4` Base32) Emergency Recovery Key + configurable auto-lock (`Never` supported) |
| **Audit & Immutability** | `SHA-256` hash-chained clinic audit logs; finalized `SOAP` notes cannot be overwritten or soft-deleted |
| **Zero-Network Isolation** | Self-hosted `@fontsource/*` fonts, bundled assets, local service worker, strict `CSP`, verified by Playwright offline tests |

> Cryptographic vault primitives honor the `GPL-3.0` attribution to [`Niema-Lab/PhysioMeter`](https://github.com/Niema-Lab/PhysioMeter) — see [`NOTICE`](NOTICE).

---

## Quick Start

### Prerequisites

- **Node.js `>= 20`** (CI runs Node `22`) and **`npm`**
- *(Optional, for Android APK builds)* **Java 21 JDK (`keytool`)** + **Android SDK**

### Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/Hhi5/physiorecord.git
cd physiorecord

# 2. Install dependencies
npm ci

# 3. Start the local development server on http://localhost:3000
npm run dev
```

### Public Demo Mode

Launch the app with `?demo=1` (e.g., `http://localhost:3000/?demo=1`) or build with `VITE_PUBLIC_DEMO=true` to reveal the demo banner for one-click seeding and purging of `CC0-1.0` fictional Iraqi physical therapy cases (`src/data/syntheticPatients.ts`).

---

## Multi-Platform Builds

PhysioRecord uses locked persistent app identifier `org.physiorecord.app` across all targets:

```bash
# 1. Web PWA production bundle (emits /sw.js & /manifest.webmanifest)
npm run build:web

# 2. Android Universal APK (Capacitor 8)
npm run android:keystore:init   # One-time local release keystore generation (.keystore/)
npm run android:sync            # Builds android bundle + syncs android/ Gradle project

# 3. Windows Desktop (Electron 34 + electron-builder)
npm install --no-save electron@34.3.0 electron-builder@25.1.8
npm run electron:start          # Launch desktop shell locally
npm run electron:dist           # Build NSIS Setup + Portable .exe into release/

# 4. Sync single-source version across package.json, in-app metadata & Android versionCode
node scripts/sync-version.mjs --version=v1.1.0
```

See [`docs/DESKTOP_ANDROID_RELEASE.md`](docs/DESKTOP_ANDROID_RELEASE.md) and [`docs/UPDATES_AND_SIGNING.md`](docs/UPDATES_AND_SIGNING.md) for signing secrets and in-place data-survival upgrade testing.

---

## Tech Stack & Repository Structure

| Layer | Technologies |
| --- | --- |
| **UI & Accessibility** | React `19`, TypeScript `7`, Tailwind CSS v4 (`@tailwindcss/vite`), React Aria Components (`Apache-2.0`), Lucide Icons (`ISC`) |
| **Self-Hosted Typography** | `@fontsource/ibm-plex-sans-arabic`, `@fontsource/inter`, `@fontsource/jetbrains-mono` (`OFL-1.1`) |
| **Storage & Search** | Dexie `4` (`IndexedDB` `v1`–`v10`, 28 stores), `MiniSearch` `7` (Arabic/Kurdish normalization), `Zod` `4` |
| **Clinical Canvas** | `Konva` + `react-konva` (photo angle/posture measurement & annotations) |
| **Desktop & Mobile Shells** | Capacitor `8` (`@capacitor/android`), Electron `34` + `electron-builder` (`25.1.8`) |
| **Build & QA Tooling** | Vite `8`, Vitest `5`, Playwright `1.65` + `@axe-core/playwright` |

<details>
<summary><strong>Explore repository directory layout</strong></summary>

```text
physiorecord/
├── .github/                  # CI & Release workflows, Dependabot, Issue/PR templates
├── android/                  # Capacitor Android project (Universal APK, org.physiorecord.app)
├── docs/                     # Bilingual technical & clinical documentation (docs/INDEX.md)
├── e2e/                      # Playwright E2E, zero-network, axe-core & RTL visual tests
├── electron/                 # Electron main/preload shell for Windows Desktop builds
├── public/                   # Static icons & deployment security headers (_headers)
├── scripts/                  # Build target, PWA plugin, license/content/perf gates, keystore & SBOM
├── src/
│   ├── components/
│   │   ├── clinic/           # Today, Reception, Schedule, Finance Ledger, HEP, Modals & Panels
│   │   ├── layout/           # AppLayout & navigation shell
│   │   ├── organui/          # Clinical progression SVG charts & medication schedule UI
│   │   ├── print/            # A4/A6 @media print portal (Invoices, Reports, Dossiers, HEP)
│   │   ├── settings/         # Modular Settings tabs & Display/Font preferences
│   │   ├── toolkit/          # ASIA/ISNCSCI sensory table reference
│   │   ├── ui/               # Project-owned accessible primitives (React Aria, Modals, Tabs)
│   │   ├── widgets/          # BodyChart, ROM, MMT, Neuro, SpecialTests, FunctionalScales, Gait
│   │   └── workspace/        # MasterPatientChart (chart/) & TreatmentSessionView (session/)
│   ├── context/              # Vault, Language (ar/ckb/en), Theme, Currency, Patient/Episode/Session
│   ├── crypto/               # WebCrypto AES-GCM vault, PBKDF2 Worker, .ptbackup, WebAuthn PRF
│   ├── data/                 # Consent templates, CC0 note snippets, terminology & clinicalToolkit/
│   ├── db/                   # Dexie v1–v10 schema (28 stores), registry & durability helpers
│   ├── hooks/                # Reusable hooks (useVirtualWindow)
│   ├── i18n/                 # Externalized ar/ckb/en dictionaries & Kurdish Sorani phrase mapper
│   ├── platform/             # Unified Web / Capacitor Android / Electron native bridge
│   ├── pwa/                  # Offline Service Worker registration & update client
│   ├── services/             # Single-writer domain facade (operations/, session, soap, episode)
│   ├── styles/themes/        # Semantic Tailwind v4 clinical palettes
│   ├── types/                # Clinical, toolkit, widget & clinic management TypeScript types
│   └── utils/                # MCID/MDC, FHIR R4 export, CSV/XLSX import, Iraqi finance/schedule
├── AGENTS.md                 # Architectural invariants, license rules & preserved customizations
├── CONTENT_LICENSES.md       # Manifest for all SVGs, fonts & clinical datasets
└── sbom.cdx.json             # Generated CycloneDX Software Bill of Materials
```

</details>

---

## Verification & Compliance

Every pull request runs automated security, licensing, asset-manifest, performance-budget, and offline E2E checks:

```bash
npm run check:licenses                    # Verify SPDX licenses for all runtime & dev packages
npm run check:content                     # Verify all SVGs, fonts & catalogs in CONTENT_LICENSES.md
npm run lint                              # TypeScript static typecheck (tsc --noEmit)
npm test                                  # Vitest unit, crypto, Dexie migration & domain tests
npm run build                             # Vite production bundle + strict CSP & PWA manifest
npm run check:perf                        # Verify bundle sizes against docs/PERFORMANCE_BUDGET.json
npm run sbom                              # Regenerate CycloneDX SBOM (sbom.cdx.json)
npm run test:e2e                          # Playwright E2E, zero-network, axe-core & RTL checks
npm audit --omit=dev --audit-level=high   # Production dependency vulnerability audit
```

---

## Documentation Portal

| Guide | Focus |
| --- | --- |
| **[`docs/INDEX.md`](docs/INDEX.md)** | Full bilingual Arabic/English documentation hub |
| **[`CHANGELOG.md`](CHANGELOG.md)** | Release history (`v1.0.0` & `v1.1.0` Phases `A`–`F`) |
| **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** | Local-first topology, single-writer services & 28 Dexie stores |
| **[`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)** | Cryptographic design & security threat boundaries |
| **[`docs/MIGRATIONS.md`](docs/MIGRATIONS.md)** | Append-only Dexie `v1`–`v10` schema migrations |
| **[`docs/BACKUP_FORMAT.md`](docs/BACKUP_FORMAT.md)** | `.ptbackup` `V3.0` chunked encrypted archive specification |
| **[`docs/FHIR_R4_MAPPING.md`](docs/FHIR_R4_MAPPING.md)** | HL7 FHIR R4 Bundle (`LOINC` / `SNOMED CT`) mapping |
| **[`docs/TRANSLATION_GUIDE.md`](docs/TRANSLATION_GUIDE.md)** | `ar` / `ckb` / `en` localization & RTL guidelines |
| **[`docs/UI_DESIGN_SYSTEM_V2.md`](docs/UI_DESIGN_SYSTEM_V2.md)** | Design tokens & `pr-*` component reference |

---

## Clinical Disclaimer & License

> **Clinical & Non-Medical-Device Notice:** **PhysioRecord** is a local clinic record-keeping and organizational software tool—not a certified medical device. Bundled clinical catalogs marked *"Pending Clinician Review"* require independent clinician verification prior to clinical use. See [`DISCLAIMER.md`](DISCLAIMER.md), [`PRIVACY.md`](PRIVACY.md), and [`SECURITY.md`](SECURITY.md).

- **Contributing:** Read [`AGENTS.md`](AGENTS.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before modifying Dexie schemas, cryptography, Iraqi defaults, or third-party dependencies.
- **License:** Distributed under the **`GPL-3.0-or-later`** license — see [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), [`CONTENT_LICENSES.md`](CONTENT_LICENSES.md), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
