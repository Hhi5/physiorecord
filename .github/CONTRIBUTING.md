# Contributing to PhysioRecord

Thank you for helping improve **PhysioRecord**, a local-first clinical physical therapy EHR built for Arabic (RTL) and English (LTR) clinicians.

## Non-Negotiable Ground Rules

1. **Open-Source License Gate (`npm run check:licenses` & `npm run check:content`)**:
   - Production dependencies MUST be licensed under `MIT`, `ISC`, `BSD-*`, `0BSD`, `Apache-2.0`, `OFL-1.1` (fonts), `CC0-1.0`, `CC-BY-*`, or `Unlicense`. (`MPL-2.0` is permitted for dev-only tools.)
   - **Strictly forbidden**: `-NC`, `-ND`, "Free for non-commercial", custom "Fair Use" licenses (including Preline UI), proprietary outcome questionnaire items/wording, paid "Pro" assets, or unverified scraped illustrations.
   - Any new SVG, image, font, or clinical catalog MUST be registered in [`docs/legal/CONTENT_LICENSES.md`](../docs/legal/CONTENT_LICENSES.md) with Source URL, Author, License, Review Date (`YYYY-MM-DD`), and Reviewer before CI will pass.
2. **Offline / Zero-Network Requirement (`npm run test:e2e`)**:
   - Zero CDN URLs, external font links, analytics, or runtime HTTP calls to third-party origins.
3. **Database & Security Invariants**:
   - Never modify existing Dexie schema versions (`v1`–`v10`); always append a new monotonic version (`v11`, ...).
   - Never break encrypted rest guarantees or bypass immutability on finalized clinical SOAP notes (amend via clinical addenda only).
4. **Localization & Accessibility**:
   - Arabic RTL first with matching English parity; minimum text size `12px`; all UI strings must support both languages.
   - Preserve clinic-specific Iraqi defaults listed in [`AGENTS.md`](../AGENTS.md).

## Verification Checklist Before Opening a PR

```bash
npm run check:licenses
npm run check:content
npm run lint
npm test
npm run build
npm run test:e2e
```
