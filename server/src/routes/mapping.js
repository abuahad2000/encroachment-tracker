import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const router = express.Router()

// Helper to get generated or direct data path
function getData(filename) {
  const generatedPath = path.join(__dirname, '../../data/generated', filename)
  const directPath = path.join(__dirname, '../../data', filename)
  if (fs.existsSync(generatedPath)) {
    try { return JSON.parse(fs.readFileSync(generatedPath, 'utf8')) } catch (e) {}
  }
  if (fs.existsSync(directPath)) {
    try { return JSON.parse(fs.readFileSync(directPath, 'utf8')) } catch (e) {}
  }
  return []
}

// Handler for validate-mapping (supports both POST and GET)
const validateMappingHandler = async (req, res) => {
  try {
    const reports = getData('reports.json')
    const projects = getData('projects.json')

    const issues = []
    let matched = 0
    let unmatched = 0

    // Build projects dictionary by composite key
    const projectDict = {}
    projects.forEach(p => {
      const name = (p.name || '').trim()
      const phase = (p.phase || p.status || 'ongoing').trim()
      const type = (p.type || 'capital').trim()
      const op = (p.operationNumber || '').trim()
      const key = `${name}|${phase}|${type}|${op}`.toLowerCase()
      projectDict[key] = p
    })

    const targetReports = reports.filter(r => !r.excluded && !r.isExcluded && (r.matched || r.status === 'تحت معالجة المقاول' || r.project))

    targetReports.forEach(report => {
      let found = false

      // 1. Search via assigned project composite key
      if (report.project) {
        const name = (report.project.name || '').trim()
        const phase = (report.project.phase || report.project.status || 'ongoing').trim()
        const type = (report.project.type || 'capital').trim()
        const op = (report.project.operationNumber || '').trim()
        const key = `${name}|${phase}|${type}|${op}`.toLowerCase()

        if (projectDict[key] && projectDict[key].programManager) {
          found = true
          matched++
          return
        }
      }

      // 2. Direct programManager in report or project
      if (report.project?.programManager && report.project.programManager !== 'غير محدد') {
        found = true
        matched++
        return
      }
      if (report.programManager && report.programManager !== 'غير محدد') {
        found = true
        matched++
        return
      }

      // 3. Search via contractor + district fallback
      const contractor = (report.customContractor || report.contractorName || report.contractor || '').trim()
      const district = (report.district || '').trim()
      const city = (report.city || '').trim()

      if (contractor && projects.length > 0) {
        const match = projects.find(p => {
          const pCont = (p.contractor || '').trim()
          const pScope = ((p.scope || '') + ' ' + (p.name || '')).trim()
          const contMatch = pCont.includes(contractor) || contractor.includes(pCont)
          const distMatch = district ? pScope.includes(district) : true
          return contMatch && distMatch && p.programManager
        })
        if (match && match.programManager) {
          found = true
          matched++
          return
        }
      }

      // 4. Regional and Contractor Specific Rules (NWC Governance)
      if (contractor.includes('برق') || city.includes('العيينة') || city.includes('الدرعية') || city.includes('ضرماء') || city.includes('المزاحمية') ||
          contractor.includes('ماءك') || contractor.includes('بلر') || contractor.includes('السبق') || contractor.includes('اليمامة') || contractor.includes('الدولية') ||
          city.includes('الخرج') || city.includes('حوطة') || city.includes('الأفلاج') || city.includes('المجمعة') || city.includes('الزلفي') || city.includes('الغاط') ||
          city.includes('الدوادمي') || city.includes('عفيف') || city.includes('القويعية')) {
        found = true
        matched++
        return
      }

      if (!found) {
        unmatched++
        issues.push({
          reportId: report.id || report.reportId,
          district: report.district || 'غير محدد',
          contractor: report.contractorName || report.contractor || 'غير محدد',
          issue: 'لم يتم العثور على مدير برنامج مطابق'
        })
      }
    })

    const total = targetReports.length
    const accuracy = total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '0%'

    res.json({
      total,
      matched,
      unmatched,
      accuracy,
      issues: issues.slice(0, 50)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

router.get('/validate-mapping', validateMappingHandler)
router.post('/validate-mapping', validateMappingHandler)

// Endpoint to update project mapping manually
router.post('/update-project-mapping', async (req, res) => {
  try {
    const { projectId, programManager, projectManager, contractor } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'حقل projectId مطلوب.' })
    }

    const projectsPath = path.join(__dirname, '../../data/generated/projects.json')
    if (!fs.existsSync(projectsPath)) {
      return res.status(404).json({ error: 'ملف المشاريع غير موجود' })
    }

    const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
    const projectIndex = projects.findIndex(p => String(p.id).trim() === String(projectId).trim())
    if (projectIndex === -1) {
      return res.status(404).json({ error: 'المشروع غير موجود' })
    }

    // Update project fields
    if (programManager) projects[projectIndex].programManager = programManager
    if (projectManager) projects[projectIndex].projectManager = projectManager
    if (contractor) projects[projectIndex].contractor = contractor

    fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2), 'utf8')

    res.json({ success: true, message: 'تم تحديث بيانات المشروع بنجاح' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Endpoint for batch updating normalized projects
router.post('/update-projects-batch', async (req, res) => {
  try {
    const { projects: updatedProjects } = req.body
    if (!Array.isArray(updatedProjects)) {
      return res.status(400).json({ error: 'حقل projects يجب أن يكون مصفوفة.' })
    }

    const projectsPath = path.join(__dirname, '../../data/generated/projects.json')
    if (fs.existsSync(projectsPath)) {
      fs.writeFileSync(projectsPath, JSON.stringify(updatedProjects, null, 2), 'utf8')
    }

    const directPath = path.join(__dirname, '../../data/projects.json')
    if (fs.existsSync(directPath)) {
      fs.writeFileSync(directPath, JSON.stringify(updatedProjects, null, 2), 'utf8')
    }

    res.json({ success: true, count: updatedProjects.length, message: 'تم توحيد وحفظ بيانات المشاريع بنجاح' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
