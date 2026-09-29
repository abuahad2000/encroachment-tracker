import express from 'express'
import multer from 'multer'
import XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pipeline } from '../services/importPipeline.js'
import { calculateStats, createManagersData } from '../pipeline/buildData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

// POST /api/import-excel (or /api/import/excel)
router.post(['/import-excel', '/excel'], upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'لم يتم رفع أي ملف' })
    }

    // قراءة ملف Excel مع الكشف التلقائي عن صف العناوين
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // فحص أول 10 صفوف لمعرفة صف العناوين الفعلي (تجاوز البانرات وعناوين التقارير)
    const rowsGrid = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    let headerRowIndex = 0
    for (let i = 0; i < Math.min(rowsGrid.length, 10); i++) {
      const row = rowsGrid[i] || []
      const nonEmpties = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '')
      if (nonEmpties.length >= 4) {
        headerRowIndex = i
        break
      }
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex })

    if (!rawData || rawData.length === 0) {
      return res.status(400).json({ success: false, error: 'الملف فارغ أو لا يحتوي على بيانات صالحة' })
    }

    // نسخ احتياطي قبل الاستيراد
    const backupPath = path.join(__dirname, '../../data/backups')
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true })

    const reportsPath = path.join(__dirname, '../../data/reports.json')
    const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')
    const backupName = `reports_backup_${Date.now()}.json`

    if (fs.existsSync(reportsPath)) {
      fs.copyFileSync(reportsPath, path.join(backupPath, backupName))
    } else if (fs.existsSync(generatedReportsPath)) {
      fs.copyFileSync(generatedReportsPath, path.join(backupPath, backupName))
    }

    // تنفيذ الـ Pipeline
    const result = await pipeline.process(rawData, {
      fileName: req.file.originalname,
      uploadedBy: req.body.uploadedBy || 'system'
    })

    res.json(result)
  } catch (error) {
    console.error('Import error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

// POST /api/import-rollback (or /api/import/rollback)
router.post(['/import-rollback', '/rollback'], async (req, res) => {
  try {
    const backupPath = path.join(__dirname, '../../data/backups')
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: 'لا توجد نسخة احتياطية' })
    }

    const files = fs.readdirSync(backupPath).filter(f => f.startsWith('reports_backup_')).sort().reverse()

    if (files.length === 0) {
      return res.status(404).json({ success: false, error: 'لا توجد نسخة احتياطية' })
    }

    const latestBackup = files[0]
    const backupFile = path.join(backupPath, latestBackup)
    const reportsPath = path.join(__dirname, '../../data/reports.json')
    const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')

    fs.copyFileSync(backupFile, reportsPath)
    if (fs.existsSync(path.dirname(generatedReportsPath))) {
      fs.copyFileSync(backupFile, generatedReportsPath)
    }

    const projectsPath = path.join(__dirname, '../../data/generated/projects.json')
    if (fs.existsSync(projectsPath)) {
      try {
        const restoredReports = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
        const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
        const updatedStats = calculateStats(restoredReports, projects)
        const updatedManagers = createManagersData(projects, restoredReports)
        fs.writeFileSync(path.join(__dirname, '../../data/generated/stats.json'), JSON.stringify(updatedStats, null, 2), 'utf8')
        fs.writeFileSync(path.join(__dirname, '../../data/generated/managers.json'), JSON.stringify(updatedManagers, null, 2), 'utf8')
      } catch (e) {
        console.error('Error recalculating stats during rollback:', e)
      }
    }

    res.json({ success: true, message: 'تم التراجع بنجاح', restoredFrom: latestBackup })
  } catch (error) {
    console.error('Rollback error:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

export default router
