# 🚀 دليل النشر على Railway

هذا الملف يشرح خطوات نشر تطبيق "نظام التعديات" على منصة Railway.

---

## 📋 المتطلبات المسبقة

✅ حساب على [railway.app](https://railway.app)  
✅ Repository على GitHub (اكتمل - انظر GITHUB_SETUP.md)  
✅ البيانات الخام موجودة في `XLSX/` و `KMZ/`  

---

## 🔧 التعديلات التي تمت

تم إضافة الملفات التالية لتوافقية Railway:

### 1. **Procfile** (أساسي)
```
web: node server/src/index.js
```
يخبر Railway كيف تشغل التطبيق.

### 2. **railway.json** (تكوين متقدم)
يحدد:
- أوامر البناء (`npm install && npm run build-data && npm run build`)
- أوامر التشغيل (`npm start`)
- سياسة إعادة التشغيل التلقائي عند الأخطاء

### 3. **package.json محدّث**
```json
{
  "start": "node server/src/index.js",
  "railway-build": "npm install && npm run build-data && npm run build"
}
```

### 4. **.env.example**
يوضح متغيرات البيئة المتاحة.

---

## 📤 خطوات النشر على Railway

### **الخطوة 1: دفع المشروع إلى GitHub**

```bash
cd "c:/antigravity files IDE/encroachment-tracker"
git add Procfile railway.json .env.example
git commit -m "Add Railway deployment configuration"
git push origin main
```

### **الخطوة 2: إنشاء مشروع Railway**

1. اذهب إلى [railway.app](https://railway.app)
2. سجل دخول أو أنشئ حساب
3. اضغط **"New Project"** → **"Deploy from GitHub repo"**
4. اختر `abuahad2000/encroachment-tracker`

### **الخطوة 3: إعدادات البناء (Build Settings)**

Railway ستكتشف تلقائياً أنه **Node.js project**:
- Build Command: `npm install && npm run build-data && npm run build`
- Start Command: `npm start`

**لا تحتاج إلى تعديل أي شيء عادة** - Railway تقرأ من `railway.json`

### **الخطوة 4: متغيرات البيئة (Environment Variables)**

أضف في Railway dashboard:
```
PORT=3000
NODE_ENV=production
```

(إضافي - حسب احتياجاتك):
```
ALLOWED_ORIGINS=https://your-railway-app.railway.app
```

### **الخطوة 5: انتظر النشر**

Railway ستقوم تلقائياً بـ:
1. ✅ Clone المشروع من GitHub
2. ✅ تثبيت npm dependencies
3. ✅ تشغيل `npm run build-data` (معالجة البيانات)
4. ✅ تشغيل `npm run build` (بناء الـ React frontend)
5. ✅ تشغيل `npm start` (تشغيل الخادم)

في غضون **2-5 دقائق** سيكون تطبيقك **live**!

---

## 🌐 الوصول إلى التطبيق

بعد النشر الناجح:
```
https://your-app.railway.app/
```

Railway ستعطيك رابط فريد (مثال):
```
https://encroachment-tracker.railway.app
```

---

## 🔍 مراقبة التطبيق

في Railway dashboard:
- **Logs**: شاهد رسائل الخادم والأخطاء
- **Metrics**: استهلاك الموارد (CPU, Memory)
- **Deployment History**: سجل النشرات السابقة

---

## 🔄 التحديثات المستقبلية

كل مرة تدفع تحديثات إلى GitHub:
```bash
git push origin main
```

Railway **ستتكتشف التغيير تلقائياً** وتعيد النشر!

---

## ⚠️ نقاط مهمة

### **أداء الخادم المجاني**
- Railway توفر 5$ دولار شهري مجاني (يكفي لتطبيق صغير)
- الخادم قد ينام إذا لم يُستخدم 15 دقيقة (يستيقظ عند الطلب التالي)
- للإنتاج الفعلي، أضف **paid plan**

### **البيانات**
- ملفات XLSX و KMZ مُخزنة في نفس البناء
- Database يُعاد بناؤها عند كل نشر (لا توجد persistence)
- للحفاظ على البيانات، أضف **Railway PostgreSQL** (اختياري)

### **الحدود**
- **Max deployment size**: 1 GB
- **Max request timeout**: 120 ثانية
- مشروعنا (~13 MB) بدون مشاكل

---

## 🆘 استكشاف الأخطاء

### مشكلة: Build فشل
```
❌ npm run build-data timeout
```
**الحل**: زيادة memory في Railway settings

### مشكلة: Frontend لا تحمل
```
❌ Cannot GET /
```
**التحقق**: 
- تأكد أن `npm run build` أنتج `dist/` folder
- تحقق من Procfile صحيح

### مشكلة: API endpoints ترد 404
```
❌ Cannot POST /api/refresh-data
```
**التحقق**:
- الخادم يعمل على PORT الصحيح
- CORS مفعّل بشكل صحيح

---

## 📞 دعم Railway

- [Railway Docs](https://docs.railway.app)
- [Railway Discord Community](https://discord.gg/railway)
- Email support متوفر في الـ dashboard

---

**تم! تطبيقك جاهز للنشر على Railway! 🚀**
