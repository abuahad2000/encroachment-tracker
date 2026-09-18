import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const execAsync = promisify(exec)

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
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const uploadedPath = req.file.path
    const xlsxDir = path.join(__dirname, '../../XLSX')
    const targetPath = path.join(xlsxDir, 'بلاغات تعدي مقاولي شركة المياه الوطنية 12 سبتمبر.xlsx')

    // Create XLSX directory if it doesn't exist
    if (!fs.existsSync(xlsxDir)) {
      fs.mkdirSync(xlsxDir, { recursive: true })
    }

    // Replace the old file with the new one
    fs.copyFileSync(uploadedPath, targetPath)
    fs.unlinkSync(uploadedPath) // Delete temp file

    // Trigger data rebuild
    console.log('📤 New reports file uploaded, rebuilding data...')
    const buildScript = path.join(__dirname, 'pipeline/buildData.js')
    await execAsync(`node ${buildScript}`)

    res.json({
      success: true,
      message: 'File uploaded and data rebuilt successfully',
      file: req.file.originalname,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('❌ Error uploading file:', err)
    res.status(500).json({ error: 'Failed to upload file', details: err.message })
  }
})

// Save override
app.post('/api/override', (req, res) => {
  const { reportId, projectId, excluded, reason, customContractor } = req.body

  const overridesPath = path.join(__dirname, '../data/overrides.json')
  let overrides = []

  if (fs.existsSync(overridesPath)) {
    try {
      overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
    } catch (e) {
      overrides = []
    }
  }

  // Find existing or create new
  const existingIndex = overrides.findIndex(o => o.reportId === reportId)
  const entry = existingIndex >= 0 ? { ...overrides[existingIndex] } : { reportId }

  if (projectId !== undefined) entry.projectId = projectId || null
  if (excluded !== undefined) entry.excluded = !!excluded
  if (reason !== undefined) entry.reason = reason
  if (customContractor !== undefined) entry.customContractor = customContractor

  entry.timestamp = new Date().toISOString()

  if (existingIndex >= 0) {
    overrides[existingIndex] = entry
  } else {
    overrides.push(entry)
  }

  fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2))

  // Update reports.json in generated data directly for immediate response
  const reportsPath = path.join(__dirname, '../data/generated/reports.json')
  if (fs.existsSync(reportsPath)) {
    try {
      const reports = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'))
      const rIdx = reports.findIndex(r => r.id === reportId)
      if (rIdx >= 0) {
        if (customContractor !== undefined) {
          reports[rIdx].contractorName = customContractor
          reports[rIdx].customContractor = customContractor
        }
        if (projectId !== undefined) {
          const projectsPath = path.join(__dirname, '../data/generated/projects.json')
          if (fs.existsSync(projectsPath)) {
            const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'))
            const proj = projects.find(p => String(p.id) === String(projectId))
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
        if (req.body.customProgramManager && reports[rIdx].project) {
          reports[rIdx].project.programManager = req.body.customProgramManager
        }
        if (excluded !== undefined) {
          reports[rIdx].excluded = !!excluded
          if (excluded) {
            reports[rIdx].matched = false
            reports[rIdx].excludedReason = reason || 'user_excluded'
          }
        }
        fs.writeFileSync(reportsPath, JSON.stringify(reports, null, 2))
      }
    } catch (e) {
      console.error('Error updating reports.json with override:', e.message)
    }
  }

  res.json({ success: true, overrides, updatedReportId: reportId })
})

// Refresh data
app.post('/api/refresh-data', async (req, res) => {
  try {
    console.log('🔄 Starting data refresh...')

    // Run build-data script
    const buildScript = path.join(__dirname, 'pipeline/buildData.js')
    await execAsync(`node ${buildScript}`)

    console.log('✅ Data refresh completed')
    res.json({ success: true, message: 'Data refreshed successfully' })
  } catch (err) {
    console.error('❌ Error refreshing data:', err)
    res.status(500).json({ error: 'Failed to refresh data', details: err.message })
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
