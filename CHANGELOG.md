# Changelog

All notable changes to **PhysioRecord** are documented in this file.

## [Unreleased]

### Dexie v11 Schema, Deletion Tombstones & Backward Compatibility
- **Dexie `v11` (`deletionTombstones` — 29 Total Stores: 24 Portable + 5 Device-Local)**: Appended encrypted `deletionTombstones` (`&id, storeName, recordId, deletedAt`) to `PhysioRecordDB` and `CLINICAL_STORES_REGISTRY` without modifying immutable `v1`–`v10` definitions (`src/db/db.ts`, `src/db/registry.ts`, `src/services/deletionTombstoneService.ts`).
- **Anti-Resurrection Across Backups & 2-Device Sync**: Explicit session deletions (`SessionService.deleteSession`, `SessionService.deleteFinalizedSession`) record encrypted tombstones that are preserved in `.ptbackup` `V3.0` archives and `ClinicSyncPayload` envelopes. Backup merges reconcile tombstones first (even when merging legacy pre-v11 backups lacking `deletionTombstones`, logging `skipped_deleted`), and 2-device sync propagates explicit deletions while keeping ordinary absence non-destructive (`src/crypto/backup.ts`, `src/utils/clinicSyncEngine.ts`, `src/services/clinicSyncService.ts`).
- **Proactive Schema Downgrade Guard & Multi-Tab `versionchange`/`blocked` Handling**: Hardened `detectDexieSchemaDowngradeError()` for deeply nested error chains and added post-open `inspectOpenedDatabaseSchemaDowngrade()` in `VaultContext` (`src/platform/nativeBridge.ts`, `src/context/VaultContext.tsx`) to counter Dexie 4's silent-open behavior on future schema downgrades (`v12+` opened by `v11`), plus graceful `versionchange` connection release and `blocked` boot/LockScreen guidance (`src/db/db.ts`, `src/App.tsx`, `src/components/auth/LockScreen.tsx`).

### Clinic Operations, Multi-Device Sync & Discharge Summary
- **Custom Adaptive Brand Logo**: Replaced platform, PWA, Android, and Windows Desktop icons with a transparent, theme-adaptive clinic emblem (`BrandLogo.tsx`, `public/icons/physiorecord-icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
- **Patient Discharge & Treatment Journey Summary**: Added complete episode discharge workflow (`DischargeEpisodeModal.tsx`, `treatmentJourneySummary.ts`) generating a structured clinical treatment journey & pain/outcome improvement summary and moving discharged patients cleanly into a dedicated **Completed Treatment** section.
- **Multi-Therapist Clinic Sync Options (Zero Ongoing Cost, Tombstone-Aware Safe Merge)**:
  - **Local Wi-Fi Clinic Sync (LAN)**: Connects clinic PC and therapists' phones over the same regular clinic Wi-Fi router (no PC hotspot or internet required), with 1-paste `URL|Token` quick pairing, offline encrypted outbox queueing, and tombstone-aware merging (ordinary absence never deletes local records; explicit clinician deletions propagate via encrypted `deletionTombstones`).
  - **Optional End-to-End Encrypted Google Drive Sync (`$0`)**: Lazy-loaded OAuth (`drive.file` scope only, zero startup network calls) encrypting per-device `.ptsync.json` envelopes client-side with `AES-256-GCM` before upload, paired with an in-app setup guide and offline queue.
- **Deliberate Deletion of Finalized Sessions & Mobile RTL Polish**: Added explicit confirmation modal with quick deletion reasons and audit trail (`session_deleted`) to delete accidentally finalized empty sessions atomically (`SessionService.deleteFinalizedSession`) while writing encrypted `deletionTombstones`, fixed finalized-session mobile RTL layout (hiding stale pre-finalization advisories, clean single-line addenda badge, non-clipped `Recorded by` box).
- **Public GitHub Release Hygiene**: Generated verified `package-lock.json`, pinned `@grpc/grpc-js >= 1.14.7` to pass `npm audit --omit=dev --audit-level=high`, refreshed `docs/legal/THIRD_PARTY_NOTICES.md`, removed temporary AI Studio scratch uploads from `public/`, and added [`docs/GITHUB_RELEASE_CLEANUP.md`](docs/GITHUB_RELEASE_CLEANUP.md).

### UI — Modern App Shell v2 (Desktop + Mobile Redesign)
- **Design tokens v2**: Soft ambient canvas, layered elevation (`--pr-shadow-1..3`), hairline borders, glass surfaces, and a 10/12/14/16/24px radius scale (still driven by the user's corner-radius preference in `appearancePrefs.ts`).
- **Unified components (`src/index.css`)**: `pr-page-header`, `pr-hero`, `pr-kpi`, `pr-seg`, `pr-btn`, `pr-icon-btn`, `pr-chip`, `pr-field`, `pr-search`, `pr-surface`, `pr-topbar`, `pr-sidebar`, `pr-nav-item`, `pr-tabbar`, `pr-tab`, `pr-sheet-panel`, `pr-avatar` — all inside `@layer components` so Tailwind responsiveness keeps priority.
- **Desktop shell**: Grouped glass sidebar with pill active state and collapsed icon rail, 64px glass top bar with breadcrumb + page title + capsule search + single gradient primary CTA + account avatar.
- **Mobile shell**: Airier 64px top bar (brand + title + search/new-patient/account), 5-tab capsule bottom bar with safe-area padding, and all `ModalDialog` surfaces now open as rounded bottom sheets with a drag handle on phones.
- **Screens modernized**: Today command center, Patient directory (header, toolbar, cards), Reception queue, Finance ledger KPI grid, and the lock/first-run cards.
- **Accessibility**: `axe-core` WCAG 2.0/2.1 A+AA now reports **0 violations** on Today, Patients, and Finance at 1440×900 and 390×844 in light and dark mode (including bottom sheets); fixed a pre-existing sky-badge contrast issue and a patient card accessible-name mismatch.
- **Docs**: Added [`docs/UI_DESIGN_SYSTEM_V2.md`](docs/UI_DESIGN_SYSTEM_V2.md) with the token/component reference, RTL rules, verification steps, reference screenshots, and a copy-paste prompt template for AI tools.

## [1.1.0] - 2026-11-14

Clinical & Iraqi Operations Addendum (**Phases A–F**) plus Clinic Owner Enhancements.

### Phase A — Resilience & Performance (`v10` Power-Cut Drafts & 6x CPU Budgets)
- **Power-Cut Durable Encrypted Drafts (`drafts` Store in Dexie `v10`)**: Added `src/db/durability.ts` (`relaxed` / `strict` IndexedDB durability helper) and `src/services/draftService.ts` to persist encrypted in-progress form states (`SOAP`, flowsheet, invoice, appointment) with a `2s` debounce and immediate flush on `visibilitychange` / `pagehide` so zero characters are lost during sudden power cuts.
- **Recovered Work Banner (`RecoveredWorkBanner.tsx`)**: Added an on-unlock recovery banner allowing clinicians to restore or discard unsaved encrypted drafts after an unexpected shutdown or browser crash.
- **Windowed Virtualization & Cold-Store Lazy Loading**: Added lightweight zero-dependency virtualized list rendering (`src/components/ui/VirtualizedList.tsx`) for 5,000+ patients, sessions, appointments, invoices, and audit entries, alongside cold-store lazy loading so startup decrypts only active hot records.
- **Automated 6x CPU Performance Budgets (`npm run check:perf`)**: Added `scripts/perf-budget-gate.mjs` and unit/E2E benchmarks verifying bundle size and p95 latencies (`< 100ms` search, `< 200ms` patient open, `< 150ms` tab switch, `< 80ms` draft save).

### Phase B — Clinical Workflow & Safety (Regional Presets, MCID Goals & Safety Rules)
- **1-Tap Regional Exam Presets (`examPresetsCc0.ts`)**: Added `CC0-1.0` starter evaluation presets across 9 core anatomical regions plus post-op/neuro/pediatric/sports (`Neck`, `Low Back`, `Shoulder`, `Elbow/Wrist/Hand`, `Hip`, `Knee`, `Ankle/Foot`, `Post-Op`, `Neuro`, `Pediatric`, `Sports`) with JSON preset pack export/import.
- **Problem List & SMART Goals Linked to Outcome Deltas**: Added structured clinical Problem List and Goal cards (`ProblemGoalsFlowsheetPanels.tsx`) with automatic progress calculation against baseline/target outcome scores and published `MCID` thresholds, plus Exercise Flowsheet progression helpers (`+2.5 kg`, `+2 reps`, `Hold`, `Regress`, `Copy last session`).
- **Re-Evaluation Nudges & SOAP Completeness Warnings**: Added configurable re-evaluation nudges (e.g., every 6th visit or 30 days) and non-blocking pre-finalization SOAP completeness checks (`clinicalCompletenessB3B4.ts`).
- **Modality Contraindications, Vitals Alerts & Pediatric Safeguards**: Added cited electrophysical/thermal modality safety rules (`modalitySafetyCatalog.ts`, `modalitySafetyRules.json`) gated behind Senior PT review sign-off (`ModalitySafetySignoffModal.tsx`), cardiopulmonary vitals alerts (`BP`, `HR`, `SpO2` in `VitalsPanel.tsx`), and pediatric (`< 18` years) guardian & consent safeguards.

### Phase C — Iraq-Specific Clinic Operations (Home Visits, Locations, Installments & Referrals)
- **Home-Visit Scheduling & Multi-Location Support (`iraqScheduleLocationsC1C3.ts`)**: Added `isHomeVisit` appointment scheduling with structured Iraqi address fields (`Neighborhood/الحي`, `Mahalla/المحلة`, `Zukak/الزقاق`, `Nearest Landmark/أقرب نقطة دالة`), travel buffer minutes, travel fee (`د.ع`), 1-tap Google Maps directions link, and multi-location practice filtering (`Locations`).
- **Closed Days, Weekly Breaks & Optional Hijri Display**: Added `ClosedDaysBreaksModal.tsx` for clinic-defined closed date ranges/holidays (without bundled sectarian holiday lists), recurring weekly break windows, and optional secondary Hijri (`Intl` `islamic-umalqura`) date display alongside primary Gregorian dates.
- **Installment Plans, 30/60/90+ Day Debt Aging & Recurring Expenses (`iraqFinanceC4C5.ts`)**: Added multi-installment payment schedules (`InstallmentPlansAgingPanel.tsx`), overdue debt aging buckets (`Current`, `1–30`, `31–60`, `61–90`, `90+` days) with `+964` WhatsApp payment reminders, and recurring monthly clinic expense tracking (`RecurringExpensesPanel.tsx` for generator, rent, salaries, internet, consumables with `0` prefill defaults).
- **Referring Doctors Directory & Patient Retention Lists (`iraqReferralsRetentionC6C7.ts`)**: Added referring physician directory, specialty & referral volume analytics, 1-click printable thank-you / progress report-back letters (`ReferralsAndRetentionPanel.tsx`), and 4 actionable retention queues (Active Packages Low, Dropped Out `> 14d`, Post-Discharge `4w` & `12w` Follow-Ups).

### Phase D — Data Quality, Safe Import & Terminology (`dataQualityPhaseD.ts`)
- **Duplicate Patient Guard & Transactional Patient Merge**: Added real-time normalized Arabic/Kurdish name + Iraqi phone (`+964`) duplicate detection and transactional `PatientMergeModal.tsx` with an encrypted pre-merge undo snapshot (`mergeSnapshots`) and full preservation of finalized SOAP `SHA-256` seals.
- **CSV & Zero-Dependency XLSX Import Wizard**: Enhanced `CsvOnboardingModal.tsx` to support both `.csv` and `.xlsx` spreadsheets with column auto-guessing, 10-row dry-run preview, duplicate flagging, and 1-click batch import rollback.
- **30-Day Non-Clinical Recycle Bin & Data Health Scanner**: Added `DataHealthAndTrashPanel.tsx` providing soft-delete trash restoration for non-finalized operational items (while keeping finalized SOAP notes and `clinicalAddenda` permanently non-deletable) and a 5-category Data Health & orphan record scanner.
- **Offline Bilingual Terminology Glossary (`src/data/terminology.ts`)**: Shipped a `CC0-1.0` searchable Arabic/English physical therapy terminology catalog (`ICD-10` / `ICF` / `SNOMED` concepts) integrated into clinical inputs.

### Phase E — Offline Sharing, Calendar Export & Photo Studio (`sharingInteropPhaseE.ts`)
- **Offline Web Share API & `+964` WhatsApp Fallbacks**: Added native `navigator.share({ files })` integration for receipts, HEP sheets, and clinical reports with automatic fallback to file download + pre-formatted `+964` WhatsApp links or clipboard copy.
- **Privacy-First `.ics` Calendar Export (`IcsExportModal.tsx`)**: Added RFC 5545 `.ics` export for single appointments or daily schedules with a strict privacy filter excluding diagnoses/chief complaints by default.
- **Tomorrow Schedule & Patient Visit Card Printing**: Added 1-page printable Tomorrow Schedule (`A4`) and compact `A6` bilingual Patient Visit & Package Balance Cards in `PrintDocumentModal.tsx`.
- **3-Point Photo Angle & Plumb-Line Posture Studio (`PhotoMeasurementStudioModal.tsx`)**: Added interactive 3-point goniometric angle calculation (`°`), plumb-line/posture grid overlay, and encrypted annotated image saving without mutating original clinical photos.

### Phase F — Settings UX, Onboarding, Demo Mode & Open-Source Community (`settingsOnboardingPhaseF.ts`)
- **Searchable Settings & Simple/Advanced Switch**: Added instant bilingual/Kurdish Settings search and a Simple (`6` essential cards) vs. Advanced (`10` cards) view toggle.
- **Dismissible 4-Step Clinic Onboarding Checklist & Teaching Empty States**: Added `OnboardingChecklistCard.tsx` tracking profile setup, first patient, first `.ptbackup`, and 32-char recovery key verification, plus actionable zero-state guides across core views.
- **In-App "What's New" & Dexie `v1`–`v11` Migration Viewer**: Added `WhatsNewChangelogModal.tsx` surfacing release notes and schema migration guarantees offline inside the app.
- **CC0 Iraqi Synthetic Dataset & Public Demo Mode (`?demo=1`)**: Added 1-click seeding/purging of 8 realistic fictional Iraqi PT cases (`syntheticPatients.ts`) and `PublicDemoBanner.tsx` for read-only/demo deployments (`?demo=1` or `VITE_PUBLIC_DEMO=true`).
- **Open-Source Community Templates & Content-Pack Convention**: Added bilingual documentation portal (`docs/INDEX.md`), Community Content Pack specification (`docs/CONTENT_PACK_CONVENTION.md`, validated by `validateCommunityContentPackMetadata()`), and GitHub issue/PR templates (`.github/ISSUE_TEMPLATE/*`, `.github/pull_request_template.md`).

### Clinic Owner Enhancements & Fixes (Included in `1.1.0`)
- **Appointments Concurrent Overbooking**: Enabled scheduling multiple patients in the same time slot (for the same therapist or across different therapists) without hard-blocking submission; slot conflicts now surface only as non-blocking informational badges (`clinicOperationsService.ts`, `AppointmentScheduleView.tsx`).
- **Complete Kurdish Sorani (`ckb`) Localization**: Added Sorani phrase dictionary (`src/i18n/ckbDictionary.ts`), 3-way language switcher (`عربي` / `کوردی` / `EN`) across Navbar, Lock Screen, Sidebar, Settings, and Reception Kiosk, Sorani Gregorian dates/weekdays/time periods (`پ.ن`/`د.ن`), and strict Arabic fallback (`resolveBiText`).
- **Display & Custom Font Customization**: Added a dedicated Display & Fonts Settings tab (`src/components/settings/AppearanceDisplaySettings.tsx`, `src/utils/appearancePrefs.ts`) with built-in offline fonts, curated device fonts + Chromium `queryLocalFonts()`, local `.woff2`/`.woff`/`.ttf`/`.otf` (`<= 5 MB`) upload stored in isolated non-PHI `PhysioRecordUiPrefsDB` and loaded CSP-safely via `FontFace(ArrayBuffer)`, font scale (`87.5%–150%`), Arabic/Kurdish boost, line height, LTR-only letter spacing, font weight, density presets, content width, corner radius, high contrast, `44px+` touch targets, reduced transparency/motion, and one-click Reset.
- **Body Chart Custom Pain Type & Color**: Added optional manual free-text pain type with suggestions and optional hex color customization per marker pin (`BodyChartMarker.painTypeCustom`, `colorHex`) with shape+color accessible legends (`PatientBodyChart.tsx`, `BodyChartWidget.tsx`).
- **Orthopedic Special Tests Add Button & Inline Form**: Fixed unclickable `+ إضافة` trigger by keeping `+ إضافة` interactive with expandable inline Region / Target Structure / Outcome / Side fields and explicit inline validation (`SpecialTestsWidget.tsx`).
- **Clinical Documents, MRI/X-Ray Reports & Multi-Report Queue**: Replaced the silent report form in `MasterPatientChart.tsx` with `PatientImagingReportsPanel.tsx` supporting explicit inline validation, immediate encrypted save via `savePatient`, `+` multi-report drafting queue, manual `"أخرى"` document type entry with suggestions, and optional encrypted binary file attachments (`v9`); also updated `PatientAttachmentsPanel.tsx` to show a one-click local enablement card when disabled.
- **Read-Only Patient Quick-View Popup**: Clicking a patient in `PatientDirectory.tsx` now opens `PatientQuickViewModal.tsx` with on-demand decrypted demographics, red flags, medical history, episodes, NPRS trajectory, latest SOAP summary, imaging documents, appointments, RBAC-gated financial totals, Copy Plain Text, Print Dossier, and bottom `"فتح الملف السريري"` / `"إغلاق"` actions.

## [1.0.0] - 2026-11-13

First complete local-first clinical physical therapy EHR release (**Phases 0–7**).

### Security, Cryptography & Storage (Phase 1 & Phase 7)
- Implemented zero-server local vault in [`src/crypto/vault.ts`](src/crypto/vault.ts) using WebCrypto `AES-256-GCM`, `PBKDF2-HMAC-SHA256` (`>= 600,000` iterations in Web Worker via `cryptoWorkerClient.ts`), `HKDF-SHA256` per-record subkeys (`v2`), atomic GCM invocation block reservation, automatic 70% threshold DEK rotation, Emergency Recovery Key (32-char Base32), optional WebAuthn PRF passkey unlock (`src/crypto/webauthnPrf.ts`), Admin PIN PBKDF2 hashing with backoff, and SHA-256 hash-chained audit logs.
- Implemented encrypted `.ptbackup` **V3.0** (`CompressionStream('gzip')` + 256 KB authenticated AES-GCM chunks) supporting backward-compatible `V1.1` / `V2.0` import, `replace` & finalized-record-protecting `merge` restore modes, and `PhysioRecordEmergencyRecoveryDB` pre-restore safety snapshots.
- Appended Dexie schema safely from **v1 to v9** across 27 object stores (23 portable encrypted clinical/operations stores + 4 device-local technical stores) with idempotent `localStorage` -> Dexie migration leaving zero PHI in `localStorage`.

### Licensing, Zero External Network & PWA (Phase 0 & Phase 6)
- Enforced `GPL-3.0-or-later` compliance (honoring `Niema-Lab/PhysioMeter` attribution in `src/crypto/vault.ts`), dependency SPDX verification (`npm run check:licenses` + `THIRD_PARTY_NOTICES.md` + CycloneDX `sbom.cdx.json`), and SVG/asset/clinical content manifest (`npm run check:content` + `CONTENT_LICENSES.md`).
- Eliminated all external CDNs and telemetry: self-hosted fonts (`@fontsource/inter`, `@fontsource/ibm-plex-sans-arabic`, `@fontsource/jetbrains-mono`), in-repo offline PWA service worker & manifest plugin (`scripts/vite-pwa-plugin.mjs`), and strict `Content-Security-Policy` headers.

### Clinical Workflows & Iraqi Clinic Customizations (Phases 2–6)
- **Solo Mode & <60s Visit Loop**: First-run clinic mode wizard, Today command view, 10s Walk-In registration, unified Quick SOAP + Exercise Flowsheet with Copy-Forward & 8s Finish Undo toast.
- **Clinical Documentation**: Bilingual Arabic (RTL primary) & English UI; Gregorian dates with Latin numerals (`0-9`), dynamic DOB age calculation, longitudinal AROM/PROM/AAROM & free-text/smart MMT tracking, orthopedic special tests across 9 regions, table-first ASIA/ISNCSCI dermatome sensory matrix, score-entry outcome scales (`ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS`) + functional procedures (`NPRS`, `PSFS`, `TUG`, `30s-CST`, `5xSTS`) + Custom Measure/Widget Builder, neutral regional red-flag screening checklists, immutable Finalized SOAP SHA-256 seals, and append-only Clinical Addenda.
- **Iraqi Clinic Finance & Operations**: Blank financial defaults, IQD formatting (`25,000 د.ع` symbol after number), `ISO 4217` multi-currency selector (`src/utils/currencies.ts`), gap-free `INV/RCPT/CN/Z` sequences with Credit Note voiding, Iraqi payment methods (`Cash`, `ZainCash`, `QiCard`, `Other`), weekly recurring scheduler with manual duration entry, and encrypted WhatsApp templates (`+964` links).
- **International Optional Modules (Off by Default)**: Informed Consents (`v8`), HL7 FHIR R4 Bundle & UTF-8 BOM CSV export/import, Encrypted Patient Attachments (`v9`), Arabic/Kurdish normalization + MiniSearch, local-only Web Speech API dictation, CC0 note snippet packs, local Clinic Analytics dashboard, externalized `ar`/`en`/`ckb` localization foundation, and PIN-locked Reception Kiosk.
- **Accessibility & UI Polish (Phases 6 & 7)**: Replaced Preline dependencies cleanly with `react-aria-components` primitives, fixed mobile RTL queue density, dark/light theme contrast, modal/header typography (`>= 12px`), automated `axe-core` WCAG 2.1 AA checks, RTL visual layout contracts, GitHub Actions CI + Dependabot + `npm audit` gating.

### Release Tagging Note
To tag this release once initialized in a Git repository:
```bash
git tag -a v1.0.0 -m "PhysioRecord v1.0.0 — Phases 0-7 verified release"
```
