# معيار حزم المحتوى السريري المجتمعي — Community Content Pack Convention (`docs/CONTENT_PACK_CONVENTION.md`)

يدعم **PhysioRecord** استيراد وتصدير حزم المحتوى السريري المفتوحة بصيغة `JSON` (قوالب ملاحظات `SOAP` السريعة `/slash`، قوالب الفحص الإقليمي بضغطة واحدة `Exam Presets`، وبرامج التمارين العلاجية) دون الحاجة لأي اتصال بالإنترنت أو تعديل في الكود المصدري.

**PhysioRecord** supports importing and exporting open-licensed `JSON` clinical content packs (SOAP `/slash` note snippets, 1-tap regional exam presets, and exercise packs) completely offline without code changes.

---

## 1. القواعد الإلزامية للترخيص وحقوق النشر (Mandatory Licensing & Copyright Rules)

1. **الرخص المسموحة فقط (`ALLOWED_CONTENT_PACK_LICENSES`)**:
   يجب أن تحمل كل حزمة محتوى مجتمعية معرّف رخصة `SPDX` صريحاً من القائمة المعتمدة في [`src/utils/settingsOnboardingPhaseF.ts`](../src/utils/settingsOnboardingPhaseF.ts):
   - `CC0-1.0` (موصى به — الملكية العامة / Public Domain Dedication)
   - `CC-BY-4.0`
   - `MIT`
   - `Apache-2.0`
   - `BSD-3-Clause`
2. **حظر القيود غير التجارية أو منع الاشتقاق (`No NC / ND / Proprietary`)**:
   يُرفض تلقائياً أي ملف يحتوي على رخص `CC-BY-NC`، `CC-BY-ND`، أو محتوى احتكاري (`Proprietary`).
3. **حظر نصوص الاستبيانات المحمية بحقوق النشر (Zero Copyrighted Questionnaire Items)**:
   يُمنع منعاً باتاً تضمين نصوص الأسئلة الحرفية للاستبيانات المحمية (مثل `ODI`, `NDI`, `QuickDASH`, `SPADI`, `LEFS`, `SF-36`). يُسمح فقط بصياغات التوثيق السريري الأصلية، الإجراءات السريرية القياسية المفتوحة (`NPRS`, `PSFS`, `TUG`, `30s-CST`, `5xSTS`)، أو الإشارة إلى النتيجة الرقمية (`Score-Entry`).
4. **إلزامية توثيق المصدر (`source` Provenance)**:
   يجب تعبئة حقل `source` في جذر الحزمة لتوضيح أصل المحتوى (مثلاً: `"Original clinical templates authored by Baghdad Rehab Group"` أو المرجع العلمي المفتوح).

---

## 2. مخطط حزمة قوالب الملاحظات السريرية (SOAP Note Snippet Pack JSON Schema)

يتم التحقق من حزم القوالب برمجياً عبر الدالتين:
- `validateCommunityContentPackMetadata(rawJson)` في [`src/utils/settingsOnboardingPhaseF.ts`](../src/utils/settingsOnboardingPhaseF.ts)
- `parseAndValidateContentPackJson(rawJson)` في [`src/data/noteTemplatesCc0.ts`](../src/data/noteTemplatesCc0.ts)

### الحقول الإلزامية في جذر الملف (Required Root Fields)

| الحقل (Field) | النوع (Type) | إلزامي؟ | الوصف (Description) |
| --- | --- | --- | --- |
| `packId` | `string` | نعم | معرّف فريد للحزمة بصيغة `kebab-case` (مثال: `"iraq-ortho-soap-pack"`). |
| `name` | `string` | نعم | اسم الحزمة المقروء للمستخدم بالعربية أو الإنجليزية. |
| `version` | `string` | نعم | رقم الإصدار وفق `SemVer` (مثال: `"1.0.0"`). |
| `author` | `string` | مستحسن | اسم المؤلف أو العيادة أو الفريق المساهم. |
| `source` | `string` | نعم | بيان مصدر المحتوى أو الإسناد العلمي (Provenance / Citation). |
| `license` | `string` | نعم | أحد المعرفات المعتمدة: `CC0-1.0` \| `CC-BY-4.0` \| `MIT` \| `Apache-2.0` \| `BSD-3-Clause`. |
| `snippets` | `Array<Snippet>` | نعم | مصفوفة القوالب السريرية (`1` إلى `200` قالب لكل حزمة). |

### حقول كل قالب داخل `snippets[]` (Snippet Item Fields)

| الحقل (Field) | النوع (Type) | إلزامي؟ | الوصف (Description) |
| --- | --- | --- | --- |
| `id` | `string` | اختياري | معرّف فرعي للقالب داخل الحزمة (يُولَّد تلقائياً كـ `pack-<packId>-<id>` عند الاستيراد). |
| `slashTrigger` | `string` | نعم | اختصار الاستدعاء السريع بدون `/` (مثال: `"acl-w2"` لاستدعائه عبر `/acl-w2`). |
| `category` | `string` | نعم | أحد الأقسام: `"subjective"` \| `"objective"` \| `"assessment"` \| `"plan"` \| `"general"`. |
| `titleAr` | `string` | نعم* | عنوان القالب باللغة العربية. |
| `titleEn` | `string` | نعم* | عنوان القالب باللغة الإنجليزية. |
| `bodyAr` | `string` | نعم* | نص القالب السريري باللغة العربية (واحد على الأقل من `bodyAr` أو `bodyEn` إلزامي، ويُفضّل كلاهما). |
| `bodyEn` | `string` | نعم* | نص القالب السريري باللغة الإنجليزية. |

### مثال كامل لحزمة قوالب صالحة (Valid Content Pack Example)

```json
{
  "packId": "baghdad-knee-rehab-cc0",
  "name": "حزمة تأهيل الركبة والرباط الصليبي — Knee & ACL Rehab Pack",
  "version": "1.0.0",
  "author": "PhysioRecord Iraq Community Contributors",
  "source": "Original clinical documentation templates authored under CC0-1.0",
  "license": "CC0-1.0",
  "snippets": [
    {
      "id": "acl-early-rom",
      "slashTrigger": "acl-rom",
      "category": "objective",
      "titleAr": "فحص بسط الركبة المبكر بعد عملية الرباط الصليبي",
      "titleEn": "Early Post-Op ACL Knee Extension Check",
      "bodyAr": "تم تحقيق البسط الكامل للركبة (0°) سلبياً وفعالاً مع انقباض متساوي الطول للعضلة الرباعية وتصريف جيد للتورم.",
      "bodyEn": "Achieved full terminal knee extension (0° AROM/PROM) with strong quadriceps set and minimal joint effusion."
    },
    {
      "id": "acl-hep-phase1",
      "slashTrigger": "acl-hep1",
      "category": "plan",
      "titleAr": "خطة التمارين المنزلية — المرحلة الأولى للرباط الصليبي",
      "titleEn": "ACL Phase 1 Home Exercise Plan",
      "bodyAr": "الاستمرار بتمارين تحريك الرضفة، شد العضلة الرباعية، ورفع الساق المستقيمة (3×12) مع تطبيق الثلج لمدة 15 دقيقة بعد التمرين.",
      "bodyEn": "Continue patellar mobilizations, quad sets, and multi-angle straight leg raises (3x12) with 15-min post-exercise cryotherapy."
    }
  ]
}
```

---

## 3. مخطط حزمة قوالب الفحص الإقليمي (Regional Exam Presets Pack — `CC0-1.0`)

بالإضافة إلى قوالب نصوص `SOAP`، يدعم النظام مشاركة قوالب الفحص الإقليمي (`ExamPresetPackFile` في [`src/data/clinicalToolkit/examPresetsCc0.ts`](../src/data/clinicalToolkit/examPresetsCc0.ts)) عبر `parseExamPresetPack()` و`serializeExamPresetPack()`:

- **`schema`**: يجب أن يساوي `"physiorecord-exam-presets-pack/v1"`.
- **`license`**: يجب أن يساوي `"CC0-1.0"`.
- **`presets`**: مصفوفة من تعريفات `RegionalExamPresetDefinition` تشمل `id`, `regionId`, `titleAr`, `titleCkb`, `titleEn`, `widgetsToEnable`, `romStarters`, `mmtStarters`, `specialTestIds`, `recommendedScaleId`, و`redFlagRegionId`.

---

## 4. خطوات التحقق والمساهمة في المستودع (Validation & Contribution Workflow)

1. تحقّق من صحة الحزمة برمجياً عبر `validateCommunityContentPackMetadata(jsonString)`:
   - يجب أن تُرجع `{ valid: true, errors: [] }`.
2. إذا تم تضمين الحزمة داخل المستودع الأساسي (`src/data/`):
   - أضف مسار الملف والترخيص والمؤلف في جدول [`CONTENT_LICENSES.md`](../CONTENT_LICENSES.md).
   - شغّل فحص المحتوى والاختبارات:
     ```bash
     npm run check:content
     npm test
     ```
