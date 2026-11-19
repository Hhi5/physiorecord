# PhysioRecord Internationalization (i18n) & Translation Guide

PhysioRecord uses an externalized JSON locale architecture backed by native browser `Intl` APIs so contributors can add RTL and LTR languages—such as **Kurdish Sorani (`ckb`)**—without modifying core application logic or introducing external network calls.

## 1. Locale Files Layout

Locale JSON files live in [`src/i18n/locales/`](../src/i18n/locales):

- `ar.json` — Arabic (Iraq, RTL primary)
- `en.json` — English (LTR)
- `ckb.json` — Kurdish Sorani (RTL, active Iraqi Kurdistan locale)

Keys absent from a partial translation file automatically fall back cleanly through `ar.json -> en.json -> key` in [`LanguageContext.tsx`](../src/context/LanguageContext.tsx).

Additionally, [`src/i18n/ckbDictionary.ts`](../src/i18n/ckbDictionary.ts) provides a built-in Sorani phrase dictionary (`CKB_DICTIONARY`) consumed by `bi(arText, enText, ckbText?)` so components using bilingual Arabic/English tuples resolve to Central Kurdish Sorani (`ckb`) when active (falling back to Arabic RTL, never English, if an exact phrase is unmapped). Date/time formatting in [`src/utils/date.ts`](../src/utils/date.ts) supports `IRAQI_MONTHS_CKB` and Sorani weekdays in `formatClinicalDate` and `formatWeekdaysSummary`.

## 2. Adding or Extending a Language

1. Copy `src/i18n/locales/en.json` or `ar.json` to `src/i18n/locales/<bcp47>.json` (for example, `ckb.json`).
2. Add the language code to `SupportedLanguage` and `LANGUAGE_METADATA` in `src/context/LanguageContext.tsx`.
3. Update `isRtlLanguage()` and `getIntlLocaleTag()` in [`src/utils/i18nFormat.ts`](../src/utils/i18nFormat.ts):
   - Always test `Intl.NumberFormat` and `Intl.DateTimeFormat` fallback paths in Chromium & Firefox.
   - Keep `u-ca-gregory` for standard Gregorian clinical dates and `u-nu-latn` where consistent clinical digits are expected.
4. Register any new clinical dataset or locale asset in [`CONTENT_LICENSES.md`](../CONTENT_LICENSES.md) and run `npm run check:content`.

## 3. RTL, Latin Numerals (`0-9`) & Iraqi Post-Number Currency Formatting Rules

- Set `<html dir="rtl" lang="ar">` or `<html dir="rtl" lang="ckb">` via `LanguageProvider` automatically (`<html dir="ltr" lang="en">` for English).
- Use Tailwind CSS logical directional utilities (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`) instead of physical `ml-*`/`mr-*`/`left-*`/`right-*`.
- **Latin Numerals (`0-9`) Across All Locales**: Clinical dates, ages, NPRS ratings, goniometer angles (`°`), MMT grades (`4+/5`), phone numbers (`+964`), and invoice totals MUST render with standard Latin digits (`0-9`) via `u-nu-latn` and `u-ca-gregory` (with optional secondary Hijri `islamic-umalqura` display when enabled in clinic settings).
- **Bidirectional (`<bdi dir="ltr">`) Isolation**: Always wrap numbers, phone numbers, MRNs, ROM/MMT fractions, currency amounts, and medical abbreviations (`ROM`, `MMT`, `NPRS`, `HEP`) in `<bdi dir="ltr">` (using `<Num />`, `<Fraction />`, `<Money />`, or `<ClinicalAbbr />` in [`src/components/ui/Primitives.tsx`](../src/components/ui/Primitives.tsx)) so RTL punctuation never mirrors `3/10` into `10/3`.
- **Post-Number Currency Formatting (`25,000 د.ع`)**: In accordance with Iraqi clinic financial conventions ([`src/utils/currencies.ts`](../src/utils/currencies.ts)), currency symbols always render **AFTER** the formatted number separated by a space (e.g., `25,000 د.ع` in Arabic/Kurdish RTL and `25,000 IQD` in English LTR). Never place `د.ع` before the amount.
- **Minimum Typography (`>= 12px`)**: Keep all body, table, button, and badge UI text at **`>= 12px` (`text-xs` or larger)** to preserve legibility of Arabic and Kurdish Sorani (`ckb`) characters and diacritics.

## 4. Verification Before Opening a Pull Request

```bash
npm run check:licenses
npm run check:content
npm run lint
npm test
npm run build
npm run check:perf
```
