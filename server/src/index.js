import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import multer from 'multer'
import { buildData, calculateStats, createManagersData, normalizeManagerName } from './pipeline/buildData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Atomic write helper to prevent data corruption
function safeWriteJsonSync(filePath, data) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

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
    const uploadsDir = path.join(__dirname, '../../uploads')
    const uploadedReportsCopy = path.join(xlsxDir, 'reports.xlsx')

    // 1. حذف الملف المحفوظ سابقاً لضمان عدم بقاء أي نسخة قديمة
    if (fs.existsSync(uploadedReportsCopy)) {
      try {
        fs.unlinkSync(uploadedReportsCopy)
        console.log('🗑️ تم حذف ملف البلاغات المحفوظ السابق')
      } catch (e) {
        console.warn('Could not remove previous reports.xlsx:', e.message)
      }
    }

    // تنظيف مجلد uploads
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir)
        for (const f of files) {
          const p = path.join(uploadsDir, f)
          if (p !== uploadedPath) {
            try { fs.unlinkSync(p) } catch (e) {}
          }
        }
      } catch (e) {}
    }

    // 2. اعتماد الملف الجديد مباشرة كملف فعال
    if (!fs.existsSync(xlsxDir)) {
      fs.mkdirSync(xlsxDir, { recursive: true })
    }
    fs.copyFileSync(uploadedPath, uploadedReportsCopy)
    try {
      fs.unlinkSync(uploadedPath) // حذف الملف المؤقت
    } catch (e) {}

    // 3. معالجة الملف الجديد مباشرة وتحديث السجلات
    console.log(`📤 جاري معالجة ملف الإكسيل الجديد مباشرة: ${uploadedReportsCopy}`)
    const result = await buildData(uploadedReportsCopy)

    // 4. إعادة توليد التقرير التنفيذي فوراً بالبيانات الجديدة
    await runExecutiveExcelExport()

    res.json({
      success: true,
      message: 'تم استلام الملف الجديد وحذف الملف المحفوظ السابق وإعادة معالجة كافة البيانات بنجاح',
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
  const { reportId, projectId, excluded, reason, customContractor, customProgramManager, customSector } = req.body
  const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

  const overridesPath = path.join(__dirname, '../data/overrides.json')
  const overridesBackupPath = path.join(__dirname, '../data/overrides_backup.json')
  const overridesMap = new Map()

  if (fs.existsSync(overridesBackupPath)) {
    try {
      const b = JSON.parse(fs.readFileSync(overridesBackupPath, 'utf-8'))
      if (Array.isArray(b)) {
        b.forEach(o => {
          const k = normalizeId(o.reportId)
          if (k) overridesMap.set(k, o)
        })
      }
    } catch (e) {}
  }

  if (fs.existsSync(overridesPath)) {
    try {
      const p = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
      if (Array.isArray(p)) {
        p.forEach(o => {
          const k = normalizeId(o.reportId)
          if (k) overridesMap.set(k, { ...overridesMap.get(k), ...o })
        })
      }
    } catch (e) {}
  }

  let overrides = Array.from(overridesMap.values())

  // Find existing report to capture secondary keys (license, coordinates)
  const reportsPath = path.join(__dirname, '../data/generated/reports.json')
  const projectsPath = path.join(__dirname, '../data/generated/projects.json')
  let existingReport = null
  let allProjects = []

  if (fs.existsSync(reportsPath)) {
    try {
      const currentReports = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'))
      existingReport = currentReports.find(r => normalizeId(r.id) === normalizeId(reportId))
    } catch (e) {}
  }
  if (fs.existsSync(projectsPath)) {
    try {
      allProjects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))
    } catch (e) {}
  }

  // Find existing or create new using normalized ID
  const existingIndex = overrides.findIndex(o => normalizeId(o.reportId) === normalizeId(reportId))
  const entry = existingIndex >= 0 ? { ...overrides[existingIndex] } : { reportId }

  if (excluded !== undefined) {
    entry.excluded = !!excluded
    if (entry.excluded) {
      entry.projectId = null
      entry.customProgramManager = null
      entry.reason = reason || 'مستبعد من نطاق مشاريع مدير البرنامج'
    }
  }

  if (entry.excluded) {
    entry.projectId = null
    entry.customProgramManager = null
    if (customContractor !== undefined) entry.customContractor = customContractor
    if (customSector !== undefined) entry.customSector = customSector
  } else {
    if (projectId !== undefined) entry.projectId = projectId || null
    if (reason !== undefined) entry.reason = reason
    if (customContractor !== undefined) entry.customContractor = customContractor
    if (customProgramManager !== undefined) entry.customProgramManager = customProgramManager
    if (customSector !== undefined) entry.customSector = customSector

    // If contractor modified and no explicit project given, find matching project for contractor
    if (customContractor && !entry.projectId && allProjects.length > 0) {
      const cTarget = String(customContractor).trim()
      const foundProj = allProjects.find(p => {
        const cPName = (p.contractor || '').trim()
        return cPName && (cPName === cTarget || cPName.includes(cTarget) || cTarget.includes(cPName))
      })
      if (foundProj) {
        entry.projectId = foundProj.id
      }
    }
  }
  
  // Secondary persistent keys
  entry.licenseNumber = req.body.licenseNumber || existingReport?.licenseNumber || entry.licenseNumber || ''
  if (existingReport?.latitude) entry.latitude = existingReport.latitude
  if (existingReport?.longitude) entry.longitude = existingReport.longitude
  if (existingReport?.district) entry.district = existingReport.district
  entry.isLocked = true
  entry.timestamp = new Date().toISOString()

  if (existingIndex >= 0) {
    overrides[existingIndex] = entry
  } else {
    overrides.push(entry)
  }

  safeWriteJsonSync(overridesPath, overrides)
  // Backup file for permanent persistence (uses overridesBackupPath declared above)
  try {
    safeWriteJsonSync(overridesBackupPath, overrides)
  } catch (e) {
    console.warn('Warning backing up overrides:', e.message)
  }

  // Update reports.json, stats.json, and managers.json immediately
  let updatedReport = null

  if (fs.existsSync(reportsPath)) {
    try {
      const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'))
      const rIdx = reports.findIndex(r => normalizeId(r.id) === normalizeId(reportId))
      if (rIdx >= 0) {
        if (entry.excluded) {
          reports[rIdx].excluded = true
          reports[rIdx].matched = false
          reports[rIdx].project = null
          reports[rIdx].excludedReason = entry.reason || reason || 'مستبعد من نطاق مشاريع مدير البرنامج'
          reports[rIdx].actionCategory = 'مستبعد'
          if (customContractor !== undefined) {
            reports[rIdx].contractorName = customContractor
            reports[rIdx].customContractor = customContractor
          }
          if (customSector !== undefined) {
            reports[rIdx].sector = customSector
          }
        } else {
          reports[rIdx].excluded = false
          if (customContractor !== undefined) {
            reports[rIdx].contractorName = customContractor
            reports[rIdx].customContractor = customContractor
            reports[rIdx].isLocked = true
            reports[rIdx].lockedContractor = true
          }
          if (entry.projectId) {
            const proj = allProjects.find(p => String(p.id).trim() === String(entry.projectId).trim())
            if (proj) {
              reports[rIdx].project = { ...proj }
              reports[rIdx].matched = true
              const name = proj.name || ''
              const sub = proj.subProgram || ''
              reports[rIdx].sector = customSector || ((name.includes('صرف') || sub.includes('صرف')) ? 'صرف' : 'مياه')
            }
          } else if (customSector) {
            reports[rIdx].sector = customSector
          }
          if (customProgramManager && reports[rIdx].project) {
            reports[rIdx].project.programManager = normalizeManagerName(customProgramManager)
          }
          if (reports[rIdx].status === 'تحت معالجة المقاول') {
            reports[rIdx].actionCategory = 'تحت معالجة المقاول'
          } else if (reports[rIdx].status === 'تمت المعالجة') {
            reports[rIdx].actionCategory = 'تمت المعالجة'
          } else {
            reports[rIdx].actionCategory = 'تحت الإجراء'
          }
        }
        safeWriteJsonSync(reportsPath, reports)
        updatedReport = reports[rIdx]

        // Recompute stats and managers so dashboard and manager cards update immediately
        if (fs.existsSync(projectsPath)) {
          const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))
          const updatedStats = calculateStats(reports, projects)
          const updatedManagers = createManagersData(projects, reports)
          safeWriteJsonSync(path.join(__dirname, '../data/generated/stats.json'), updatedStats)
          safeWriteJsonSync(path.join(__dirname, '../data/generated/managers.json'), updatedManagers)
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

// ===== Contractor Directory Endpoints =====
const contractorDirectoryPath = path.join(__dirname, '../data/contractor_directory.json')
const contractorDirectoryBackupPath = path.join(__dirname, '../data/contractor_directory_backup.json')
const contractorProfilesPath = path.join(__dirname, '../data/contractor_profiles.json')
const contractorProfilesBackupPath = path.join(__dirname, '../data/contractor_profiles_backup.json')

function loadContractorDirectory() {
  const mergedMap = new Map()

  const readAndMerge = (filePath) => {
    if (!fs.existsSync(filePath)) return
    try {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (!item || !item.id) return
          const k = String(item.id).trim()
          if (!mergedMap.has(k)) {
            mergedMap.set(k, item)
          } else {
            const prev = mergedMap.get(k)
            mergedMap.set(k, {
              ...prev,
              ...item,
              crNumber: (item.crNumber && item.crNumber.trim()) || prev.crNumber || '',
              unifiedNumber: (item.unifiedNumber && item.unifiedNumber.trim()) || prev.unifiedNumber || '',
              managerName: (item.managerName && item.managerName.trim()) || prev.managerName || '',
              managerPhone: (item.managerPhone && item.managerPhone.trim()) || prev.managerPhone || '',
              managerEmail: (item.managerEmail && item.managerEmail.trim()) || prev.managerEmail || ''
            })
          }
        })
      }
    } catch (e) {
      console.error(`Error loading ${filePath}:`, e.message)
    }
  }

  // Read backup first, then primary
  readAndMerge(contractorDirectoryBackupPath)
  readAndMerge(contractorDirectoryPath)

  return Array.from(mergedMap.values())
}

function saveContractorDirectory(data) {
  const dir = path.dirname(contractorDirectoryPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(contractorDirectoryPath, JSON.stringify(data, null, 2))
  try {
    fs.writeFileSync(contractorDirectoryBackupPath, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error saving contractor_directory_backup:', e.message)
  }
}

function loadContractorProfiles() {
  let profiles = {}
  if (fs.existsSync(contractorProfilesBackupPath)) {
    try {
      profiles = { ...profiles, ...JSON.parse(fs.readFileSync(contractorProfilesBackupPath, 'utf-8')) }
    } catch (e) {}
  }
  if (fs.existsSync(contractorProfilesPath)) {
    try {
      profiles = { ...profiles, ...JSON.parse(fs.readFileSync(contractorProfilesPath, 'utf-8')) }
    } catch (e) {}
  }
  return profiles
}

function saveContractorProfiles(data) {
  const dir = path.dirname(contractorProfilesPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(contractorProfilesPath, JSON.stringify(data, null, 2))
  try {
    fs.writeFileSync(contractorProfilesBackupPath, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error saving contractor_profiles_backup:', e.message)
  }
}

// Get contractor directory
app.get('/api/contractor-directory', (req, res) => {
  let directory = loadContractorDirectory()
  const profiles = loadContractorProfiles()

  // If empty, initialize from projects.json
  if (directory.length === 0) {
    const projects = loadGeneratedData('projects.json') || []
    directory = projects.map(p => {
      const cName = (p.contractor || '').trim() || 'غير محدد'
      const prof = profiles[cName] || {}
      return {
        id: String(p.id),
        contractorName: cName,
        projectNumber: p.operationNumber || p.id || '-',
        projectName: p.name || '-',
        projectLocation: p.scope || p.subProgram || '-',
        programManager: p.programManager || '-',
        projectManager: p.projectManager || '-',
        crNumber: prof.crNumber || '',
        unifiedNumber: prof.unifiedNumber || '',
        managerName: prof.managerName || '',
        managerPhone: prof.managerPhone || '',
        managerEmail: prof.managerEmail || '',
        status: p.status || 'جاري',
        source: 'nwc_project'
      }
    })
    saveContractorDirectory(directory)
  }

  // Calculate statistics
  const uniqueContractors = new Set()
  let completedCount = 0

  directory.forEach(item => {
    if (item.contractorName && item.contractorName !== 'غير محدد' && item.contractorName !== '-') {
      uniqueContractors.add(item.contractorName)
    }
    const hasCR = Boolean(item.crNumber && item.crNumber.trim())
    const hasContact = Boolean(item.managerPhone && item.managerPhone.trim()) || Boolean(item.managerEmail && item.managerEmail.trim()) || Boolean(item.managerName && item.managerName.trim())
    if (hasCR || hasContact) {
      completedCount++
    }
  })

  const programManagers = Array.from(new Set(directory.map(d => d.programManager).filter(m => m && m !== '-'))).sort()

  res.json({
    directory,
    stats: {
      totalEntries: directory.length,
      uniqueContractors: uniqueContractors.size,
      completedCount,
      pendingCount: directory.length - completedCount
    },
    programManagers
  })
})

// Update an entry in contractor directory
app.post('/api/contractor-directory/update', (req, res) => {
  const {
    id,
    contractorName,
    projectNumber,
    projectName,
    projectLocation,
    programManager,
    projectManager,
    crNumber,
    unifiedNumber,
    managerName,
    managerPhone,
    managerEmail,
    applyToAllContractorProjects
  } = req.body

  if (!id) {
    return res.status(400).json({ error: 'معرف السجل مطلوب' })
  }

  const directory = loadContractorDirectory()
  const idx = directory.findIndex(d => String(d.id) === String(id))

  if (idx === -1) {
    return res.status(404).json({ error: 'السجل غير موجود' })
  }

  const cleanVal = (v) => (v !== undefined && v !== null ? String(v).trim() : '')

  const updatedItem = {
    ...directory[idx],
    contractorName: cleanVal(contractorName) || directory[idx].contractorName,
    projectNumber: cleanVal(projectNumber) || directory[idx].projectNumber,
    projectName: cleanVal(projectName) || directory[idx].projectName,
    projectLocation: cleanVal(projectLocation) || directory[idx].projectLocation,
    programManager: cleanVal(programManager) || directory[idx].programManager,
    projectManager: cleanVal(projectManager) || directory[idx].projectManager,
    crNumber: cleanVal(crNumber),
    unifiedNumber: cleanVal(unifiedNumber),
    managerName: cleanVal(managerName),
    managerPhone: cleanVal(managerPhone),
    managerEmail: cleanVal(managerEmail),
    updatedAt: new Date().toISOString()
  }

  directory[idx] = updatedItem

  const targetContractor = updatedItem.contractorName
  if (targetContractor && targetContractor !== 'غير محدد' && targetContractor !== '-') {
    const profiles = loadContractorProfiles()
    const pPrev = profiles[targetContractor] || {}
    profiles[targetContractor] = {
      crNumber: updatedItem.crNumber || pPrev.crNumber || '',
      unifiedNumber: updatedItem.unifiedNumber || pPrev.unifiedNumber || '',
      managerName: updatedItem.managerName || pPrev.managerName || '',
      managerPhone: updatedItem.managerPhone || pPrev.managerPhone || '',
      managerEmail: updatedItem.managerEmail || pPrev.managerEmail || '',
      updatedAt: new Date().toISOString()
    }
    saveContractorProfiles(profiles)

    if (applyToAllContractorProjects) {
      directory.forEach((item, i) => {
        if (item.contractorName === targetContractor && i !== idx) {
          directory[i] = {
            ...item,
            crNumber: updatedItem.crNumber || item.crNumber || '',
            unifiedNumber: updatedItem.unifiedNumber || item.unifiedNumber || '',
            managerName: updatedItem.managerName || item.managerName || '',
            managerPhone: updatedItem.managerPhone || item.managerPhone || '',
            managerEmail: updatedItem.managerEmail || item.managerEmail || '',
            updatedAt: new Date().toISOString()
          }
        }
      })
    }
  }

  saveContractorDirectory(directory)

  res.json({ success: true, item: updatedItem, message: 'تم حفظ وتحديث بيانات المقاول بنجاح' })
})

// Add new project/contractor record
app.post('/api/contractor-directory/add', (req, res) => {
  const {
    contractorName,
    projectNumber,
    projectName,
    projectLocation,
    programManager,
    projectManager,
    crNumber,
    unifiedNumber,
    managerName,
    managerPhone,
    managerEmail
  } = req.body

  if (!contractorName || !contractorName.trim()) {
    return res.status(400).json({ error: 'اسم المقاول مطلوب' })
  }

  const cleanVal = (v) => (v !== undefined && v !== null ? String(v).trim() : '')
  const directory = loadContractorDirectory()

  const newItem = {
    id: `manual_${Date.now()}`,
    contractorName: cleanVal(contractorName),
    projectNumber: cleanVal(projectNumber) || '-',
    projectName: cleanVal(projectName) || '-',
    projectLocation: cleanVal(projectLocation) || '-',
    programManager: cleanVal(programManager) || '-',
    projectManager: cleanVal(projectManager) || '-',
    crNumber: cleanVal(crNumber),
    unifiedNumber: cleanVal(unifiedNumber),
    managerName: cleanVal(managerName),
    managerPhone: cleanVal(managerPhone),
    managerEmail: cleanVal(managerEmail),
    status: 'جاري',
    source: 'manual_added',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  directory.unshift(newItem)
  saveContractorDirectory(directory)

  if (newItem.contractorName && (newItem.crNumber || newItem.unifiedNumber || newItem.managerPhone || newItem.managerEmail || newItem.managerName)) {
    const profiles = loadContractorProfiles()
    const pPrev = profiles[newItem.contractorName] || {}
    profiles[newItem.contractorName] = {
      crNumber: newItem.crNumber || pPrev.crNumber || '',
      unifiedNumber: newItem.unifiedNumber || pPrev.unifiedNumber || '',
      managerName: newItem.managerName || pPrev.managerName || '',
      managerPhone: newItem.managerPhone || pPrev.managerPhone || '',
      managerEmail: newItem.managerEmail || pPrev.managerEmail || '',
      updatedAt: new Date().toISOString()
    }
    saveContractorProfiles(profiles)
  }

  res.json({ success: true, item: newItem, message: 'تمت إضافة المشروع والمقاول بنجاح' })
})

// Delete manual contractor directory record
app.delete('/api/contractor-directory/:id', (req, res) => {
  const id = req.params.id
  let directory = loadContractorDirectory()
  const prevLen = directory.length
  directory = directory.filter(d => String(d.id) !== String(id))

  if (directory.length === prevLen) {
    return res.status(404).json({ error: 'السجل غير موجود' })
  }

  saveContractorDirectory(directory)
  res.json({ success: true, message: 'تم حذف السجل بنجاح' })
})

// Export contractor directory Excel
app.get('/api/export/contractor-directory-excel', (req, res) => {
  const scriptPath = path.join(__dirname, '../../scripts/export_contractors_directory_excel.py')
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  exec(`"${pythonCmd}" "${scriptPath}"`, (error) => {
    if (error) {
      console.error('Error generating contractor directory excel:', error.message)
      return res.status(500).json({ error: 'فشل في تصدير ملف الإكسيل', details: error.message })
    }
    const filePath = path.join(__dirname, '../../XLSX/سجل_بيانات_مقاولي_المشاريع_NWC.xlsx')
    if (fs.existsSync(filePath)) {
      res.download(path.resolve(filePath), 'سجل_بيانات_مقاولي_المشاريع_NWC.xlsx')
    } else {
      res.status(500).json({ error: 'فشل في تصدير ملف الإكسيل' })
    }
  })
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
