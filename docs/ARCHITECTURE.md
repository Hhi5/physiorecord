# PhysioRecord Architecture (`docs/ARCHITECTURE.md`)

## 1. Architectural Overview

PhysioRecord is a **local-first, browser-only SPA** designed for offline clinical physical therapy operation without a remote server.

```text
+-------------------------------------------------------------------+
| React 19 UI Layer (Arabic & Kurdish Sorani RTL / English LTR)     |
| - Tailwind CSS v4 Semantic Palette Tokens (clinical-default, etc.) |
| - Accessible Primitives (React Aria Components + Custom Inputs)   |
| - Clinical Widgets (Body Chart, ROM/MMT, Special Tests, Outcomes) |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Context & State Layer                                             |
| - VaultContext (unlock, recovery key, auto-lock timer, KDF)       |
| - PatientContext / EpisodeContext / SessionContext                |
| - LanguageContext / ThemeContext / CurrencyContext                |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Domain & Persistence Services (`src/services/`)                   |
| - episodeService / sessionService / soapService (finalize + addenda) |
| - clinicOperationsService (scheduling, finances, staff, HEP)      |
| - localStorageMigrationService (verified migration into Dexie)    |
+---------------------------------+---------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
| Cryptographic Layer (`src/crypto/`) & IndexedDB (`src/db/db.ts`)  |
| - WebCrypto AES-GCM + Per-Record HKDF-SHA256 Subkeys (`v2`)       |
| - Web Worker PBKDF2-SHA256 (600k+) & Optional WebAuthn PRF Unlock |
| - Block-Reserved GCM Counters (70% Auto-Rotation)                 |
| - Dexie Schema v1–v10 (28 object stores) + `.ptbackup` V3.0 Gzip  |
+-------------------------------------------------------------------+
```

## 2. Database Schema (`src/db/db.ts`)

Current Dexie database version is **v10** (historical `v1`–`v9` remain immutable; see [`docs/MIGRATIONS.md`](MIGRATIONS.md)):

- **Core Clinical Stores (`CLINICAL_STORES_REGISTRY`)**: `patients`, `episodes`, `sessions`, `soapNotes`, `clinicalAddenda`, `episodeClinical`
- **Operations & Clinic Stores (Encrypted in Dexie v10, `CLINICAL_STORES_REGISTRY`)**: `appointments`, `waitingList`, `invoices`, `payments`, `expenses`, `auditLogs` (SHA-256 hash-chained), `staffState`, `customWidgets`, `migrationReports`, `recurringSchedules`, `recurringSkippedDates`, `clinicSettings`, `patientMedications`, `consents`, `cashCloses`, `attachments`, `noteTemplates`
- **Device-Local Technical & Crash-Resilience Stores (`EXCLUDED_DEVICE_STORES`)**: `vaultMeta`, `episodeSequences`, `migrationState`, `fsHandles` (`FileSystemDirectoryHandle` references), and `drafts` (encrypted power-cut/crash-resilient form draft buffer added in `v10`), plus `BroadcastChannel` cross-tab sync (`src/utils/vaultEvents.ts`)

> **Storage Isolation**: Only non-sensitive UI preferences (selected palette theme, active language, display preferences key `physiorecord_display_prefs_v1`, dismissible migration notice flag) remain in `localStorage`. Uploaded local UI font binaries (non-PHI) live in isolated `PhysioRecordUiPrefsDB` (`IndexedDB`) and are loaded CSP-safely via `new FontFace(family, ArrayBuffer)` without modifying `PhysioRecordDB`. All clinical and operational data lives encrypted inside `PhysioRecordDB` (`navigator.storage.persist()` requested automatically on first vault unlock).

## 3. UI, PWA & Security Headers

- Replaced Preline UI dependencies completely with project-owned primitives (`src/components/ui/{Dialog,Tabs,Popover,ComboBox,Primitives}.tsx`) built on `react-aria-components` (`Apache-2.0`) and Tailwind CSS v4 semantic theme variables (`src/styles/themes/`).
- Self-hosted `@fontsource/inter`, `@fontsource/ibm-plex-sans-arabic`, and `@fontsource/jetbrains-mono` ensure zero external stylesheet/font downloads.
- Zero-dependency in-repo PWA plugin (`scripts/vite-pwa-plugin.mjs`, `GPL-3.0-or-later`) generates same-origin `/sw.js` and `/manifest.webmanifest` plus production strict CSP `<meta>` and `public/_headers`.
