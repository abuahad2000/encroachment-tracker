import { normalizeArabic, similarity } from './normalize.js'
import * as turf from '@turf/turf'
import { matchGovernorateFeatureToProject } from './governorateMatcher.js'

const SIMILARITY_THRESHOLD = 0.82
const MAINTENANCE_KEYWORDS = ['طارئ', 'انكسار', 'صيانة', 'دورية', 'إصلاح']
const ACTIVE_STATUSES = ['جاري', 'مسلم ابتدائي']

// المقاولون المعتمدون لمشاريع م. عبدالله الأسود (تغطية كامل مدينة الرياض كاستثناء معتمد)
export const DEFAULT_ASWAD_CONTRACTORS = [
  'مجموعة سعد علي العيسى للمقاولات',
  'سعد علي العيسى',
  'مؤسسة العرين للمقاولات',
  'العرين',
  'شركة الاومير للتجارة والمقاولات',
  'الاومير',
  'شركة النمال للمقاولات مساهمة مقفلة',
  'النمال',
  'مؤسسة ثليل للمقاولات',
  'ثليل',
  'شركة صلت للمقاولات',
  'صلت',
  'شركة ابداع الحياة للإستثمار',
  'شركة نظم تقنية المياه للمقاولات',
  'شركة المسبك الوطني للتجارة والصناعة والمقاولات'
]

// التحقق من وجود اسم مقاول حقيقي معتبر في البلاغ
export function hasValidContractor(contractorName) {
  if (!contractorName) return false
  const trimmed = String(contractorName).trim()
  if (!trimmed || trimmed.toUpperCase() === 'NULL' || trimmed === '-' || trimmed === 'غير محدد') return false
  const norm = normalizeArabic(trimmed).toLowerCase()
  if (norm === 'شركه المياه الوطنيه' || norm === 'شركة المياه الوطنية') return false
  return true
}

// فحص توافق المقاول مع مدير البرنامج: هل هذا المقاول يعمل تحت إدارة مدير البرنامج المعني؟
export function isContractorCompatibleWithManager(reportContractor, programManager, allProjects) {
  if (!hasValidContractor(reportContractor)) return true
  if (!programManager || programManager === 'غير محدد' || programManager === '-') return false

  const managerProjects = allProjects.filter(p => p.programManager === programManager)
  const managerContractors = managerProjects.map(p => p.contractor).filter(Boolean)

  if (programManager.includes('الأسود') || programManager.includes('الاسود')) {
    managerContractors.push(...DEFAULT_ASWAD_CONTRACTORS)
  }

  return matchContractor(reportContractor, managerContractors)
}

// فحص مقاولي عقود المتفرقات الشاملة بالرياض (صرف صحي: الاومير، العيسى، النمال)
export function getCityWideMiscContractorProject(report, activeProjects) {
  const cName = report.contractorName
  if (!hasValidContractor(cName)) return null
  const norm = normalizeArabic(cName).toLowerCase()

  // 1. الاومير -> عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض (عقد رقم 26) - Project #62
  if (norm.includes('اومير') || norm.includes('أومير')) {
    const p = activeProjects.find(pr => String(pr.id) === '62' || (pr.name?.includes('26') && pr.contractor?.includes('الاومير')))
    if (p) return p
  }

  // 2. العيسى -> تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض – عقد رقم 26 – المرحلة الثالثة - Project #60
  if (norm.includes('عيسى') || norm.includes('عيسي')) {
    const p = activeProjects.find(pr => String(pr.id) === '60' || (pr.name?.includes('المرحلة الثالثة') && pr.contractor?.includes('العيسى')))
    if (p) return p
  }

  // 3. النمال -> عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض -عقد 26 المرحلة الرابعة - Project #61
  if (norm.includes('نمال')) {
    // إذا كان البلاغ يقع جغرافياً داخل أحد مشاريع النمال المحددة (مثل الملقا أو العارض)، يُعطى الأولوية للمشروع المحدد
    const specificNimalProjects = activeProjects.filter(pr => 
      pr.contractor?.includes('النمال') && 
      !pr.scope?.includes('شامل') && 
      pr._kmzFeatures?.length > 0
    )
    if (report.longitude && report.latitude) {
      const pt = [report.longitude, report.latitude]
      for (const sp of specificNimalProjects) {
        for (const feat of sp._kmzFeatures) {
          if (pointInBounds(pt, feat.geometry, feat._bbox)) {
            return sp
          }
        }
      }
    }

    // إذا لم يقع في مشروع محدد للنمال، يُسند لعقد المتفرقات الشامل رقم 61 التابع لـ م. عبدالله الأسود
    const p = activeProjects.find(pr => String(pr.id) === '61' || (pr.name?.includes('المرحلة الرابعة') && pr.contractor?.includes('النمال')))
    if (p) return p
  }

  return null
}

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

export function matchReportToProject(report, activeProjects, contractorsConfig) {
  const isCivilWorks = isCivilWorksContractor(report.contractorName)

  // 1. فحص مقاولي عقود المتفرقات الشاملة بالرياض (صرف صحي: الاومير، العيسى، النمال)
  // هؤلاء المقاولون عقودهم شاملة مدينة الرياض ولا ترتبط بنطاق مكاني محدد، ويتبعون م. عبدالله الأسود
  const miscProject = getCityWideMiscContractorProject(report, activeProjects)
  if (miscProject) {
    return {
      matched: true,
      project: miscProject,
      confidence: 0.98,
      reason: 'city_wide_misc_contractor:sewer',
      shouldReview: false
    }
  }

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
  const isGovReport = report.city && !report.city.includes('الرياض')
  const reportSector = report.sector || classifyReportSectorFromText(report)

  // متغيرات لتتبع سبب الاستبعاد عند وجود تقاطع مكاني
  let hasAnySpatialMatch = false
  let rejectedDueToSewerWaterMismatch = false
  let rejectedDueToContractorManagerMismatch = false

  // 1. الفحص المكاني الصارم: البحث عن الطبقات الجارية التي تحتوي النقطة جغرافياً
  if (point) {
    for (const project of activeProjects) {
      if (project._kmzFeatures?.length > 0) {
        for (const feat of project._kmzFeatures) {
          if (pointInBounds(point, feat.geometry, feat._bbox)) {
            hasAnySpatialMatch = true

            // قاعدة 2: إذا كان المشروع صرف وله نطاق معين والبلاغ مياه يُستبعد مباشرة
            const projSector = getProjectSector(project)
            const isSpecificScope = project.scope && 
              !project.scope.includes('شامل') && 
              !project.subProgram?.includes('المتفرقات')

            if (projSector === 'صرف' && isSpecificScope && reportSector === 'مياه') {
              rejectedDueToSewerWaterMismatch = true
              continue
            }

            // قاعدة 1: إذا كان المقاول بملف التعديات المستورد لا يتوافق مع مدير البرنامج اجعله مستبعداً مباشرة
            if (hasValidContractor(report.contractorName)) {
              const isCompatible = isContractorCompatibleWithManager(report.contractorName, project.programManager, activeProjects)
              if (!isCompatible) {
                rejectedDueToContractorManagerMismatch = true
                continue
              }
            }

            const hasContractor = hasValidContractor(report.contractorName)
            const contractorMatched = hasContractor ? matchContractor(report.contractorName, [project.contractor]) : true
            const districtMatches = !report.district || matchDistrict(report.district, project.scope)

            // عدم إسناد البلاغات مجهولة المقاول تلقائياً للأعمال المدنية
            if (!hasContractor && isCivilWorksContractor(project.contractor)) {
              continue
            }

            let confidence = 0.90
            let reason = 'spatial:kml'
            if (contractorMatched && districtMatches) {
              confidence = 0.99
              reason = 'spatial:kml+contractor+district'
            } else if (contractorMatched) {
              confidence = 0.96
              reason = 'spatial:kml+contractor'
            } else if (districtMatches) {
              confidence = 0.93
              reason = 'spatial:kml+district'
            }

            candidates.push({
              project,
              confidence,
              reason
            })
            break
          }
        }
      }
    }
  }

  // إذا وُجد تقاطع مكاني ولكن تم رفض المرشحين لعدم توافق المقاول مع مدير البرنامج: يُستبعد مباشرة
  if (candidates.length === 0 && rejectedDueToContractorManagerMismatch) {
    return {
      matched: false,
      excluded: true,
      excludedReason: 'المقاول بملف التعديات لا يتوافق مع مدير البرنامج/المشروع',
      confidence: 0,
      reason: 'contractor_program_manager_mismatch'
    }
  }

  // إذا وُجد تقاطع مكاني ولكن تم رفض المرشحين لأن المشروع صرف ذو نطاق محدد والبلاغ مياه: يُستبعد مباشرة
  if (candidates.length === 0 && rejectedDueToSewerWaterMismatch) {
    return {
      matched: false,
      excluded: true,
      excludedReason: 'بلاغ شبكة مياه يقع ضمن نطاق مشروع صرف صحي (عدم تطابق نوع الخدمة)',
      confidence: 0,
      reason: 'sewer_scope_water_report_mismatch'
    }
  }

  // قاعدة صارمة: إذا كان للبلاغ إحداثيات جغرافية داخل الرياض ولا يقع في أي نطاق مكاني لمشاريع KMZ، يُستبعد فوراً
  if (hasCoords && !isGovReport && !hasAnySpatialMatch) {
    return {
      matched: false,
      excluded: true,
      excludedReason: 'خارج النطاق الجغرافي للمشاريع (غير تابع لنطاق مكاني)',
      confidence: 0,
      reason: 'outside_spatial_scope'
    }
  }

  // 2. إذا لم يكن هناك إحداثيات أو كان البلاغ يتبع المحافظات خارج مدينة الرياض
  if (!hasAnySpatialMatch) {
    for (const project of activeProjects) {
      let confidence = 0
      let reason = []

      if (report.contractorName && report.contractorName.toUpperCase() !== 'NULL') {
        const isGovProject = project.subProgram?.includes('المحافظات')
        if (isGovReport && isGovProject) {
          const contractorMatched = matchContractor(report.contractorName, [project.contractor])
          if (contractorMatched) {
            const cleanCity = normalizeArabic(report.city).replace('محافظة', '').trim().toLowerCase()
            const fullScope = normalizeArabic((project.scope || '') + ' ' + (project.name || '')).toLowerCase()
            const cityMatched = fullScope.includes(cleanCity) || 
                                (cleanCity.includes('رويض') && fullScope.includes('القويعي')) ||
                                (cleanCity.includes('مرات') && fullScope.includes('شقراء'))

            if (cityMatched) {
              confidence = Math.max(confidence, 0.95)
              reason.push('governorate:contractor+city')
            } else {
              confidence = Math.max(confidence, 0.85)
              reason.push('governorate:contractor')
            }
          }
        } else if (!hasCoords) {
          // للبلاغات التي تفتقر للإحداثيات تماماً: مطابقة المقاول والحي بدقة
          const contractorMatched = matchContractor(report.contractorName, [project.contractor])
          if (contractorMatched && report.district && matchDistrict(report.district, project.scope)) {
            confidence = 0.90
            reason.push('contractor+district')
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

export function classifyReportSectorFromText(report) {
  const fullText = ((report.description || '') + ' ' + (report.impact || '') + ' ' + (report.centerComment || '')).toLowerCase()
  // تنظيف اسم الشركة المتكرر لتفادي تزييف نتيجة المياه
  const cleanText = fullText.replace(/شركة المياه الوطنية/g, '').replace(/شركه المياه الوطنيه/g, '')

  const hasSewer = /صرف|صحي|مجاري|مجرور|محطة معالجة|بيارة|بياره|خط طرد|غرفة تفتيش|منهل|مناهل/.test(cleanText)
  const hasWater = /مياه|شبكة مياه|شبكه مياه|عداد|تسريب|انكسار|انبوب|توصيلة|توصيله|بئر|محبس|خزان/.test(cleanText)

  if (hasSewer && !hasWater) return 'صرف'
  if (hasWater && !hasSewer) return 'مياه'
  if (hasSewer && hasWater) {
    const sewerIdx = cleanText.search(/صرف|صحي/)
    const waterIdx = cleanText.search(/مياه|عداد/)
    return sewerIdx < waterIdx ? 'صرف' : 'مياه'
  }
  return 'مياه'
}

export function processReports(reports, projects, geoJsonData, overrides, contractorsConfig) {
  const processed = []

  // تصفية المشاريع النشطة
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.includes(p.status))

  // تحضير مسبق للطبقات الجارية وحساب BBox
  const ongoingFeatures = [
    ...(geoJsonData?.water?.features || []),
    ...(geoJsonData?.sanitation?.features || []),
    ...(geoJsonData?.governorates?.features || [])
  ]

  for (const feat of ongoingFeatures) {
    feat._bbox = computeBBox(feat.geometry)
  }

  // ربط مسبق بين كل مشروع وطبقاته الجارية بـ KMZ بدقة النطاق والمرحلة
  for (const project of activeProjects) {
    const isGovProject = project.subProgram?.includes('المحافظات') || project.scope?.includes('محافظ')
    if (isGovProject) {
      project._kmzFeatures = (geoJsonData?.governorates?.features || []).filter(f => {
        const m = matchGovernorateFeatureToProject(f, projects)
        return m && String(m.id).trim() === String(project.id).trim()
      })
    } else {
      project._kmzFeatures = ongoingFeatures.filter(f => !f.properties?.isGovernorate && matchProjectToFeature(project, f))
    }
  }

  const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

  for (const report of reports) {
    const isMaintenance = isMaintenanceReport(report)
    const rIdNorm = normalizeId(report.id)
    const rLic = String(report.licenseNumber || '').trim()

    // Find override by normalized ID or secondary license number
    const override = overrides?.find(o => {
      const oIdNorm = normalizeId(o.reportId)
      if (oIdNorm && rIdNorm && oIdNorm === rIdNorm) return true
      if (o.licenseNumber && rLic && String(o.licenseNumber).trim() === rLic) return true
      return false
    })

    let result
    if (override?.excluded) {
      result = {
        ...report,
        matched: false,
        excluded: true,
        project: null,
        excludedReason: override.reason || 'مستبعد من نطاق مشاريع مدير البرنامج',
        confidence: 0,
        isMaintenance,
        actionCategory: 'مستبعد',
        isLocked: true
      }
      if (override.customContractor !== undefined) {
        result.contractorName = override.customContractor
        result.customContractor = override.customContractor
      }
      if (override.customSector) {
        result.sector = override.customSector
      } else {
        result.sector = classifyReportSectorFromText(report)
      }
      const referenceDate = new Date(report.dateIncident || report.dateReport || '2026-09-18')
      const today = new Date('2026-09-18')
      result.ageDays = Math.floor((today - referenceDate) / (1000 * 60 * 60 * 24))
      processed.push(result)
      continue
    } else if (override?.projectId || (override?.isLocked && (override?.project || override?.projectId))) {
      let proj = null
      if (override.projectId) {
        proj = projects.find(p => String(p.id).trim() === String(override.projectId).trim())
      }
      if (!proj && override.project) {
        proj = override.project
      }
      if (!proj && override.customProgramManager) {
        proj = projects.find(p => p.programManager === override.customProgramManager)
      }

      result = {
        ...report,
        matched: !!proj,
        excluded: false,
        project: proj ? { ...proj } : null,
        confidence: 1.0,
        reason: override.reason || 'تثبيت وتعديل معتمد',
        isMaintenance,
        isLocked: true
      }
      if (override.customContractor !== undefined) {
        result.contractorName = override.customContractor
        result.customContractor = override.customContractor
        result.lockedContractor = true
      }
      if (override.customProgramManager && result.project) {
        result.project.programManager = override.customProgramManager
      }
      if (override.customSector) {
        result.sector = override.customSector
      } else if (result.project) {
        result.sector = getProjectSector(result.project)
      } else {
        result.sector = classifyReportSectorFromText(report)
      }
      const referenceDate = new Date(report.dateIncident || report.dateReport || '2026-09-18')
      const today = new Date('2026-09-18')
      result.ageDays = Math.floor((today - referenceDate) / (1000 * 60 * 60 * 24))
      if (report.status === 'تحت معالجة المقاول') {
        result.actionCategory = 'تحت معالجة المقاول'
      } else if (report.status === 'تمت المعالجة') {
        result.actionCategory = 'تمت المعالجة'
      } else {
        result.actionCategory = 'تحت الإجراء'
      }
      processed.push(result)
      continue
    } else {
      // Determine effective contractor before matching: if an override modified the contractor, use it directly!
      const effectiveContractor = (override?.customContractor !== undefined && override.customContractor !== null && String(override.customContractor).trim() !== '')
        ? String(override.customContractor).trim()
        : report.contractorName

      const reportToMatch = {
        ...report,
        contractorName: effectiveContractor
      }

      const match = matchReportToProject(reportToMatch, activeProjects, contractorsConfig)
      result = {
        ...reportToMatch,
        ...match,
        isMaintenance
      }

      // If override has a custom contractor, but spatial matching couldn't find a project, attach to any valid project of that contractor
      if (!result.excluded && override?.customContractor && (!result.matched || !result.project)) {
        const cTarget = String(override.customContractor).trim()
        const candidateProj = activeProjects.find(p => {
          const cPName = (p.contractor || '').trim()
          return cPName && (cPName === cTarget || cPName.includes(cTarget) || cTarget.includes(cPName))
        })
        if (candidateProj) {
          result.project = { ...candidateProj }
          result.matched = true
          result.confidence = 0.9
          result.reason = 'manual_contractor_override'
        }
      }
    }

    if (!result.excluded && override?.customProgramManager) {
      if (result.project) {
        result.project = {
          ...result.project,
          programManager: override.customProgramManager
        }
      } else {
        const mgrProj = projects.find(p => p.programManager === override.customProgramManager)
        if (mgrProj) {
          result.project = { ...mgrProj }
          result.matched = true
        }
      }
    }

    if (override?.customContractor !== undefined) {
      result.contractorName = override.customContractor
      result.customContractor = override.customContractor
      result.isLocked = true
      result.lockedContractor = true
    }

    // If report was excluded, ensure project is strictly null
    if (result.excluded) {
      result.project = null
      result.matched = false
      result.actionCategory = 'مستبعد'
    } else if (report.status === 'تحت معالجة المقاول') {
      result.actionCategory = 'تحت معالجة المقاول'
    } else if (report.status === 'تمت المعالجة') {
      result.actionCategory = 'تمت المعالجة'
    } else {
      result.actionCategory = 'تحت الإجراء'
    }

    // تصنيف البلاغ: مياه أو صرف صحي حسب التعديل اليدوي أو المشروع المسند
    if (override?.customSector) {
      result.sector = override.customSector
    } else if (result.project) {
      result.sector = getProjectSector(result.project)
    } else {
      result.sector = classifyReportSectorFromText(report)
    }

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
