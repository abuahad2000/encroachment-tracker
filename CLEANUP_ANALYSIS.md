# 📊 تقرير تحليل البيانات قبل التنظيف الشامل (CLEANUP_ANALYSIS.md)

تم إجراء فحص دقيق وشامل لكافة ملفات المشروع ومجلداته وأحجامها والتبعيات البرمجية بينها، وفق أفضل ممارسات تنظيم البيانات وعزل المراجع الثابتة عن البيانات المولدة والملفات المؤقتة.

---

## 1. الملفات الموجودة في server/data/

- **عدد الملفات الكلي**: 22 ملفاً
- **حجم المجلد الكلي**: 91.06 ميغابايت (MB)
- **الملفات المولدة (generated)**: 6 ملفات (بحجم إجمالي: 32.79 ميغابايت)
  - `generated/reports.json` (27.92 MB) - البلاغات المدمجة المعالجة النشطة
  - `generated/layers.json` (2.69 MB) - الطبقات الجغرافية المستخرجة من KMZ
  - `generated/projects.json` (2.07 MB) - قاعدة بيانات المشاريع الكاملة
  - `generated/districts_classification.json` (76.6 KB) - تصنيف الأحياء المعتمد
  - `generated/managers.json` (46.0 KB) - بطاقات مدراء البرامج والمشاريع
  - `generated/stats.json` (1.38 KB) - إحصائيات لوحة التحكم والتحليل
- **الملفات المرجعية (reference)**: 3 ملفات (بحجم إجمالي: 29.05 كيلوبايت)
  - `reference/contractors_registry.json` (16.9 KB) - السجل المرجعي المحمي للمقاولين
  - `reference/managers_registry.json` (5.3 KB) - السجل المرجعي المحمي للمدراء
  - `reference/README.md` (6.8 KB) - ميثاق حوكمة البيانات المرجعية
- **الملفات المؤقتة والنسخ الاحتياطية (temp / backups)**: 7 ملفات (بحجم إجمالي: 40.97 ميغابايت)
  - `backups/reports_backup_1790698073417.json` (20.04 MB)
  - `backups/reports_backup_1790698397618.json` (20.84 MB)
  - `backups/maintenance_districts_backup.json` (2.0 KB)
  - `contractor_directory_backup.json` (80.8 KB)
  - `contractor_profiles_backup.json` (2 بايت)
  - `maintenance_districts_backup.json` (2.0 KB)
  - `overrides_backup.json` (6.78 KB)
- **الملفات في جذر مجلد data (غير مفروزة بحسب طبيعتها)**: 6 ملفات (بحجم 21.69 ميغابايت)
  - `reports.json` (21.60 MB) - ملف البلاغات الخام القديم
  - `contractor_directory.json` (80.8 KB)
  - `contractor_profiles.json` (2 بايت - ملف فارغ)
  - `overrides.json` (6.78 KB - ملف التعديلات اليدوية المحمي)
  - `maintenance_districts.json` (2.0 KB)
  - `import_logs.json` (845 بايت)
- **الملفات المكررة (Identical Duplicates عبر فحص MD5 Hash)**: 5 ملفات متطابقة تماماً:
  - `server/data/contractor_directory_backup.json` ⟵ نسخة مكررة من `contractor_directory.json`
  - `server/data/contractor_profiles_backup.json` ⟵ نسخة مكررة من `contractor_profiles.json`
  - `server/data/maintenance_districts_backup.json` ⟵ نسخة مكررة من `maintenance_districts.json`
  - `server/data/backups/maintenance_districts_backup.json` ⟵ نسخة مكررة ثالثة من `maintenance_districts.json`
  - `server/data/overrides_backup.json` ⟵ نسخة مكررة من `overrides.json`

---

## 2. الملفات الموجودة في NWC_Projects/

- **عدد ملفات YAML المستقلة**: 0 ملفات (لا توجد ملفات `.yaml` منفصلة في المجلد).
- **عدد ملفات Markdown (.md)**: 14 ملفاً (بحجم إجمالي: 0.39 ميغابايت).
  1. `01_تركي_الاسمري.md` (16.5 KB)
  2. `02_عسكر_لسلوم.md` (43.6 KB)
  3. `03_عبدالله_العنزي.md` (42.7 KB)
  4. `04_سفر_العتيبي.md` (51.0 KB)
  5. `05_علي_الشهري.md` (19.8 KB)
  6. `06_أمجد_الفالح.md` (15.3 KB)
  7. `07_عبدالله_الأسود.md` (25.9 KB)
  8. `08_المحافظات_الشمالية.md` (29.7 KB)
  9. `09_المحافظات_الجنوبية.md` (50.3 KB)
  10. `10_المحافظات_الغربية.md` (70.7 KB)
  11. `dictionary.md` (188 بايت)
  12. `schema.md` (1.54 KB)
  13. `README.md` (3.8 KB)
  14. `تقرير_المقاولين_الشامل.md` (35.4 KB)
- **التكرارات وطبيعة التخزين المرصودة**:
  - المشاريع مُعرّفة بصيغة كتل ````yaml` برمجية داخل نصوص الـ Markdown في الملفات العشرة الأولى (`01` إلى `10`).
  - محرك التحليل [`server/src/pipeline/parseProjects.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/parseProjects.js) يقرأ كتل الـ YAML من داخل هذه الملفات العشرة حصراً عبر التعبير النمطي `/```yaml\s*([\s\S]*?)```/g`.
  - ملف `تقرير_المقاولين_الشامل.md` هو تقرير نصي استعراضي قديم تم توليده سابقاً، وأصبح مكرراً ولا حاجة تشغيلية له بعد إنشاء السجل المرجعي `contractors_registry.json`.

---

## 3. الملفات الموجودة في server/src/pipeline/

- **عدد الملفات الكلي**: 11 ملفاً
- **الملفات النشطة (Active Pipeline Modules)**: 10 ملفات مستدعاة ومرتبطة بسير العمل:
  1. [`buildData.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/buildData.js) - منسق بناء وتحديث البيانات الشامل
  2. [`matchEngine.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/matchEngine.js) - محرك المطابقة الجغرافي والمنطقي الرئيسي
  3. [`mergeReports.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/mergeReports.js) - منطق الدمج الأسبوعي التراكمي للبلاغات
  4. [`contractorsRegistry.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/contractorsRegistry.js) - محرك استعلام السجل المرجعي للمقاولين
  5. [`districtClassification.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/districtClassification.js) - مصنف أحياء الصيانة والمشاريع الجارية
  6. [`governorateMatcher.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/governorateMatcher.js) - مطابقة مشاريع محافظات منطقة الرياض
  7. [`parseKmz.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/parseKmz.js) - معالج واستخراج طبقات KMZ إلى GeoJSON
  8. [`parseProjects.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/parseProjects.js) - قراءة مشاريع NWC_Projects
  9. [`parseReports.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/parseReports.js) - معالج ملفات الإكسل والبلاغات
  10. [`normalize.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/normalize.js) - دوال معالجة النصوص وحساب نسبة التطابق
- **الملفات غير المستدعاة حالياً (Unused / Orphaned)**: 1 ملف
  - [`loadReferenceData.js`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/server/src/pipeline/loadReferenceData.js) - تم إعداده كواجهة لتحميل المراجع لكنه غير مستدعى حالياً في أي ملف؛ إما دمجه في نقاط النهاية أو الإبقاء عليه كأداة موحدة.

---

## 4. الملفات في الجذر (Root)

- **عدد الملفات الكلي في الجذر**: 17 ملفاً (بحجم 0.30 ميغابايت)
- **ملفات النسخ الاحتياطي في الجذر**: 0 (لا توجد ملفات نسخ احتياطي مهملة بالجذر).
- **ملفات الإكسل القديمة في الجذر**: 0 (تتمركز ملفات الإكسل الأربعة في مجلد `XLSX/` بحجم 0.86 MB وليست بالجذر).
- **ملفات التوثيق في الجذر**: 4 ملفات:
  1. [`PROJECT_LOGIC.md`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/PROJECT_LOGIC.md) (44.5 KB) - المرجع الفني الرسمي لمنطق النظام ومراحل المطابقة (حيوي وأساسي).
  2. [`README.md`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/README.md) (5.3 KB) - الدليل العام للمشروع.
  3. [`FILE_UPLOAD_FEATURE.md`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/FILE_UPLOAD_FEATURE.md) (6.6 KB) - توثيق ميزة رفع الملفات والدمج (مرشح للنقل إلى `docs/`).
  4. [`RAILWAY_DEPLOYMENT.md`](file:///c:/antigravity%20files%20IDE/encroachment-tracker/RAILWAY_DEPLOYMENT.md) (4.9 KB) - توثيق النشر السحابي (مرشح للنقل إلى `docs/`).
- **ملفات الإعداد والتشغيل**: 13 ملفاً (كلها ضرورية لـ Vite, React, Tailwind, Railway, Git).

---

## 5. قائمة الملفات المرشحة للحذف

| # | مسار الملف | الحجم | سبب الحذف المبرر |
|---|---|---|---|
| 1 | `server/data/backups/reports_backup_1790698073417.json` | 20.04 MB | نسخة احتياطية تاريخية قديمة لبلاغات سابقة، تشغل مساحة ضخمة دون حاجة تشغيلية. |
| 2 | `server/data/backups/reports_backup_1790698397618.json` | 20.84 MB | نسخة احتياطية تاريخية قديمة أخرى، تشكل مع السابقة أكثر من 40 ميغابايت من التكرار. |
| 3 | `server/data/backups/maintenance_districts_backup.json` | 2.04 KB | نسخة مكررة بنسبة 100% مع الملف الفعلي `maintenance_districts.json`. |
| 4 | `server/data/contractor_directory_backup.json` | 80.79 KB | نسخة مكررة متطابقة بنسبة 100% مع `contractor_directory.json`. |
| 5 | `server/data/contractor_profiles.json` | 2 Bytes | ملف فارغ تماماً `{}` لا قيمة له ويسبب تشويشاً في الهيكلية. |
| 6 | `server/data/contractor_profiles_backup.json` | 2 Bytes | نسخة مكررة من الملف الفارغ أعلاه. |
| 7 | `server/data/maintenance_districts_backup.json` | 2.04 KB | نسخة مكررة أخرى متطابقة مع الأصل في نفس المجلد. |
| 8 | `server/data/overrides_backup.json` | 6.78 KB | نسخة مكررة من ملف التعديلات؛ الحماية مؤمنة عبر `server/data/overrides.json` و Git. |
| 9 | `NWC_Projects/تقرير_المقاولين_الشامل.md` | 35.44 KB | تقرير نصي قديم مكرر استُبدل بالسجل المرجعي `contractors_registry.json`. |
| 10 | `scratch/` (الملفات المؤقتة) | ~50 KB | نصوص وسكربتات مؤقتة استُخدمت للفحص والتحليل أثناء الجلسة البرمجية. |

💡 **الأثر المتوقع للحذف**:
- حذف فوري لأكثر من **41 MB** من البيانات الزائدة.
- تقليل حجم مجلد `server/data/` من **91.06 MB** إلى حوالي **50.1 MB** (انخفاض بنسبة **45%** مباشرة).

---

## 6. قائمة الملفات المرشحة للنقل وإعادة التنظيم

بهدف تحقيق الفصل الصارم بين: **المراجع الثابتة (Reference)**، و**البيانات المولدة (Generated)**، و**المدخلات الخام (Raw Inputs)**، و**ملفات التوثيق (Docs)**:

| # | الملف الحالي | المسار الجديد المقترح | الهدف والمسوغ التقني |
|---|---|---|---|
| 1 | `server/data/maintenance_districts.json` | `server/data/reference/maintenance_districts.json` | نقل قائمة أحياء الصيانة المعتمدة إلى مجلد المراجع الثابتة المحمية إلى جانب سجل المقاولين وسجل المدراء. |
| 2 | `server/data/overrides.json` | `server/data/overrides.json` *(يُبقى في مكانه مع حمايته التامة)* | يبقى كملف تعديلات ديناميكي محمي ولا يُمس، ومفصول عن المولد والمؤقت. |
| 3 | `server/data/reports.json` (21.60 MB) | `server/data/raw/reports_initial.json` | عزله في مجلد `raw/` لتمييزه بوضوح كملف إدخال أولي، وعدم الخلط بينه وبين `server/data/generated/reports.json` (27.92 MB). |
| 4 | `server/data/import_logs.json` | `server/data/logs/import_logs.json` | نقل سجلات الاستيراد إلى مجلد سجلات مخصص لتنظيف جذر `data`. |
| 5 | `server/data/contractor_directory.json` | `server/data/generated/contractor_directory.json` | تصنيفه كملف مولد ناتج عن التحليل وليس كمرجع أولي. |
| 6 | `FILE_UPLOAD_FEATURE.md` (في الجذر) | `docs/FILE_UPLOAD_FEATURE.md` | جمع التوثيقات التكميلية في مجلد توثيق موحد وإبقاء الجذر نظيفاً. |
| 7 | `RAILWAY_DEPLOYMENT.md` (في الجذر) | `docs/RAILWAY_DEPLOYMENT.md` | جمع أدلة النشر السحابي داخل `docs/`. |

---

## 7. الخريطة الهيكلية المستهدفة بعد التنظيم الكامل

```text
encroachment-tracker/
├── docs/                                  # 📚 أدلة التوثيق والنشر التكميلية
│   ├── FILE_UPLOAD_FEATURE.md
│   └── RAILWAY_DEPLOYMENT.md
├── NWC_Projects/                          # 📁 ملفات تعريف مشاريع البرامج (10 ملفات أساسية)
│   ├── 01_تركي_الاسمري.md
│   ├── ...
│   ├── 10_المحافظات_الغربية.md
│   ├── dictionary.md
│   └── schema.md
├── server/
│   ├── data/
│   │   ├── reference/                     # 🛡️ المراجع الثابتة المحمية (ممنوع الكتابة الآلية)
│   │   │   ├── contractors_registry.json
│   │   │   ├── managers_registry.json
│   │   │   ├── maintenance_districts.json
│   │   │   └── README.md
│   │   ├── generated/                     # ⚙️ المخرجات المولدة آلياً من خط الإنتاج
│   │   │   ├── reports.json
│   │   │   ├── projects.json
│   │   │   ├── layers.json
│   │   │   ├── districts_classification.json
│   │   │   ├── managers.json
│   │   │   ├── stats.json
│   │   │   └── contractor_directory.json
│   │   ├── raw/                           # 📥 ملفات المدخلات الأصلية المحفوظة
│   │   │   └── reports_initial.json
│   │   ├── logs/                          # 📝 سجلات العمليات والاستيراد
│   │   │   └── import_logs.json
│   │   └── overrides.json                 # 🔒 التعديلات اليدوية المحمية للمستخدم
│   └── src/
│       ├── pipeline/                      # 🚀 محركات المعالجة والمطابقة النشطة (10 ملفات)
│       └── index.js                       # خادم Express ونقاط النهاية البرمجية
├── KMZ/                                   # 🗺️ طبقات الـ GIS الجغرافية الأصلية
├── XLSX/                                  # 📊 ملفات الجداول المرجعية الأصلية
├── PROJECT_LOGIC.md                       # 📖 الوثيقة المرجعية الرسمية لمنطق المطابقة
└── README.md                              # 📌 دليل النظام
```
