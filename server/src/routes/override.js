import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const router = express.Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// POST /api/unassign-project
router.post('/unassign-project', async (req, res) => {
  try {
    const { reportId, managerName } = req.body

    const directReportsPath = path.join(__dirname, '../../data/reports.json')
    const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')
    const reportsPath = fs.existsSync(directReportsPath) ? directReportsPath : generatedReportsPath

    if (!fs.existsSync(reportsPath)) {
      return res.status(404).json({ error: 'ملف التقارير غير موجود' })
    }

    const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf8'))
    const reportIndex = reports.findIndex(r => String(r.id) === String(reportId))

    if (reportIndex === -1) {
      return res.status(404).json({ error: 'البلاغ غير موجود' })
    }

    // تحديث الحالة: استبعاد مع تسجيل السبب بدقة للحفاظ على سجل التدقيق
    reports[reportIndex].excluded = true
    reports[reportIndex].excludedReason = `أزاله بواسطة مدير البرنامج (${managerName}): غير تابع للمشاريع`
    reports[reportIndex].projectId = null
    reports[reportIndex].programManager = null // إزالة الإسناد
    reports[reportIndex].unassignedByManager = true
    reports[reportIndex].needsReview = true // لإمكانية مراجعته لاحقاً من قبل الإدارة العليا

    // حفظ التعديلات
    fs.writeFileSync(directReportsPath, JSON.stringify(reports, null, 2), 'utf8')
    if (fs.existsSync(path.dirname(generatedReportsPath))) {
      fs.writeFileSync(generatedReportsPath, JSON.stringify(reports, null, 2), 'utf8')
    }

    res.json({ success: true, message: 'تم إزالة المشروع من قائمة المدير بنجاح' })
  } catch (error) {
    console.error('Unassign error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
