import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import multer from 'multer'
import { buildData, calculateStats, createManagersData } from './pipeline/buildData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // Save with original name (will replace old file)
    cb(null, 'reports.xlsx')
  }
})

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Only allow Excel files
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls')) {
      cb(null, true)
    } else {
      cb(new Error('Only Excel files are allowed'))
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
})

const app = express()
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

// Debug paths
console.log('🔍 Debugging paths:')
console.log('  __dirname:', __dirname)
console.log('  process.cwd():', process.cwd())

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}))
app.use(express.json())

// Serve static files from dist/ (built React app)
const distPath = path.join(__dirname, '../../dist')
const indexPath = path.join(distPath, 'index.html')

console.log('  distPath:', distPath)
console.log('  distPath exists?', fs.existsSync(distPath))
console.log('  index.html exists?', fs.existsSync(indexPath))

if (fs.existsSync(distPath)) {
  // Serve index.html for the root path
  app.get('/', (req, res) => {
    const absolutePath = path.resolve(indexPath)
    console.log(`📍 Serving root request, sending: ${absolutePath}`)
    res.sendFile(absolutePath)
  })

  // Serve static files with proper index handling
  app.use(express.static(distPath, {
    index: false  // We handle index.html manually above
  }))

  console.log(`📁 Serving static files from dist/`)
} else {
  console.warn(`⚠️  dist/ folder not found at: ${distPath}`)
}

// Utility to load generated data
function loadGeneratedData(file) {
  const filePath = path.join(__dirname, `../data/generated/${file}`)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.error(`Error loading ${file}:`, e.message)
  }
  return null
}

// Utility to re-generate executive pending reports Excel file
function runExecutiveExcelExport() {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../../scripts/export_executive_excel.py')
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
    console.log('📊 Updating executive Excel report...')
    exec(`"${pythonCmd}" "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        console.warn('⚠️ Warning: Error regenerating executive Excel report:', error.message)
        return resolve(false)
      }
      console.log('✅ Executive Excel report successfully updated at XLSX/تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx')
      resolve(true)
    })
  })
}

// ===== API Endpoints =====

// Get statistics
app.get('/api/stats', (req, res) => {
  const stats = loadGeneratedData('stats.json')
  if (!stats) {
    return res.status(500).json({ error: 'Stats not found. Run build-data first.' })
  }
  res.json(stats)
})

// Get reports
app.get('/api/reports', (req, res) => {
  const reports = loadGeneratedData('reports.json')
  if (!reports) {
    return res.status(500).json({ error: 'Reports not found.' })
  }
  res.json(reports)
})

// Get projects
app.get('/api/projects', (req, res) => {
  const projects = loadGeneratedData('projects.json')
  if (!projects) {
    return res.status(500).json({ error: 'Projects not found.' })
  }
  res.json(projects)
})

// Get managers
app.get('/api/managers', (req, res) => {
  const managers = loadGeneratedData('managers.json')
  if (!managers) {
    return res.status(500).json({ error: 'Managers not found.' })
  }
  res.json(managers)
})

// Get layers (GeoJSON) - Only ongoing active layers
app.get('/api/layers', (req, res) => {
  const layers = loadGeneratedData('layers.json')
  if (!layers) {
    return res.json({
      type: 'FeatureCollection',
      features: [],
      stats: { water: 0, sanitation: 0, total: 0 }
    })
  }

  const { sector } = req.query
  const waterFeatures = (layers.water?.features || []).map(f => ({
    ...f,
    properties: { ...f.properties, sector: 'water' }
  }))
  const sanitationFeatures = (layers.sanitation?.features || []).map(f => ({
    ...f,
    properties: { ...f.properties, sector: 'sanitation' }
  }))

  const stats = {
    water: waterFeatures.length,
    sanitation: sanitationFeatures.length,
    total: waterFeatures.length + sanitationFeatures.length
  }

  let selectedFeatures = []
  if (sector === 'water') {
    selectedFeatures = waterFeatures
  } else if (sector === 'sanitation') {
    selectedFeatures = sanitationFeatures
  } else {
    selectedFeatures = [...waterFeatures, ...sanitationFeatures]
  }

  res.json({
    type: 'FeatureCollection',
    features: selectedFeatures,
    waterFeatures,
    sanitationFeatures,
    stats
  })
})

// Upload new reports file
app.post('/api/upload-reports', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'لم يتم استلام أي ملف' })
    }

    const uploadedPath = req.file.path
    const xlsxDir = path.join(__dirname, '../../XLSX')
    const targetPath = path.join(xlsxDir, 'بلاغات تعدي مقاولي شركة المياه الوطنية 12 سبتمبر.xlsx')
    const uploadedReportsCopy = path.join(xlsxDir, 'reports.xlsx')

    // Create XLSX directory if it doesn't exist
    if (!fs.existsSync(xlsxDir)) {
      fs.mkdirSync(xlsxDir, { recursive: true })
    }

    // Replace the default file and keep a copy as reports.xlsx
    fs.copyFileSync(uploadedPath, targetPath)
    fs.copyFileSync(uploadedPath, uploadedReportsCopy)
    try {
      fs.unlinkSync(uploadedPath) // Delete temp file
    } catch (e) {
      console.warn('Could not delete temp uploaded file:', e.message)
    }

    // Trigger data rebuild directly in-process with persistent overrides preserved
    console.log('📤 New reports file uploaded, rebuilding data...')
    const result = await buildData()

    // Regenerate executive pending Excel report with latest data
    await runExecutiveExcelExport()

    res.json({
      success: true,
      message: 'تم رفع الملف وإعادة معالجة البيانات وتحديث التقرير التنفيذي بنجاح مع الاحتفاظ بكافة الاستبعادات والتعديلات السابقة',
      file: req.file.originalname,
      stats: result?.stats,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('❌ Error uploading/processing file:', err)
    res.status(500).json({ 
      error: 'فشل في رفع ومعالجة الملف', 
      details: err.message 
    })
  }
})

// Save override
app.post('/api/override', async (req, res) => {
  const { reportId, projectId, excluded, reason, customContractor, customProgramManager } = req.body
  const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '')

  const overridesPath = path.join(__dirname, '../data/overrides.json')
  let overrides = []

  if (fs.existsSync(overridesPath)) {
    try {
      overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
    } catch (e) {
      overrides = []
    }
  }

  // Find existing or create new using normalized ID
  const existingIndex = overrides.findIndex(o => normalizeId(o.reportId) === normalizeId(reportId))
  const entry = existingIndex >= 0 ? { ...overrides[existingIndex] } : { reportId }

  if (projectId !== undefined) entry.projectId = projectId || null
  if (excluded !== undefined) entry.excluded = !!excluded
  if (reason !== undefined) entry.reason = reason
  if (customContractor !== undefined) entry.customContractor = customContractor
  if (customProgramManager !== undefined) entry.customProgramManager = customProgramManager
  if (req.body.licenseNumber) entry.licenseNumber = req.body.licenseNumber

  entry.timestamp = new Date().toISOString()

  if (existingIndex >= 0) {
    overrides[existingIndex] = entry
  } else {
    overrides.push(entry)
  }

  fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2))

  // Update reports.json, stats.json, and managers.json immediately
  const reportsPath = path.join(__dirname, '../data/generated/reports.json')
  const projectsPath = path.join(__dirname, '../data/generated/projects.json')
  let updatedReport = null

  if (fs.existsSync(reportsPath)) {
    try {
      const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'))
      const rIdx = reports.findIndex(r => normalizeId(r.id) === normalizeId(reportId))
      if (rIdx >= 0) {
        if (customContractor !== undefined) {
          reports[rIdx].contractorName = customContractor
          reports[rIdx].customContractor = customContractor
        }
        if (projectId !== undefined) {
          if (fs.existsSync(projectsPath)) {
            const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))
            const proj = projects.find(p => String(p.id).trim() === String(projectId).trim())
            if (proj) {
              reports[rIdx].project = { ...proj }
              reports[rIdx].matched = true
              reports[rIdx].excluded = false
              const name = proj.name || ''
              const sub = proj.subProgram || ''
              reports[rIdx].sector = (name.includes('مياه') || sub.includes('مياه')) ? 'مياه' : 'صرف'
            }
          }
        }
        if (customProgramManager && reports[rIdx].project) {
          reports[rIdx].project.programManager = customProgramManager
        }
        if (excluded !== undefined) {
          reports[rIdx].excluded = !!excluded
          if (excluded) {
            reports[rIdx].matched = false
            reports[rIdx].project = null // CRITICAL: nullify project so report is not counted or shown under the manager!
            reports[rIdx].excludedReason = reason || 'مستبعد من نطاق مشاريع مدير البرنامج'
          }
        }
        fs.writeFileSync(reportsPath, JSON.stringify(reports, null, 2))
        updatedReport = reports[rIdx]

        // Recompute stats and managers so dashboard and manager cards update immediately
        if (fs.existsSync(projectsPath)) {
          const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))
          const updatedStats = calculateStats(reports, projects)
          const updatedManagers = createManagersData(projects, reports)
          fs.writeFileSync(path.join(__dirname, '../data/generated/stats.json'), JSON.stringify(updatedStats, null, 2))
          fs.writeFileSync(path.join(__dirname, '../data/generated/managers.json'), JSON.stringify(updatedManagers, null, 2))
        }
      }
    } catch (e) {
      console.error('Error updating reports.json with override:', e.message)
    }
  }

  // Regenerate executive pending Excel report in background so it reflects the exclusion immediately
  runExecutiveExcelExport().catch(e => console.warn('Background Excel export warning:', e.message))

  res.json({ success: true, overrides, updatedReportId: reportId, updatedReport })
})

// Refresh data
app.post('/api/refresh-data', async (req, res) => {
  try {
    console.log('🔄 Starting data refresh...')
    const result = await buildData()

    // Regenerate executive pending Excel report with latest data
    await runExecutiveExcelExport()

    console.log('✅ Data refresh & Excel report update completed')
    res.json({ success: true, message: 'تم تحديث البيانات والتقرير التنفيذي بنجاح', stats: result?.stats })
  } catch (err) {
    console.error('❌ Error refreshing data:', err)
    res.status(500).json({ error: 'Failed to refresh data', details: err.message })
  }
})

// Contractors registry file path
const contractorsConfigPath = path.join(__dirname, '../data/contractors.json')

function loadContractorsConfig() {
  if (fs.existsSync(contractorsConfigPath)) {
    try {
      return JSON.parse(fs.readFileSync(contractorsConfigPath, 'utf-8'))
    } catch (e) {
      console.error('Error loading contractors config:', e)
    }
  }
  return { customContractors: [], aliases: {} }
}

function saveContractorsConfig(data) {
  const dir = path.dirname(contractorsConfigPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(contractorsConfigPath, JSON.stringify(data, null, 2))
}

// Get full contractors analysis and registry
app.get('/api/contractors', (req, res) => {
  const projects = loadGeneratedData('projects.json') || []
  const reports = loadGeneratedData('reports.json') || []
  const config = loadContractorsConfig()

  // Map contractors from projects
  const contractorsMap = {}

  // 1. Seed from projects
  projects.forEach(p => {
    const cName = (p.contractor || '').trim()
    if (!cName || cName === '-' || cName === 'غير محدد') return
    if (!contractorsMap[cName]) {
      contractorsMap[cName] = {
        name: cName,
        source: 'excel_projects',
        projects: [],
        programManagers: new Set(),
        sectors: new Set(),
        districts: new Set(),
        reportsCount: 0,
        activeReportsCount: 0,
        processedReportsCount: 0,
        isAswadException: false,
        aliases: []
      }
    }
    contractorsMap[cName].projects.push({
      id: p.id,
      name: p.name,
      status: p.status,
      scope: p.scope,
      manager: p.programManager
    })
    if (p.programManager) contractorsMap[cName].programManagers.add(p.programManager)
    const sec = (p.name.includes('مياه') || (p.subProgram || '').includes('مياه')) ? 'مياه' : 'صرف'
    contractorsMap[cName].sectors.add(sec)
    if (p.scope) contractorsMap[cName].districts.add(p.scope)
  })

  // 2. Add custom added contractors from config
  ;(config.customContractors || []).forEach(custom => {
    if (!contractorsMap[custom.name]) {
      contractorsMap[custom.name] = {
        name: custom.name,
        source: 'custom_added',
        projects: [],
        programManagers: new Set(custom.programManagers || []),
        sectors: new Set(custom.sectors || []),
        districts: new Set(custom.districts || []),
        reportsCount: 0,
        activeReportsCount: 0,
        processedReportsCount: 0,
        isAswadException: !!custom.isAswadException,
        aliases: custom.aliases || []
      }
    } else {
      if (custom.isAswadException) contractorsMap[custom.name].isAswadException = true
      if (custom.aliases) contractorsMap[custom.name].aliases = custom.aliases
    }
  })

  // 3. Aggregate reports stats for each contractor (only if matched to a project and program manager)
  reports.forEach(r => {
    if (r.excluded || !r.matched || !r.project || !r.project.programManager) return
    const cName = r.contractorName || r.project.contractor
    if (cName && contractorsMap[cName]) {
      contractorsMap[cName].reportsCount++
      if (r.status === 'تمت المعالجة') {
        contractorsMap[cName].processedReportsCount++
      } else {
        contractorsMap[cName].activeReportsCount++
      }
    }
  })

  // Convert Sets to Arrays
  const list = Object.values(contractorsMap).map(c => ({
    ...c,
    programManagers: Array.from(c.programManagers),
    sectors: Array.from(c.sectors),
    districts: Array.from(c.districts),
    projectsCount: c.projects.length
  })).sort((a, b) => b.activeReportsCount - a.activeReportsCount || a.name.localeCompare(b.name, 'ar'))

  res.json({
    contractors: list,
    total: list.length,
    customCount: (config.customContractors || []).length,
    aliases: config.aliases || {}
  })
})

// Add or update contractor
app.post('/api/contractors', async (req, res) => {
  const { name, programManagers, sectors, districts, isAswadException, aliases } = req.body
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'اسم المقاول مطلوب' })
  }

  const trimmedName = name.trim()
  const config = loadContractorsConfig()

  const existingIdx = config.customContractors.findIndex(c => c.name === trimmedName)
  const item = {
    name: trimmedName,
    programManagers: programManagers || [],
    sectors: sectors || [],
    districts: districts || [],
    isAswadException: !!isAswadException,
    aliases: aliases || [],
    updatedAt: new Date().toISOString()
  }

  if (existingIdx >= 0) {
    config.customContractors[existingIdx] = item
  } else {
    config.customContractors.push(item)
  }

  saveContractorsConfig(config)

  // Re-run pipeline to immediately re-analyze reports with the new contractor rules
  try {
    await buildData()
  } catch (e) {
    console.warn('Pipeline rebuild warning:', e.message)
  }

  res.json({ success: true, contractor: item, message: 'تم حفظ المقاول وإعادة تحليل البلاغات' })
})

// Delete custom contractor
app.delete('/api/contractors/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name)
  const config = loadContractorsConfig()
  config.customContractors = config.customContractors.filter(c => c.name !== name)
  saveContractorsConfig(config)

  try {
    await buildData()
  } catch (e) {
    console.warn('Pipeline rebuild warning:', e.message)
  }

  res.json({ success: true, message: 'تم حذف المقاول وإعادة تحليل البلاغات' })
})

// Export executive pending reports Excel
app.get('/api/export/pending-excel', (req, res) => {
  const filePath = path.join(__dirname, '../../XLSX/تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx')
  if (fs.existsSync(filePath)) {
    res.download(path.resolve(filePath), 'تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx')
  } else {
    res.status(404).json({ error: 'ملف الإكسيل غير موجود' })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// SPA Fallback Route - serve index.html for all non-API routes
// This allows React Router to handle client-side routing
app.get('*', (req, res) => {
  const fallbackIndexPath = path.join(distPath, 'index.html')
  if (fs.existsSync(fallbackIndexPath)) {
    res.sendFile(path.resolve(fallbackIndexPath))
  } else {
    res.status(404).json({
      error: 'Not Found',
      message: 'Frontend build not found. Run "npm run build" first.',
      hint: 'npm run build'
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api/*`)
  console.log(`🌐 Frontend available at http://localhost:${PORT}/`)
})
