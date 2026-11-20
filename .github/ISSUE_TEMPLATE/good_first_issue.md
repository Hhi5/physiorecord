---
name: "مهمة للمساهمين الجدد / Good First Issue"
about: "مهمة واضحة ومحددة النطاق للمساهمين الجدد في المجتمع المفتوح المصدر / Scoped starter task for new open-source contributors"
title: "[Good First Issue]: "
labels: ["good first issue", "help wanted"]
assignees: []
---

## 1. هدف المهمة / Task Objective
<!-- وصف واضح ومباشر للمطلوب بالعربية والإنجليزية / Clear bilingual summary of what needs to be built, fixed, or translated -->

## 2. الملفات ذات الصلة / Target Files
- `src/...`
- `docs/...`

## 3. إرشادات الثوابت المحلية والخصوصية / Offline, Privacy & Clinical Invariants
قبل البدء، يرجى مراجعة [`AGENTS.md`](../../AGENTS.md) و[`docs/INDEX.md`](../../docs/INDEX.md):
1. **صفر اتصالات خارجية (Zero Runtime Network Requests):** يُمنع استدعاء أي CDN خارجي أو خطوط سحابية أو خدمات تتبع.
2. **الاتجاه ثنائي اللغة (`RTL` / `LTR`) والأرقام اللاتينية (`0-9`):** استخدم خصائص Tailwind المنطقية (`ms-*`, `me-*`, `ps-*`, `pe-*`) والمكونات المساعدة (`<Num />`, `<Fraction />`, `<Money />`) مع حجم خط لا يقل عن `12px` (`text-xs`).
3. **حزم المحتوى والترخيص (`Content & SPDX License Gate`):** أي قوالب سريرية أو ملفات `SVG` يجب أن تلتزم بمعيار [`docs/CONTENT_PACK_CONVENTION.md`](../../docs/CONTENT_PACK_CONVENTION.md) وتُسجّل في [`docs/legal/CONTENT_LICENSES.md`](../../docs/legal/CONTENT_LICENSES.md).
4. **عدم تعديل مخططات Dexie السابقة (`v1`–`v10` Immutable):** لا تقم بتعديل إصدارات `src/db/db.ts` التاريخية.

## 4. معايير القبول وأوامر التحقق / Acceptance Criteria & Verification Commands
شغّل الأوامر التالية محلياً للتأكد من نجاح جميع الفحوصات قبل فتح طلب الدمج (`Pull Request`):

```bash
npm run check:licenses
npm run check:content
npm run lint
npm test
npm run build
npm run check:perf
```
