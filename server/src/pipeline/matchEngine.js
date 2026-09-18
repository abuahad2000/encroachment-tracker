import { normalizeArabic, similarity } from './normalize.js'
import * as turf from '@turf/turf'

const SIMILARITY_THRESHOLD = 0.82
const MAINTENANCE_KEYWORDS = ['طارئ', 'انكسار', 'صيانة', 'دورية', 'إصلاح']
const ACTIVE_STATUSES = ['جاري', 'مسلم ابتدائي']

// المقاولون المعتمدون لمشاريع م. عبدالله الأسود (تغطية كامل مدينة الرياض كاستثناء معتمد)
const ABDULLAH_AL_ASWAD_CONTRACTORS = [
  'مجموعة سعد علي العيسى للمقاولات',
  'سعد علي العيسى',
  'مؤسسة العرين للمقاولات',
  'العرين',
  'شركة الاومير للتجارة والمقاولات',
  'الاومير',
  'مؤسسة ثليل للمقاولات',
  'ثليل',
  'شركة صلت للمقاولات',
  'صلت'
]

function isMaintenanceReport(report) {
  const text = (report.description + ' ' + report.centerComment).toLowerCase()
  return MAINTENANCE_KEYWORDS.some(kw => text.includes(kw))
}

// فحص مقاول الأعمال المدنية
export function isCivilWorksContractor(contractorName) {
  if (!contractorName) return false
  const norm = normalizeArabic(contractorName).toLowerCase()
  return norm.includes('اعمال مدنيه') || norm.includes('الاعمال المدنيه')
}

function matchContractor(reportContractor, projectContractors) {
  if (!reportContractor || reportContractor.toUpperCase() === 'NULL') return false
  const normalized = normalizeArabic(reportContractor).toLowerCase()

  for (const projectContractor of projectContractors) {
    if (!projectContractor) continue
    const projNorm = normalizeArabic(projectContractor).toLowerCase()
    if (normalized.includes(projNorm) || projNorm.includes(normalized) || similarity(normalized, projNorm) >= SIMILARITY_THRESHOLD) {
      return true
    }
  }

  return false
}

export function matchDistrict(reportDistrict, projectScope) {
  if (!reportDistrict || !projectScope) return false
  const repNorm = normalizeArabic(reportDistrict).toLowerCase()
  const projNorm = normalizeArabic(projectScope).toLowerCase()

  // Direct match or substring match
  return projNorm.includes(repNorm) || repNorm.includes(projNorm)
}

function computeBBox(geometry) {
  if (!geometry || !geometry.coordinates) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      for (const pt of ring) {
        if (pt[0] < minX) minX = pt[0]
        if (pt[0] > maxX) maxX = pt[0]
        if (pt[1] < minY) minY = pt[1]
        if (pt[1] > maxY) maxY = pt[1]
      }
    }
    return [minX, minY, maxX, maxY]
  } else if (geometry.type === 'LineString') {
    for (const pt of geometry.coordinates) {
      if (pt[0] < minX) minX = pt[0]
      if (pt[0] > maxX) maxX = pt[0]
      if (pt[1] < minY) minY = pt[1]
      if (pt[1] > maxY) maxY = pt[1]
    }
    return [minX, minY, maxX, maxY]
  }
  return null
}

function pointInBounds(point, geometry, bbox) {
  try {
    if (!point || !point[0] || !point[1]) return false

    // Quick bounding box check
    if (bbox) {
      if (point[0] < bbox[0] || point[0] > bbox[2] || point[1] < bbox[1] || point[1] > bbox[3]) {
        return false
      }
    }

    const pt = turf.point(point)

    if (geometry.type === 'Polygon') {
      return turf.booleanPointInPolygon(pt, geometry)
    } else if (geometry.type === 'LineString') {
      const distance = turf.pointToLineDistance(pt, geometry, { units: 'kilometers' })
      return distance < 0.25 // 250 meters
    }
  } catch (e) {
    // ignore
  }

  return false
}

function matchProjectToFeature(project, feat) {
  const featName = normalizeArabic(feat.properties?.name || '').toLowerCase()
  const projName = normalizeArabic(project.name).toLowerCase()
  const featOp = feat.properties?.operationNumber

  // 1. تطابق رقم العملية (Operation Number)
  if (featOp && project.operationNumber && (featOp === project.operationNumber || featName.includes(project.operationNumber))) {
    return true
  }

  // 2. تطابق الحي/النطاق شرط أساسي لمنع تداخل العقود
  const cleanScope = project.scope ? normalizeArabic(project.scope).replace('حي ', '').trim().toLowerCase() : ''
  if (cleanScope && !featName.includes(cleanScope)) {
    return false
  }

  // 3. التمييز بين المراحل (المرحلة الأولى vs المرحلة الثانية)
  const projHasP1 = projName.includes('مرحله اولي') || projName.includes('المرحله الاولي')
  const projHasP2 = projName.includes('مرحله ثانيه') || projName.includes('المرحله الثانيه')
  const featHasP1 = featName.includes('مرحله اولي') || featName.includes('المرحله الاولي')
  const featHasP2 = featName.includes('مرحله ثانيه') || featName.includes('المرحله الثانيه')

  if (projHasP1 && featHasP2) return false
  if (projHasP2 && featHasP1) return false

  // 4. فحص التشابه في اسم المشروع
  if (!cleanScope) {
    return featName.includes(projName) || projName.includes(featName) || similarity(featName, projName) >= 0.85
  }

  return true
}

export function matchReportToProject(report, activeProjects, prelinkedProjects) {
  const isCivilWorks = isCivilWorksContractor(report.contractorName)

  // قاعدة المقاول "الأعمال المدنية": إذا لم يتطابق الحي مع المشروع الجاري يجعله مستبعداً فوراً
  if (isCivilWorks) {
    const civilProj = activeProjects.find(p => p.id === '57' || p.id === 57 || matchContractor('شركة الأعمال المدنية', [p.contractor]))
    const districtMatches = report.district && civilProj && matchDistrict(report.district, civilProj.scope)
    if (!districtMatches) {
      return {
        matched: false,
        excluded: true,
        excludedReason: 'عدم تطابق الحي مع نطاق المشروع (أعمال مدنية/تشغيل وصيانة)',
        confidence: 0,
        reason: 'civil_works_district_mismatch'
      }
    }
  }

  const candidates = []
  const hasCoords = report.longitude && report.latitude && report.longitude !== 0 && report.latitude !== 0
  const point = hasCoords ? [report.longitude, report.latitude] : null

  for (const project of activeProjects) {
    let confidence = 0
    let reason = []

    // 1. الفحص المكاني مع الطبقات الجارية المرتبطة بالمشروع مسبقاً
    let spatialMatch = false
    if (point && project._kmzFeatures?.length > 0) {
      for (const feat of project._kmzFeatures) {
        if (pointInBounds(point, feat.geometry, feat._bbox)) {
          const hasContractor = report.contractorName && report.contractorName.toUpperCase() !== 'NULL'
          const contractorMatched = hasContractor ? matchContractor(report.contractorName, [project.contractor]) : true
          const districtMatches = !report.district || matchDistrict(report.district, project.scope)

          if (contractorMatched && districtMatches) {
            spatialMatch = true
            confidence = 0.95
            reason.push('spatial:kml')
            break
          } else if (!hasContractor && districtMatches) {
            spatialMatch = true
            confidence = 0.85
            reason.push('spatial:kml+district')
            break
          }
        }
      }
    }

    // 2. المطابقة التعاقدية الصارمة للمقاول والحي
    if (!spatialMatch && report.contractorName && report.contractorName.toUpperCase() !== 'NULL') {
      // قاعدة مشاريع المحافظات (خارج مدينة الرياض): الربط بالمقاول المتوفر في بيانات الإكسيل
      const isGovProject = project.subProgram?.includes('المحافظات')
      const isGovReport = report.city && !report.city.includes('الرياض')

      if (isGovReport && isGovProject) {
        const contractorMatched = matchContractor(report.contractorName, [project.contractor])
        if (contractorMatched) {
          const cleanCity = normalizeArabic(report.city).replace('محافظة', '').trim().toLowerCase()
          const fullScope = normalizeArabic((project.scope || '') + ' ' + (project.name || '')).toLowerCase()
          const cityMatched = fullScope.includes(cleanCity) || 
                              (cleanCity === 'الرويضة' && fullScope.includes('القويعية')) ||
                              (cleanCity === 'مرات' && fullScope.includes('شقراء'))

          if (cityMatched) {
            confidence = Math.max(confidence, 0.95)
            reason.push('governorate:contractor+city')
          } else {
            confidence = Math.max(confidence, 0.85)
            reason.push('governorate:contractor')
          }
        }
      } else {
        const contractorMatched = matchContractor(report.contractorName, [project.contractor])

        if (contractorMatched) {
          // استثناء مشاريع م. عبدالله الأسود (تغطية شاملة لمدينة الرياض)
          const isAswadProject = (project.subProgram === 'المتفرقات' || (project.programManager && project.programManager.includes('عبدالله الأسود')))
          const isAswadContractor = matchContractor(report.contractorName, ABDULLAH_AL_ASWAD_CONTRACTORS)

          if (isAswadProject && isAswadContractor) {
            confidence = Math.max(confidence, 0.85)
            reason.push('contractor:aswad_exception')
          } else {
            // شرط صارم: تطابق الحي إلزامي للمقاول!
            // بعض المقاولين يعملون بمشاريع أخرى تتبع التشغيل والصيانة
            const districtMatched = matchDistrict(report.district, project.scope)

            if (districtMatched) {
              const fullText = normalizeArabic(`${report.description} ${report.centerComment} ${report.licenseNumber}`)
              const normProj = normalizeArabic(project.name)
              const hasProjRef = (project.operationNumber && fullText.includes(project.operationNumber)) ||
                                 (project.po && fullText.includes(project.po)) ||
                                 fullText.includes(normProj)

              if (hasProjRef) {
                confidence = Math.max(confidence, 0.90)
                reason.push('contractor+district+proj_ref')
              } else {
                confidence = Math.max(confidence, 0.75)
                reason.push('contractor+district')
              }
            }
          }
        }
      }
    }

    // 3. مطابقة الحي ورقم/اسم المشروع
    if (!spatialMatch && confidence === 0 && report.district) {
      if (matchDistrict(report.district, project.scope)) {
        const fullText = normalizeArabic(`${report.description} ${report.centerComment} ${report.licenseNumber}`)
        const normProj = normalizeArabic(project.name)
        const hasProjRef = (project.operationNumber && fullText.includes(project.operationNumber)) ||
                           (project.po && fullText.includes(project.po)) ||
                           fullText.includes(normProj)

        if (hasProjRef) {
          confidence = 0.80
          reason.push('district+proj_ref')
        }
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

  // فرز المرشحين بالأعلى ثقة
  candidates.sort((a, b) => b.confidence - a.confidence)

  // إذا كان المقاول الأعمال المدنية وتطابق الحي
  if (isCivilWorks) {
    if (candidates.length > 0 && candidates[0].confidence >= 0.70) {
      const best = candidates[0]
      if (matchDistrict(report.district, best.project.scope)) {
        return {
          matched: true,
          project: best.project,
          confidence: best.confidence,
          reason: best.reason,
          shouldReview: best.confidence < 0.80
        }
      }
    }
    const civilProj = activeProjects.find(p => p.id === '57' || p.id === 57 || matchContractor('شركة الأعمال المدنية', [p.contractor]))
    if (civilProj && report.district && matchDistrict(report.district, civilProj.scope)) {
      return {
        matched: true,
        project: civilProj,
        confidence: 0.85,
        reason: 'contractor+district:civil_works',
        shouldReview: false
      }
    }
    return {
      matched: false,
      excluded: true,
      excludedReason: 'عدم تطابق الحي مع نطاق المشروع (أعمال مدنية/تشغيل وصيانة)',
      confidence: 0,
      reason: 'civil_works_district_mismatch'
    }
  }

  if (candidates.length > 0 && candidates[0].confidence >= 0.70) {
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

export function getProjectSector(project) {
  if (!project) return 'غير محدد'
  const name = project.name || ''
  const sub = project.subProgram || ''
  if (name.includes('صرف') || name.includes('معالجة') || sub.includes('صرف')) return 'صرف'
  if (name.includes('مياه') || sub.includes('مياه')) return 'مياه'
  return 'صرف'
}

export function processReports(reports, projects, geoJsonData, overrides) {
  const processed = []

  // تصفية المشاريع النشطة
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.includes(p.status))

  // تحضير مسبق للطبقات الجارية وحساب BBox
  const ongoingFeatures = [
    ...(geoJsonData?.water?.features || []),
    ...(geoJsonData?.sanitation?.features || [])
  ]

  for (const feat of ongoingFeatures) {
    feat._bbox = computeBBox(feat.geometry)
  }

  // ربط مسبق بين كل مشروع وطبقاته الجارية بـ KMZ بدقة النطاق والمرحلة
  for (const project of activeProjects) {
    project._kmzFeatures = ongoingFeatures.filter(f => matchProjectToFeature(project, f))
  }

  for (const report of reports) {
    const isMaintenance = isMaintenanceReport(report)
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
      const match = matchReportToProject(report, activeProjects)
      result = {
        ...report,
        ...match,
        isMaintenance
      }
    }

    if (override?.customContractor !== undefined) {
      result.contractorName = override.customContractor
      result.customContractor = override.customContractor
    }

    // تصنيف البلاغ: مياه أو صرف صحي حسب المشروع المسند
    result.sector = getProjectSector(result.project)

    if (report.status === 'تمت المعالجة') {
      result.archived = true
    }

    const referenceDate = new Date(report.dateIncident || report.dateReport || '2026-09-18')
    const today = new Date('2026-09-18')
    result.ageDays = Math.floor((today - referenceDate) / (1000 * 60 * 60 * 24))

    processed.push(result)
  }

  return processed
}
