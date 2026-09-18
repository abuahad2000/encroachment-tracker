import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'
import { promisify } from 'util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const execAsync = promisify(exec)

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
