import { normalizeArabic, similarity } from './normalize.js'
import * as turf from '@turf/turf'

const SIMILARITY_THRESHOLD = 0.82
const MAINTENANCE_KEYWORDS = ['طارئ', 'انكسار', 'صيانة', 'دورية', 'إصلاح']
const ACTIVE_STATUSES = ['جاري', 'مسلم ابتدائي']

function isMaintenanceReport(report) {
  const text = (report.description + ' ' + report.centerComment).toLowerCase()
  return MAINTENANCE_KEYWORDS.some(kw => text.includes(kw))
}

function matchContractor(reportContractor, projectContractors) {
  const normalized = normalizeArabic(reportContractor).toLowerCase()

  for (const projectContractor of projectContractors) {
    const projNorm = normalizeArabic(projectContractor).toLowerCase()
    if (similarity(normalized, projNorm) >= SIMILARITY_THRESHOLD) {
      return true
    }
  }

  return false
}

function matchDistrict(reportDistrict, projectScope) {
  const repNorm = normalizeArabic(reportDistrict).toLowerCase()
  const projNorm = normalizeArabic(projectScope).toLowerCase()

  // Direct match or substring match
  return projNorm.includes(repNorm) || repNorm.includes(projNorm)
}

function pointInBounds(point, geometry) {
  try {
    if (!point || !point[0] || !point[1]) return false

    const pt = turf.point(point)

    if (geometry.type === 'Polygon') {
      return turf.booleanPointInPolygon(pt, geometry)
    } else if (geometry.type === 'LineString') {
      // Check if point is within distance of line
      const distance = turf.pointToLineDistance(pt, geometry, { units: 'kilometers' })
      return distance < 0.25 // 250 meters
    }
  } catch (e) {
    console.error('Error checking spatial bounds:', e)
  }

  return false
}

export function matchReportToProject(report, projects, geoJsonData) {
  const candidates = []

  // Filter to only active projects
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.includes(p.status))

  for (const project of activeProjects) {
    let confidence = 0
    let reason = []

    // 1. Spatial check (highest priority)
    let spatialMatch = false
    if (report.longitude && report.latitude && report.longitude !== 0 && report.latitude !== 0) {
      const point = [report.longitude, report.latitude]

      // Check against KMZ geometries
      if (geoJsonData) {
        const allFeatures = [
          ...(geoJsonData.water?.features || []),
          ...(geoJsonData.sanitation?.features || [])
        ]

        for (const feature of allFeatures) {
          if (feature.properties?.name?.includes(project.name)) {
            if (pointInBounds(point, feature.geometry)) {
              spatialMatch = true
              confidence = 0.95 // Very high confidence
              reason.push('spatial:kml')
              break
            }
          }
        }
      }
    }

    // 2. Contractor match
    if (!spatialMatch && report.contractorName && report.contractorName.toUpperCase() !== 'NULL') {
      if (matchContractor(report.contractorName, [project.contractor])) {
        confidence = Math.max(confidence, 0.70)
        reason.push('contractor')
      }
    }

    // 3. District match
    if (report.district && matchDistrict(report.district, project.scope)) {
      if (confidence > 0) {
        confidence = Math.max(confidence, 0.75) // contractor + district
        reason.push('district')
      } else {
        confidence = 0.55
        reason.push('district_only')
      }
    }

    if (confidence > 0) {
      candidates.push({
        project,
        confidence,
        reason: reason.join(',')
      })
    }
  }

  // Sort by confidence
  candidates.sort((a, b) => b.confidence - a.confidence)

  // Return best match if confidence > 0.5
  if (candidates.length > 0 && candidates[0].confidence > 0.5) {
    const best = candidates[0]
    return {
      matched: true,
      project: best.project,
      confidence: best.confidence,
      reason: best.reason,
      shouldReview: best.confidence < 0.80
    }
  }

  return {
    matched: false,
    confidence: 0,
    reason: 'no_match'
  }
}

export function processReports(reports, projects, geoJsonData, overrides) {
  const processed = []

  for (const report of reports) {
    // Skip archived
    if (report.status === 'تمت المعالجة') {
      processed.push({
        ...report,
        archived: true,
        matched: false,
        confidence: 0
      })
      continue
    }

    // Check for maintenance
    const isMaintenance = isMaintenanceReport(report)

    // Check override
    const override = overrides?.find(o => o.reportId === report.id)

    let result
    if (override?.excluded) {
      result = {
        ...report,
        matched: false,
        excluded: true,
        excludedReason: override.reason || 'manual',
        confidence: 0,
        isMaintenance
      }
    } else if (override?.projectId) {
      const proj = projects.find(p => p.id === override.projectId)
      result = {
        ...report,
        matched: !!proj,
        project: proj,
        confidence: 0.5,
        reason: 'manual_override',
        isMaintenance
      }
    } else {
      const match = matchReportToProject(report, projects, geoJsonData)
      result = {
        ...report,
        ...match,
        isMaintenance
      }
    }

    // Calculate age in days
    const referenceDate = new Date(report.dateIncident || report.dateReport || '2026-09-18')
    const today = new Date('2026-09-18') // Fixed date for consistency
    result.ageDays = Math.floor((today - referenceDate) / (1000 * 60 * 60 * 24))

    processed.push(result)
  }

  return processed
}
