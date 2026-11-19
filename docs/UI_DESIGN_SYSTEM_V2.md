# نظام التصميم الحديث — PhysioRecord Design System v2

> **بالعربية:** هذا الملف يوثّق إعادة تصميم واجهة سطح المكتب والجوال (Modern App Shell) مع طبقة تصميم موحّدة (`pr-*`) وقواعد واضحة. استخدمه كمرجع إلزامي عند طلب أي تعديل من أي أداة ذكاء اصطناعي حتى لا تعود النتيجة للتصميم القديم.
>
> **English:** This document records the desktop + mobile redesign ("Modern App Shell") with a unified `pr-*` design layer and hard rules. Use it as the mandatory reference whenever you ask any AI tool for UI changes, so results stop reverting to the old look.

---

## 1. الفكرة (Why it looks different now)

| المشكلة السابقة | الحل في v2 |
| --- | --- |
| خلفية رمادية مسطحة وبطاقات بإطار ثقيل | Canvas متدرّج هادئ + بطاقة بيضاء بحدّ شعري وظل ناعم متعدد الطبقات |
| زوايا 8px و12px فقط، وأزرار تبدو مسطّحة | مقياس زوايا 10 / 12 / 14 / 16 / 24px + ظلال مخصّصة + زر أساسي متدرّج |
| شريط علوي مزدحم بأيقونات صغيرة (44px) | شريط علوي 64px زجاجي: مسار تنقّل + عنوان واضح + بحث كبسولة + زر أساسي + حساب |
| قائمة جانبية بلا تسلسل بصري | مجموعات تنقّل بعناوين صغيرة، حالة نشطة كبسولة + شريط لوني، حالة مطويّة 76px |
| شريط جوال 56px بأيقونات باهتة | شريط 5 تبويبات كبسولة نشطة + زوايا علوية + احترام `safe-area` + شريط سفلي شبه معتم |
| نوافذ منبثقة تقفز في منتصف الشاشة على الجوال | Bottom Sheet بحافة سحب وزوايا 24px على الجوال، وتبقى Modal على سطح المكتب |
| أنماط وألوان متفرقة لكل شاشة | مكوّنات موحّدة: `pr-page-header`, `pr-kpi`, `pr-seg`, `pr-surface`, `pr-btn` ... |

---

## 2. المبادئ الخمسة (Five principles)

1. **سطح واحد واضح (One canvas):** الخلفية متدرّجة، كل المحتوى داخل بطاقات بيضاء. لا تضع بطاقة داخل بطاقة داخل بطاقة.
2. **تسلسل بصري (Hierarchy):** Eyebrow صغير بلون العلامة → عنوان كبير (800) → سطر شرح رمادي واحد. لا يزيد عنوان الصفحة عن سطرين.
3. **لون واحد للتمييز (One accent):** اللون الأساسي للعلامة فقط (أزرار، أيقونات KPI، حالة التنقّل). الأخضر/العنبري/الأحمر دلالية فقط (مدفوع / متبقٍ / خطأ).
4. **لمسة إنسانية خفيفة (Soft motion):** ظل يزيد 1px عند المرور، وحركة 150–200ms. لا حركات مبالغ فيها، وتُلغى مع `prefers-reduced-motion`.
5. **عربي أولاً (RTL-first):** استخدم دائماً خصائص منطقية `ps/pe/ms/me/start/end`، ولا تستخدم `left/right` إلا لعناصر LTR صريحة (أرقام، هواتف، مفاتيح).

---

## 3. الرموز التصميمية (Token layer)

كل الرموز موجودة في نهاية [`src/index.css`](../src/index.css) داخل الكتلة `Modern App Shell (Design System v2)`.

| الرمز | القيمة الافتراضية | الاستخدام |
| --- | --- | --- |
| `--pr-shadow-1` | ظل ناعم مزدوج 4% | بطاقات وبطاقات KPI |
| `--pr-shadow-2` | ظل متوسط | عناصر مرتفعة / hover |
| `--pr-shadow-3` | ظل عالٍ | Bottom Sheet / Popover |
| `--pr-shadow-primary` | ظل أخضر ملوّن | الزر الأساسي فقط |
| `--pr-hairline` | `border` بشفافية 62% | حدود البطاقات |
| `--pr-glass` / `--pr-glass-strong` | خلفية بشفافية 78% / 92% | الشريط العلوي، القائمة، شريط الجوال |
| `--pr-accent-soft` | `primary-500` بنسبة 12% | حالة التنقّل النشطة، الرقائق |
| `--pr-radius-control` | 10px (قابل للتغيير من الإعدادات) | أزرار، حقول |
| `--pr-radius-card` | 16px | بطاقات |
| `--pr-radius-hero` | 16–20px | رأس الصفحة والـ hero |

**مقياس الزوايا (Tailwind):** `rounded-sm`=10px · `rounded-md`=10px · `rounded-lg`=12px · `rounded-xl`=14px · `rounded-2xl`=16px · `rounded-3xl`=24px. يتغيّر تلقائياً مع تفضيل المستخدم (حاد / قياسي / دائري) عبر `src/utils/appearancePrefs.ts`.

**الطبقات (Layering):** الطبقة كلها داخل `@layer components` — لذلك أدوات Tailwind (`hidden`, `md:hidden`, `p-4`, `bg-*`) تتغلّب عليها. لا تُخرج قواعد `pr-*` خارج الطبقة، وإلا كسرت استجابة الجوال.

---

## 4. المكوّنات (Component classes)

```tsx
// بطاقة عادية
<div className="pr-surface p-4">...</div>

// بطاقة قابلة للنقر
<div className="pr-surface pr-surface-interactive p-4">...</div>

// رأس صفحة موحّد (سطح مكتب + جوال)
<div className="pr-page-header">
  <div className="space-y-1 min-w-0">
    <span className="pr-eyebrow"><Wallet className="size-3.5" /> الإدارة المالية</span>
    <h1 className="pr-page-title">السجل المالي</h1>
    <p className="pr-page-subtitle">الفواتير، الكورسات، الديون والتحصيل.</p>
  </div>
  <div className="flex flex-wrap items-center gap-2">{/* إجراءات */}</div>
</div>

// مؤشر رقم
<div className="pr-kpi">
  <div className="min-w-0">
    <span className="pr-kpi-label">المقبوضات الفعلية</span>
    <p className="pr-kpi-value">180,000 د.ع</p>
  </div>
  <span className="pr-icon-chip"><CheckCircle2 className="size-5" /></span>
</div>

// أزرار
<button className="pr-btn pr-btn-primary">إصدار فاتورة</button>
<button className="pr-btn pr-btn-ghost">تسجيل مصروف</button>
<button className="pr-icon-btn" aria-label="بحث"><Search className="size-4" /></button>

// تبويبات / مرشّحات (Segmented)
<div className="pr-seg">
  <button className="pr-seg-item" data-active={active}>اليوم</button>
</div>

// رقاقة
<span className="pr-chip">5 ملف نشط</span>

// حقل وبحث
<input className="pr-field" />
<button className="pr-search">…</button>
```

| الصنف | الاستخدام |
| --- | --- |
| `.pr-surface` / `.pr-surface-2` / `.pr-surface-flat` | بطاقة بيضاء بحدّ شعري وظل (1 / 2 / بلا ظل) |
| `.pr-surface-interactive` | رفع 1px + ظل أقوى عند hover |
| `.pr-page-header` | رأس صفحة بشريط لوني على حافة البداية |
| `.pr-hero` | بطاقة إجراء أساسية بخلفية متدرّجة |
| `.pr-kpi`, `.pr-kpi-label`, `.pr-kpi-value` | بلاطة مؤشر + رقم كبير `tabular-nums` |
| `.pr-icon-chip` | مربّع أيقونة 40px بخلفية علامة ناعمة |
| `.pr-btn-primary/soft/ghost`, `.pr-icon-btn` | أزرار بأحجام لمس ≥40px |
| `.pr-chip`, `.pr-seg`, `.pr-seg-item` | رقائق وتبويبات كبسولة |
| `.pr-seg-wrap` | نسخة تُلتفّ تلقائياً؛ على الجوال ≤439px تصبح شبكة 2×2 أنيقة |
| `.pr-field`, `.pr-search` | حقول وحقل بحث كبسولة |
| `.pr-topbar`, `.pr-sidebar`, `.pr-brand-mark`, `.pr-nav-label`, `.pr-nav-item` | هيكل سطح المكتب |
| `.pr-tabbar`, `.pr-tab`, `.pr-tab-icon` | شريط الجوال السفلي |
| `.pr-sheet-panel`, `.pr-sheet-handle` | نافذة سفلية على الجوال (تُستخدم تلقائياً عبر `ModalDialog`) |
| `.pr-avatar` | دائرة الأحرف الأولى بتدرّج علامة |
| `.pr-row`, `.pr-divider`, `.pr-glass`, `.pr-gradient-text`, `.pr-grid-auto` | مساعدات تخطيط |

---

## 5. التشريح البنيوي (Layout anatomy)

### سطح المكتب (`≥ 768px`)
- **القائمة الجانبية:** 248–264px (تُطوى إلى 76px تلقائياً تحت 1100px أو داخل ملف المريض)، آخرها `Settings` + شارة "مشفَّر على هذا الجهاز فقط".
- **الشريط العلوي:** 64px زجاجي، `pr-topbar`:
  - البداية: مسار `مساحة العمل ‹ القسم` (12px) + عنوان الصفحة (18px/800).
  - الوسط: `pr-search` بعرض أقصى 448px + اختصار `Ctrl K`.
  - النهاية: ستار الخصوصية (أيقونة) + `مريض جديد` (زر متدرّج) + دائرة الحساب.
- **المحتوى:** كل صفحة داخل `max-w-[85rem] mx-auto px-4 sm:px-6 lg:px-8 py-6`.
- **حشوة سفلية:** لا توجد (لا شريط جوال).

### الجوال (`< 768px`)
- **الشريط العلوي:** 64px: شعار 36px + عنوان الصفحة + (بحث، مريض جديد، حساب). ستار الخصوصية داخل ورقة "المزيد".
- **الشريط السفلي:** 5 تبويبات ارتفاع ≥56px + `env(safe-area-inset-bottom)`، التبويب النشط كبسولة `pr-accent-soft`.
- **المحتوى:** `padding-bottom: 5.4rem` على `<main>` حتى لا يختفي تحت الشريط.
- **النوافذ:** Bottom Sheet (`max-h: 92dvh`, زوايا 24px أعلى فقط, مقبض سحب)؛ تعود Modal عادية عند `≥ 640px`.
- **شرائط التبويبات:** على الشاشات ≤439px يظهر نص التبويب النشط فقط والباقي أيقونات (شريط بصف واحد بلا تمرير)، ومرشّحات اليوم تتحول إلى شبكة 2×2 عبر `pr-seg-wrap`.

---

## 6. قواعد صارمة (Do / Don't)

**افعل:**
- استخدم `pr-page-header` مرة واحدة أعلى كل شاشة رئيسية.
- اجعل لكل شاشة **إجراء أساسي واحد** فقط (`pr-btn-primary`)، والباقي `ghost`.
- استخدم `pr-kpi` للأرقام المهمة، وأضف `.pr-kpi-value` ليأخذ `tabular-nums`.
- استخدم `ps-*` / `pe-*` / `text-start` فقط.
- حافظ على `data-testid` و`aria-label` الحالية (اختبارات E2E وAxe تعتمد عليها).
- افحص دائماً على 320px و390px و1440px، وفي الوضعين الفاتح والداكن.

**لا تفعل:**
- لا تُضف مكتبات UI أو أيقونات أو خطوط خارجية (يُمنع أي طلب HTTP خارجي — انظر `e2e/offline-same-origin.spec.ts`).
- لا تستخدم `rounded-[Npx]` عشوائية: استخدم مقياس الزوايا أعلاه.
- لا تستخدم ظلاً ثقيلاً (`shadow-2xl`) للبطاقات العادية.
- لا تُغيّر سلوك العملة (`25,000 د.ع` بعد الرقم)، أنواع الفواتير، طرق الدفع، أو تخصيصات مالك العيادة المذكورة في `AGENTS.md`.
- لا تُصغّر النص تحت 12px، ولا تضع `letter-spacing` على العربية (مفروض `0` عالمياً).
- لا تُخرج قواعد CSS جديدة خارج `@layer components` إن كانت تحدد `display/padding/background` لمكوّنات تُستخدم مع أدوات Tailwind.

---

## 7. قالب الطلب من أدوات الذكاء الاصطناعي (Prompt template)

> المشكلة الشائعة: الطلب العام مثل «حدّث التصميم ليكون عصرياً» يُنتج نفس النتيجة القديمة. استخدم القالب التالي **مع الكود المرفق** أو مسار الملفات.

### نسخة عربية جاهزة للنسخ

```text
أنت مهندس واجهات أول في مشروع PhysioRecord (React 19 + TypeScript + Tailwind v4 + RTL عربي أولاً).
المطلوب: تحديث الشاشة [اسم الشاشة/الملف] فقط، دون تغيير أي منطق بيانات أو `data-testid` أو `aria-label`.

التزم حرفياً بنظام التصميم v2 الموجود في docs/UI_DESIGN_SYSTEM_V2.md وبالأصناف الموجودة في src/index.css:
- رأس الصفحة: `pr-page-header` + `pr-eyebrow` + `pr-page-title` + `pr-page-subtitle`، وإجراء أساسي واحد فقط.
- البطاقات: `pr-surface` (+ `pr-surface-interactive` إن كانت قابلة للنقر)، زوايا 16px، حدّ `--pr-hairline`، ظل `--pr-shadow-1`.
- الأرقام: `pr-kpi` + `pr-kpi-label` + `pr-kpi-value`.
- التبويبات: `pr-seg` + `pr-seg-item` مع `data-active`.
- الأزرار: `pr-btn pr-btn-primary` مرة واحدة، والباقي `pr-btn-ghost`، وأزرار الأيقونات `pr-icon-btn` بحجم ≥40px.
- الجوال: الشريط السفلي `pr-tabbar`، والنوافذ Bottom Sheet عبر `ModalDialog`، ولا تعِد بناء أي هيكل تنقّل.
- استخدم خصائص RTL المنطقية فقط (ps/pe/ms/me/start/end)، ولا تستخدم left/right.
- لا تضف أي مكتبة أو خط أو أيقونة خارجية، ولا تلمس منطق العملة أو الفواتير أو التشفير.
- تحقّق: `npx tsc --noEmit` ينجح، لا يوجد تمرير أفقي على 320px، لا يوجد نص أقل من 12px، ويعمل في الوضع الداكن.

أعطني diff مختصراً (الملفات المتغيرة فقط) + سبب كل تغيير بصري في سطر واحد.
```

### English version

```text
You are a senior UI engineer on PhysioRecord (React 19 + TypeScript + Tailwind v4, Arabic RTL-first).
Redesign ONLY [screen / file]. Do not change data logic, `data-testid`, or `aria-label`.

Follow the v2 design system in docs/UI_DESIGN_SYSTEM_V2.md and the classes in src/index.css:
- Page header: `pr-page-header` + `pr-eyebrow` + `pr-page-title` + `pr-page-subtitle`, with exactly ONE primary action.
- Cards: `pr-surface` (+ `pr-surface-interactive` when clickable), 16px radius, `--pr-hairline` border, `--pr-shadow-1`.
- Numbers: `pr-kpi` + `pr-kpi-label` + `pr-kpi-value`.
- Tabs/filters: `pr-seg` + `pr-seg-item` with `data-active`.
- Buttons: one `pr-btn pr-btn-primary`, others `pr-btn-ghost`; icon buttons `pr-icon-btn` ≥40px.
- Mobile: keep `pr-tabbar`; modals remain bottom sheets through `ModalDialog`.
- RTL: logical properties only (ps/pe/ms/me/start/end), never left/right.
- No new UI/animation/icon/font libraries, no external requests; never touch currency formatting, invoice types, payment methods, or crypto code.
- Verify: `npx tsc --noEmit` passes, no horizontal scroll at 320px, no text below 12px, dark mode intact.

Return a minimal diff (changed files only) and a one-line rationale per visual change.
```

---

## 8. التحقق (Verification)

```bash
npx tsc --noEmit          # الأنواع
npm test                  # 164 اختبار وحدة
npm run build             # الحزمة
npm run check:licenses    # التراخيص
npm run check:content     # أصول المحتوى
```

تم فحص الشاشات التالية بـ `axe-core` (WCAG 2.0/2.1 A+AA) بعد إعادة التصميم وكانت النتيجة **0 مخالفات**:
`اليوم`، `المرضى`، `الحسابات` — على 1440×900 و390×844، في الوضع الفاتح والداكن، وداخل النافذة السفلية.

---

## 9. لقطات مرجعية (Reference screenshots)

| الشاشة | الملف |
| --- | --- |
| اليوم — سطح المكتب (عربي RTL) | [`docs/ui-redesign/desktop-today-ar.png`](ui-redesign/desktop-today-ar.png) |
| اليوم — سطح المكتب (داكن) | [`docs/ui-redesign/desktop-today-dark-ar.png`](ui-redesign/desktop-today-dark-ar.png) |
| الحسابات — سطح المكتب (إنجليزي LTR) | [`docs/ui-redesign/desktop-finance-en.png`](ui-redesign/desktop-finance-en.png) |
| اليوم — جوال | [`docs/ui-redesign/mobile-today-ar.png`](ui-redesign/mobile-today-ar.png) |
| اليوم — جوال 320px (شبكة المرشّحات) | موثّق في `pr-seg-wrap` أدناه |
| المرضى — جوال | [`docs/ui-redesign/mobile-patients-ar.png`](ui-redesign/mobile-patients-ar.png) |
| نافذة سفلية — جوال | [`docs/ui-redesign/mobile-bottom-sheet-ar.png`](ui-redesign/mobile-bottom-sheet-ar.png) |

---

## 10. أين أعدّل الألوان؟

- الهوية اللونية لكل ثيم: `src/styles/themes/*.css` (تبقى كما هي — v2 لا يفرض ألواناً جديدة).
- السطح والظلال والزوايا: الكتلة الأخيرة في `src/index.css`.
- الزوايا القابلة للتخصيص من المستخدم: `getDisplayCssVariables()` في `src/utils/appearancePrefs.ts`.
- لا تعدّل `src/crypto/*` أو تنسيقات العملة العراقية عند تغيير الشكل.

---

## 11. Minimalist Swiss Clinical Refinement & Adaptive Primitives (v2.1)

تحديث معماري وتصميمي لتوحيد الأسطح، تقليل الضجيج البصري، وتحسين التكيف الكامل من `320px` حتى `1600px+`:

- **تبسيط التدرجات والزخارف (`src/index.css`)**:
  - إزالة الخلفيات الثابتة متعددة البقع (`background-attachment: fixed`) واستبدالها بغسيل خطي خفيف عالي الأداء.
  - توحيد `.pr-page-header`، `.pr-hero`، `.pr-icon-chip`، `.pr-btn-primary`، `.pr-brand-mark`، و`.pr-avatar` باستخدام متغيرات `--primary` الدلالية بدون أشرطة تزيينية إضافية، مع احترام `@media (prefers-reduced-motion: reduce)`.
- **حاويات وتخطيطات مرنة (`src/index.css`)**:
  - `.pr-container`: حاوية متجاوبة بحشوة سائلة (`clamp(0.75rem, 2.5vw, 1.5rem)`).
  - `.pr-toolbar`: شريط أدوات قابل للالتفاف الطبيعي بين السطر والسطر.
  - `.pr-kpi-grid` و`.pr-card-grid`: شبكات CSS Grid تلقائية باستخدام `minmax(...)` بدل الأعمدة الصلبة.
  - `.pr-main-safe`: مسافة أمان سفلية تلقائية لمواءمة شريط الجوال السفلي (`safe-area-inset-bottom`).
  - `.pr-responsive-table`: تحوّل تلقائي لجداول البيانات إلى بطاقات مفاتيح/قيم متراصة (`max-width: 1023.98px`) لحماية الهواتف والأجهزة اللوحية ذات الشريط الجانبي المفتوح من التجاوز الأفقي.
- **إزالة الفجوات الدلالية والألوان الصلبة**:
  - استبدال تدرجات `teal-*` الثابتة بمتغيرات `primary` لضمان التناغم التام بين الثيمات الأربعة (`clinical-default`، `ocean-blue`، `royal-indigo`، `emerald-care`) والوضعين النهاري والليلي.
  - ترقية النوافذ اليدوية (`ActivityLogView`، `IraqiFinancialLedgerView`، `InstallmentPlansAgingPanel`) إلى `ModalDialog` و`DrawerDialog` المعزولتين عبر React Aria Components، وإضافة `AccessibleTabPanel` في `FunctionalScalesWidget` وتسميات `aria-label` لأزرار الأيقونات لضمان توافق WCAG 2.1 AA.
