# AGENTS.md — PhysioRecord Engineering & Clinical Brief

This document defines the architectural invariants, licensing boundaries, owner customizations, and verification rules for contributors (human or AI) working on **PhysioRecord**.

## 1. Tech Stack & Local-First Invariants

- **Stack**: React 19, TypeScript, Vite, Tailwind CSS v4, React Aria Components (`Apache-2.0`), Dexie (IndexedDB), Lucide Icons (`ISC`), self-hosted `@fontsource/*` (`OFL-1.1`).
- **Offline / No Telemetry**: Zero runtime external HTTP/CDN/telemetry requests. Enforced via `npm run test:e2e` (`e2e/offline-same-origin.spec.ts`).
- **Encryption at Rest**: Clinical data lives encrypted inside IndexedDB (`src/crypto/vault.ts`, `src/db/db.ts`) using non-extractable WebCrypto `AES-GCM` keys wrapped via `PBKDF2-SHA256` / `HKDF-SHA256`.
- **Clinical Immutability**: Finalized SOAP records MUST remain immutable; corrections occur strictly via append-only clinical addenda (`clinicalAddenda`).
- **Dexie Schema Append-Only Rule**: Never mutate historical schema definitions (`v1`–`v9` in `src/db/db.ts`). Any new tables/indexes require appending a higher version (`v10`, `v11`, ...). See [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).
- **Single-Writer Rule**: Persist/mutate encrypted records through centralized services (`sessionService`, `soapService`, `episodeService`, `clinicOperationsService`) rather than ad-hoc state writes.
- **Bilingual Arabic RTL First**: Arabic RTL is the primary clinical UI with matching English parity; minimum text size is `12px` (`text-xs` or larger); reuse primitives (`Num`, `Fraction`, `Money`, `DatePickerInput`, `AccessibleTabs`, `ModalDialog`) and route translatable strings through `LanguageContext`.

## 2. Preserved Clinic Owner Customizations (Do Not Revert)

Contributors MUST preserve these workflows built specifically for solo physical therapy clinics in Iraq:

1. **Currency Formatting & Global Selector**: Currency symbol renders **AFTER** the number (`25,000 د.ع`); ISO 4217 currency selector in Settings defaulting to IQD (`src/utils/currencies.ts`).
2. **Blank Financial Defaults**: Invoice creation forms start with blank/zeroed amounts, prices, and discounts (never prefilled prices).
3. **Invoice Types**: Support `جلسة مفردة`, `كورس`, and `فحص`.
4. **Iraqi Payment Methods**: Support cash (`نقداً`), `ZainCash`, `QiCard`, and manual `أخرى` (other with free-text detail field) — do not re-add removed bank transfer options.
5. **Appointments & Scheduling**: Weekly recurring weekday scheduler (`Sunday`/`Tuesday`/`Thursday`, etc.), modern interactive clock/time selector, and **manual session duration entry**.
6. **Security Lock Timing**: Auto-lock inactivity selector supports manual selection plus `"Never"` (`0`).
7. **Exercise Library Visibility**: Built-in HEP library hidden from navigation by default (toggleable in Settings; keep data intact).
8. **Assessment Customizations**:
   - **MMT**: Free-text muscle/movement cards starting with one card + `+` button to append additional tests (autocomplete helpers allowed, free-text entry MUST remain).
   - **ROM**: No displayed normative `Normal: ...` reference ranges (`romMmtCatalog.ts` omits `normalRangeDegrees`).
   - **Special Tests**: Concise provocative test names + target anatomical structures across all 9 joint regions without verbose explanatory prose.
   - **Outcome Measures**: Score-entry calculators (`ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS`) without copyrighted questionnaire item text; open functional procedures (`NPRS`, `PSFS`, `TUG`, `30s-CST`, `5xSTS`) + Custom Measure Builder.
   - **Anatomical SVGs**: Preserve existing AI-generated SVGs (`AnatomicalBodySvgs.tsx`, `frontBodySvg.raw.svg`, `backBodySvg.raw.svg`, `OrganDermatomeMap.tsx`, `DermatomesMapTab.tsx`) intact and documented in `CONTENT_LICENSES.md`.

## 3. Open-Source License Policy

- **Project License (`LICENSE`)**: `GPL-3.0-or-later`, selected to honor the `GPL-3.0` attribution to `Niema-Lab/PhysioMeter` (`src/crypto/vault.ts` lines 4–6) without modifying audited vault cryptography or invalidating attribution integrity. Do not alter those attribution lines without explicit maintainer approval.
- **Allowed Dependencies**: `MIT`, `ISC`, `BSD-*`, `0BSD`, `Apache-2.0`, `OFL-1.1`, `CC0-1.0`, `CC-BY-*`, `Unlicense` (`MPL-2.0` allowed for dev/build tools only; zero exceptions; Preline UI "Fair Use" permanently excluded). Enforced by `npm run check:licenses`.
- **Content Registry**: Every SVG, binary asset, font package, and built-in clinical dataset MUST be indexed in `CONTENT_LICENSES.md` and pass `npm run check:content`.

## 4. Standard Verification Commands

```bash
npm audit --audit-level=high
npm run check:licenses
npm run check:content
npm run lint
npm test
npm run build
npm run sbom
npm run test:e2e
```
