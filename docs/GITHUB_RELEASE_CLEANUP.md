# دليل تنظيف مستودع GitHub والإعداد للنشر العام (GitHub Public Release & History Cleanup Guide)

هذا الدليل العملي يشرح **الطريقة الآمنة تماماً** لتنظيف مستودع **PhysioRecord** على GitHub (`https://github.com/Hhi5/physiorecord`) قبل النشر العام: حذف الإصدارات القديمة (Releases)، حذف الوسوم (Tags) القديمة، تنظيف أو دمج سجل الكوميتات القديمة في نطاق معين (Commit Range) أو على فرع محدد **بدون أي ضرر على ملفات المشروع الحالية**، ثم إطلاق إصدار نظيف جاهز للجمهور.

---

## 0. قاعدة الأمان الذهبية (نسخة احتياطية قبل أي تعديل على التاريخ)

قبل تنفيذ أي أمر يمسّ سجل Git أو الإصدارات، أنشئ فرعاً احتياطياً محلياً (لا ترفعه إلى GitHub) حتى يمكنك الرجوع لأي نقطة بثانية واحدة:

```bash
# تأكد أنك على الفرع الرئيسي وأن جميع تغييراتك محفوظة
git checkout main
git status

# إنشاء فرع نسخة احتياطية محلية آمنة (يبقى على حاسبتك فقط)
git branch backup-before-cleanup
```

> **مهم جداً:** لا ترفع الفرع الاحتياطي `backup-before-cleanup` إلى GitHub. وبعد أن تتأكد أن كل شيء يعمل 100% على GitHub يمكنك حذفه محلياً بـ `git branch -D backup-before-cleanup`.

---

## 1. حذف الإصدارات القديمة (Old GitHub Releases) والوسوم (Tags)

على GitHub، حذف الـ **Release** وحده لا يحذف الـ **Tag** المرتبط به تلقائياً. الأفضل حذف الاثنين معاً بشكل نظيف.

### الطريقة الأسرع عبر أداة GitHub CLI (`gh`)

1. استعرض جميع الإصدارات الحالية لتعرف أسماء الوسوم (Tags):
```bash
gh release list
```

2. لحذف إصدار قديم محدد **مع حذف الـ Tag المرتبط به تلقائياً**:
```bash
gh release delete v1.0.0-beta --cleanup-tag --yes
```

3. لحذف **جميع** الإصدارات القديمة التجريبية دفعة واحدة (مثلاً قبل إطلاق أول إصدار عام نظيف):
```bash
# معاينة فقط أولاً (لا يحذف شيئاً)
gh release list --limit 100 --json tagName -q '.[].tagName'

# حذف جميع الإصدارات والوسوم المرتبطة بها
gh release list --limit 100 --json tagName -q '.[].tagName' | while read -r tag; do
  gh release delete "$tag" --cleanup-tag --yes
done
```

4. لحذف أي وسوم (Tags) قديمة متبقية محلياً أو على GitHub بدون Release:
```bash
# عرض الوسوم المحلية
git tag -l

# حذف وسم محلياً ومن GitHub
git tag -d v0.9.0
git push origin --delete v0.9.0
```

> **ملاحظة:** إذا لم تكن تستخدم `gh`، يمكنك حذف أي Release من صفحة المستودع على GitHub -> **Releases** -> أيقونة سلة المهملات -> ثم حذف الـ Tag من تبويب **Tags**.

---

## 2. تنظيف الكوميتات القديمة بالسجل بدون الإضرار بالمشروع

اختر أحد الخيارين التاليين حسب هدفك:

### الخيار (أ): دمج/تنظيف نطاق معين من الكوميتات القديمة (Commit Range Squash)

مناسب إذا أردت الإبقاء على آخر الكوميتات المهمة ودمج مجموعة كوميتات تجريبية/قديمة متتالية في كوميت واحد مرتّب:

```bash
# 1. اعرض آخر 20 كوميت مع أرقامها المختصرة
git log --oneline -n 20

# 2. ابدأ إعادة الترتيب التفاعلي لآخر N كوميت (مثلاً آخر 8 كوميتات)
git rebase -i HEAD~8
```

في المحرر الذي سيفتح، اترك أول كوميت في النطاق كـ `pick` وغيّر الكوميتات التجريبية التابعة له إلى `squash` (أو `s`):

```text
pick a1b2c3d feat: initial clinical workspace
squash d4e5f6g fix typo
squash h7i8j9k wip mobile spacing
squash l0m1n2o temp adjustment
```

احفظ وأغلق المحرر، اكتب رسالة كوميت واحدة نظيفة، ثم ارفع التعديل بأمان:

```bash
# التحقق أن ملفات المشروع لم تتغير أبداً مقارنة بالنسخة الاحتياطية
git diff backup-before-cleanup

# الرفع الآمن إلى GitHub
git push origin main --force-with-lease
```

> إذا كان ناتج `git diff backup-before-cleanup` **فارغاً تماماً** فهذا يضمن 100% أن المشروع لم يتأثر ولا سطر واحد من الكود تغيّر!

---

### الخيار (ب): تصفير سجل التجارب بالكامل لبداية عامة نظيفة (Clean Orphan History — الأفضل قبل النشر العام الأول)

إذا كان سجل التطوير القديم مليئاً بكوميتات تجريبية (`fix`, `wip`, `test`, لقطات شاشة مؤقتة، ملفات محذوفة قديمة) وتريد أن يظهر المستودع للجمهور بسجل نظيف يبدأ من الإصدار العام الأول مع الحفاظ على **100% من ملفات المشروع الحالية**:

```bash
# 1. تأكد أن الفرع الاحتياطي موجود (من الخطوة 0)
git branch --list backup-before-cleanup

# 2. أنشئ فرعاً جديداً بدون تاريخ قديم (Orphan Branch)
git checkout --orphan clean-public-release

# 3. أضف جميع ملفات المشروع الحالية النظيفة (مع احترام .gitignore)
git add -A

# 4. أنشئ كوميت الإصدار العام الأول النظيف
git commit -m "chore: prepare PhysioRecord public open-source release"

# 5. تحقّق 100% أن المحتوى مطابق تماماً للمشروع الحالي (يجب أن يكون الناتج فارغاً)
git diff backup-before-cleanup

# 6. استبدل الفرع الرئيسي main بالفرع النظيف
git branch -D main
git branch -m main

# 7. ارفع الفرع النظيف إلى GitHub
git push origin main --force-with-lease
```

---

## 3. تنظيف الفروع القديمة (Stale Branches) على GitHub

```bash
# استعرض جميع الفروع البعيدة
git branch -r

# احذف أي فرع تجريبي قديم لم تعد تحتاجه (لا تحذف main أبداً)
git push origin --delete old-experiment-branch
git branch -D old-experiment-branch 2>/dev/null || true

# تنظيف المراجع الميتة محلياً
git fetch --prune
```

---

## 4. فحص الجاهزية قبل إطلاق الإصدار الجديد (Pre-Release Verification)

شغّل بوابات التحقق الكاملة قبل إنشاء وسم الإصدار الجديد:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run check:licenses
npm run check:content
npm run lint
npm test
npm run build
npm run check:perf
npm run sbom
```

ثم أنشئ وسم الإصدار الجديد وارفعه ليقوم GitHub Actions (`.github/workflows/release.yml`) تلقائياً ببناء ونشر **Web PWA + Android Universal APK + Windows Setup & Portable EXE**:

```bash
# مثال: توحيد رقم الإصدار (إن رغبت بالترقية إلى v1.2.0)
node scripts/sync-version.mjs --version=v1.2.0
git add package.json src/utils/settingsOnboardingPhaseF.ts android/app/build.gradle
git commit -m "chore(release): v1.2.0"
git push origin main

# إطلاق وسم الإصدار الرسمي
git tag -a v1.2.0 -m "PhysioRecord v1.2.0 — Public Release"
git push origin v1.2.0
```

---

## 5. قائمة أمان GitHub قبل التحويل إلى Public

من إعدادات المستودع في GitHub (**Settings**):

1. **Code security & analysis**: فعّل **Secret scanning** و**Push protection** و**Dependabot alerts** (مجانية للمستودعات العامة).
2. **Rules -> Rulesets (Branch protection)**: احمِ فرع `main` (منع الحذف، اشتراط نجاح CI).
3. **Rules -> Tag ruleset**: احمِ وسوم الإصدارات `v*` من الحذف أو الكتابة فوقها بالخطأ.
4. **Google Drive OAuth (إن فعّلت المزامنة السحابية للجمهور)**: قدّم شاشة موافقة OAuth في Google Cloud Console للتحقق المجاني من صلاحية `drive.file` مرة واحدة لإزالة تنبيه «لم تتحقق Google من هذا التطبيق» لجميع المستخدمين.
5. **تحقق من عدم وجود ملفات حساسة**: تأكد أن `.env`، ومفاتيح `.keystore` / `.jks`، وأي نسخ احتياطية `.ptbackup` غير متتبّعة بـ Git (`git ls-files | grep -E '\.env$|\.keystore|\.jks|\.ptbackup'`).
