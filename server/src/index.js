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

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}))
app.use(express.json())

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

// Get layers (GeoJSON)
app.get('/api/layers', (req, res) => {
  const layers = loadGeneratedData('layers.json')
  if (!layers) {
    return res.json({
      type: 'FeatureCollection',
      features: []
    })
  }

  // Merge water and sanitation layers
  const allFeatures = [
    ...(layers.water?.features || []),
    ...(layers.sanitation?.features || [])
  ]

  res.json({
    type: 'FeatureCollection',
    features: allFeatures
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
  const { reportId, projectId, excluded, reason } = req.body

  const overridesPath = path.join(__dirname, '../data/overrides.json')
  let overrides = []

  if (fs.existsSync(overridesPath)) {
    overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
  }

  // Remove existing override for this report
  overrides = overrides.filter(o => o.reportId !== reportId)

  // Add new override
  if (projectId || excluded) {
    overrides.push({
      reportId,
      projectId: projectId || null,
      excluded: excluded || false,
      reason: reason || null,
      timestamp: new Date().toISOString()
    })
  }

  fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2))
  res.json({ success: true, overrides })
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`)
  console.log(`📊 API endpoints available at http://localhost:${PORT}/api/*`)
})
