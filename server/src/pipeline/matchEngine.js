import { normalizeArabic, similarity } from './normalize.js'
import * as turf from '@turf/turf'
import { matchGovernorateFeatureToProject } from './governorateMatcher.js'
import { isDistrictInMaintenance, loadMaintenanceDistricts } from './districtClassification.js'
import { checkMaintenanceContractor, checkCapitalContractor } from './contractorsRegistry.js'

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

  // فحص سجل المقاولين الرأسماليين المعتمد أولاً
  const capInfo = checkCapitalContractor(reportContractor)
  if (capInfo && capInfo.programManagers?.length > 0) {
    const isDirectMatch = capInfo.programManagers.some(pm => {
      const pmNorm = normalizeArabic(pm).toLowerCase()
      const progNorm = normalizeArabic(programManager).toLowerCase()
      return pmNorm.includes(progNorm) || progNorm.includes(pmNorm)
    })
    if (isDirectMatch) return true
  }

  const managerProjects = allProjects.filter(p => p.programManager === programManager)
  const managerContractors = managerProjects.map(p => p.contractor).filter(Boolean)

  if (programManager.includes('الأسود') || programManager.includes('الاسود')) {
    managerContractors.push(...DEFAULT_ASWAD_CONTRACTORS)
  }

  return matchContractor(reportContractor, managerContractors)
}

export function isValidSaudiCoords(lng, lat) {
  if (lng === null || lng === undefined || lng === '' || lat === null || lat === undefined || lat === '') return false
  const nLng = Number(lng)
  const nLat = Number(lat)
  if (isNaN(nLng) || isNaN(nLat)) return false
  if (nLng === 0 && nLat === 0) return false
  return (nLng >= 34 && nLng <= 56 && nLat >= 16 && nLat <= 33)
}

export function contractorMatchesTokens(contractorName, targetTokens) {
  if (!contractorName) return false
  const norm = normalizeArabic(contractorName).toLowerCase()
  const tokens = norm.split(/\s+/).filter(Boolean)
  return tokens.some(t => {
    const unal = t.startsWith('ال') ? t.slice(2) : t
    return targetTokens.includes(t) || targetTokens.includes(unal)
  })
}

// فحص مقاولي عقود المتفرقات الشاملة بالرياض (صرف صحي: الاومير، العيسى، النمال)
export function getCityWideMiscContractorProject(report, activeProjects) {
  const cName = report.contractorName
  if (!hasValidContractor(cName)) return null

  // 1. الاومير -> عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض (عقد رقم 26) - Project #62
  if (contractorMatchesTokens(cName, ['اومير', 'الاولمير'])) {
    const p = activeProjects.find(pr => String(pr.id) === '62' || (pr.name?.includes('26') && contractorMatchesTokens(pr.contractor, ['اومير', 'الاولمير'])))
    if (p) return p
  }

  // 2. العيسى -> تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض – عقد رقم 26 – المرحلة الثالثة - Project #60
  if (contractorMatchesTokens(cName, ['عيسي', 'عيسى'])) {
    const p = activeProjects.find(pr => String(pr.id) === '60' || (pr.name?.includes('المرحلة الثالثة') && contractorMatchesTokens(pr.contractor, ['عيسي', 'عيسى'])))
    if (p) return p
  }

  // 3. النمال -> عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض -عقد 26 المرحلة الرابعة - Project #61
  if (contractorMatchesTokens(cName, ['نمال'])) {
    if (isValidSaudiCoords(report.longitude, report.latitude)) {
      const pt = [Number(report.longitude), Number(report.latitude)]

      // أ. إذا كان البلاغ يقع جغرافياً داخل أحد مشاريع النمال المحددة (مثل الملقا أو العارض)، يُعطى الأولوية للمشروع المحدد
      const specificNimalProjects = activeProjects.filter(pr => 
        contractorMatchesTokens(pr.contractor, ['نمال']) && 
        !pr.scope?.includes('شامل') && 
        pr._kmzFeatures?.length > 0
      )
      for (const sp of specificNimalProjects) {
        for (const feat of sp._kmzFeatures) {
          if (pointInBounds(pt, feat.geometry, feat._bbox)) {
            return sp
          }
        }
      }

      // ب. التحقق من الوقوع على خطوط طبقة النمال المعتمدة (عقد 26 المرحلة الرابعة - المشروع #61)
      const p61 = activeProjects.find(pr => String(pr.id) === '61' || (pr.name?.includes('المرحلة الرابعة') && contractorMatchesTokens(pr.contractor, ['نمال'])))
      if (p61 && p61._kmzFeatures?.length > 0) {
        for (const feat of p61._kmzFeatures) {
          if (pointInBounds(pt, feat.geometry, feat._bbox)) {
            return p61
          }
        }
      }
    }

    // ج. إذا لم يقع جغرافياً على خطوط الطبقة المعتمدة أو نطاق مشاريع النمال، لا يُسند لعقد المتفرقات الشامل ويُستبعد للصيانة
    return null
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

export function cleanContractorName(name) {
  if (!name) return ''
  let norm = normalizeArabic(name).toLowerCase()
  const wordsToRemove = [
    'شركه شخص واحد', 'شخص واحد', 'شركه', 'شركة', 'مؤسسه', 'مؤسسة',
    'مجموعه', 'مجموعة', 'للمقاولات', 'المقاولات', 'المحدوده', 'المحدودة',
    'مساهمه مقفله', 'مساهمة مقفلة', 'مساهمه', 'مساهمة', 'مقفله', 'مقفلة',
    'للتجاره', 'للتجارة', 'والصناعه', 'والصناعة', 'العالميه', 'العالمية', 'المتحده', 'المتحدة'
  ]
  for (const w of wordsToRemove) {
    norm = norm.replaceAll(w, ' ')
  }
  return norm.replace(/\s+/g, ' ').trim()
}

function matchContractor(reportContractor, projectContractors) {
  if (!reportContractor || reportContractor.toUpperCase() === 'NULL') return false
  const normalized = normalizeArabic(reportContractor).toLowerCase()
  const cleanRep = cleanContractorName(reportContractor)

  for (const projectContractor of projectContractors) {
    if (!projectContractor) continue
    const projNorm = normalizeArabic(projectContractor).toLowerCase()
    const cleanProj = cleanContractorName(projectContractor)

    if (
      normalized.includes(projNorm) || projNorm.includes(normalized) ||
      (cleanRep && cleanProj && (cleanRep.includes(cleanProj) || cleanProj.includes(cleanRep))) ||
      similarity(normalized, projNorm) >= SIMILARITY_THRESHOLD ||
      (cleanRep && cleanProj && similarity(cleanRep, cleanProj) >= SIMILARITY_THRESHOLD)
    ) {
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
    const pad = 0.003 // ~330m safety buffer for line proximity calculations
    return [minX - pad, minY - pad, maxX + pad, maxY + pad]
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

export function getFeatureSector(feat, project) {
  const folder = feat?.properties?.folder || ''
  if (folder.includes('اسبستوس')) return 'مياه'
  const sec = feat?.properties?.sector
  if (sec === 'water') return 'مياه'
  if (sec === 'sanitation') return 'صرف'
  return getProjectSector(project)
}

export function matchReportToProject(report, activeProjects, contractorsConfig, maintenanceDistricts = null) {

  const isCivilWorks = isCivilWorksContractor(report.contractorName)

  // 1. فحص مقاولي عقود المتفرقات الشاملة بالرياض (صرف صحي: الاومير، العيسى، النمال)
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

  // قاعدة المقاول "الأعمال المدنية": إذا لم يتطابق الحي مع المشروع الجاري يجعله مستبعداً فوراً للتشغيل والصيانة
  if (isCivilWorks) {
    const civilProj = activeProjects.find(p => p.id === '57' || p.id === 57 || matchContractor('شركة الأعمال المدنية', [p.contractor]))
    const districtMatches = report.district && civilProj && matchDistrict(report.district, civilProj.scope)
    if (!districtMatches) {
      return {
        matched: false,
        excluded: true,
        excludedReason: 'تابع لإدارة التشغيل والصيانة (خارج نطاق مشروع العوالي)',
        confidence: 0,
        reason: 'civil_works_maintenance'
      }
    }
  }

  const candidates = []
  const hasCoords = isValidSaudiCoords(report.longitude, report.latitude)
  const point = hasCoords ? [Number(report.longitude), Number(report.latitude)] : null
  const isGovReport = report.city && !report.city.includes('الرياض')
  const reportSector = report.sector || classifyReportSectorFromText(report)

  // متغيرات لتتبع سبب الاستبعاد أو المراجعة عند وجود تقاطع مكاني
  let hasAnySpatialMatch = false
  let rejectedDueToSewerWaterMismatch = false
  let rejectedDueToWaterSewerMismatch = false
  let rejectedDueToContractorManagerMismatch = false
  let suggestedProjectOnManagerMismatch = null

  // 1. الفحص المكاني: البحث عن الطبقات الجارية التي تحتوي النقطة جغرافياً
  if (point) {
    for (const project of activeProjects) {
      if (project._kmzFeatures?.length > 0) {
        for (const feat of project._kmzFeatures) {
          if (pointInBounds(point, feat.geometry, feat._bbox)) {
            hasAnySpatialMatch = true

            // نوع الخدمة للنطاق يؤخذ من مجلد KMZ (water أو sanitation، والاسبستوس water). لا تعتمد على اسم المشروع في YAML إلا إذا لم يكن للعنصر قطاع
            const featSector = getFeatureSector(feat, project)
            const isSpecificScope = project.scope && 
              !project.scope.includes('شامل') && 
              !project.subProgram?.includes('المتفرقات')

            // بلاغ مياه داخل نطاق صرف ذي نطاق محدد
            if (featSector === 'صرف' && isSpecificScope && reportSector === 'مياه') {
              rejectedDueToSewerWaterMismatch = true
              continue
            }

            // بلاغ صرف داخل نطاق مياه ذي نطاق محدد
            if (featSector === 'مياه' && isSpecificScope && reportSector === 'صرف') {
              rejectedDueToWaterSewerMismatch = true
              continue
            }

            // فحص توافق المقاول مع مدير البرنامج
            if (hasValidContractor(report.contractorName)) {
              const isCompatible = isContractorCompatibleWithManager(report.contractorName, project.programManager, activeProjects)
              if (!isCompatible) {
                rejectedDueToContractorManagerMismatch = true
                if (!suggestedProjectOnManagerMismatch) {
                  suggestedProjectOnManagerMismatch = project
                }
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
              reason,
              featSector
            })
            break
          }
        }
      }
    }
  }

  // إذا وُجد تقاطع مكاني ولكن تم تعليق المرشح لعدم توافق المقاول مع مدير البرنامج: مراجعة (لا استبعاد)
  if (candidates.length === 0 && rejectedDueToContractorManagerMismatch) {
    return {
      matched: false,
      excluded: false,
      needsReview: true,
      shouldReview: true,
      confidence: 0.5,
      reason: 'contractor_program_manager_mismatch_review',
      suggestedProject: suggestedProjectOnManagerMismatch,
      actionCategory: 'تحت الإجراء'
    }
  }

  // إذا وُجد تقاطع مكاني وتم الاستبعاد لعدم تطابق نوع الخدمة:
  if (candidates.length === 0 && rejectedDueToSewerWaterMismatch) {
    return {
      matched: false,
      excluded: true,
      excludedReason: 'بلاغ شبكة مياه يقع ضمن نطاق مشروع صرف صحي (عدم تطابق نوع الخدمة)',
      confidence: 0,
      reason: 'sewer_scope_water_report_mismatch'
    }
  }

  if (candidates.length === 0 && rejectedDueToWaterSewerMismatch) {
    return {
      matched: false,
      excluded: true,
      excludedReason: 'بلاغ شبكة صرف يقع ضمن نطاق مشروع مياه (عدم تطابق نوع الخدمة)',
      confidence: 0,
      reason: 'sewer_report_in_water_scope_mismatch'
    }
  }

  // قاعدة النمال: التأكد من البلاغات التي تقع على الخطوط الموجودة بالطبقة واستبعاد البقية للصيانة
  if (hasValidContractor(report.contractorName) && contractorMatchesTokens(report.contractorName, ['نمال'])) {
    const nimalMatch = candidates.find(c => c.project && (
      String(c.project.id) === '61' || 
      contractorMatchesTokens(c.project.contractor, ['نمال'])
    ))

    if (nimalMatch) {
      return {
        matched: true,
        project: nimalMatch.project,
        confidence: nimalMatch.confidence,
        reason: nimalMatch.reason,
        shouldReview: false
      }
    }

    // إذا لم يقع البلاغ على خطوط العقد 26 المرحلة الرابعة أو مشاريع النمال المعتمدة -> يُستبعد لأنه تابع للصيانة
    return {
      matched: false,
      excluded: true,
      excludedReason: 'خارج مسار خطوط المشروع المعتمدة (تابع للصيانة)',
      confidence: 0,
      reason: 'outside_nimal_lines_maintenance'
    }
  }

  // الخطوة 2: إذا كان للبلاغ إحداثيات جغرافية صالحة داخل الرياض ولا يقع في أي نطاق مكاني لمشاريع KMZ، يُستبعد فوراً للصيانة
  if (!hasAnySpatialMatch && hasCoords && !isGovReport) {
    return {
      matched: false,
      excluded: true,
      confidence: 0,
      reason: 'outside_capital_scope',
      exclusionReason: 'خارج النطاق الجغرافي للمشاريع الرأسمالية (يعتبر تشغيل وصيانة)',
      excludedReason: 'خارج النطاق الجغرافي للمشاريع الرأسمالية (يعتبر تشغيل وصيانة)',
      actionCategory: 'تشغيل وصيانة',
      isMaintenance: true
    }
  }

  // 2. إذا لم يكن هناك إحداثيات صالحة أو كان البلاغ يتبع المحافظات خارج مدينة الرياض
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
          // للبلاغات التي تفتقر للإحداثيات تماماً (أو إحداثياتها غير صالحة): مطابقة المقاول والحي
          const contractorMatched = matchContractor(report.contractorName, [project.contractor])
          if (contractorMatched && report.district && matchDistrict(report.district, project.scope)) {
            confidence = 0.75
            reason.push('contractor+district')
          }
        }
      }

      if (confidence > 0) {
        candidates.push({
          project,
          confidence,
          reason: reason.join(','),
          featSector: getProjectSector(project)
        })
      }
    }
  }

  // الخطوة 3: إذا كان داخل النطاق المكاني → تحقق من المقاول والقطاع
  if (candidates.length > 0 && hasValidContractor(report.contractorName)) {
    let capitalContractor = checkCapitalContractor(report.contractorName)
    if (!capitalContractor) {
      // تحقق مزدوج: هل المقاول مسجل مباشرة في أحد المشاريع المرشحة؟
      const projectContractorMatch = candidates.find(c => matchContractor(report.contractorName, [c.project?.contractor]))
      if (projectContractorMatch) {
        capitalContractor = {
          name: projectContractorMatch.project.contractor,
          allowed_sectors: ['صرف', 'مياه']
        }
      }
    }

    if (!capitalContractor) {
      return {
        matched: false,
        excluded: true,
        project: null,
        programManager: null,
        confidence: 0,
        reason: 'contractor_not_in_capital_project',
        exclusionReason: `المقاول ${report.contractorName} غير مسجل في قائمة مقاولي المشاريع الرأسمالية`,
        excludedReason: `المقاول ${report.contractorName} غير مسجل في قائمة مقاولي المشاريع الرأسمالية`,
        actionCategory: 'تشغيل وصيانة',
        isMaintenance: true
      }
    }

    const repSector = reportSector || classifyReportSectorFromText(report)
    if (capitalContractor.allowed_sectors?.length > 0 && repSector && repSector !== 'عام') {
      if (!capitalContractor.allowed_sectors.includes(repSector)) {
        return {
          matched: false,
          excluded: true,
          project: null,
          programManager: null,
          confidence: 0,
          reason: 'sector_mismatch',
          exclusionReason: `المقاول لا يعمل في قطاع ${repSector} ضمن المشاريع الرأسمالية`,
          excludedReason: `المقاول لا يعمل في قطاع ${repSector} ضمن المشاريع الرأسمالية`,
          actionCategory: 'مستبعد'
        }
      }
    }
  }

  // إذا وقعت النقطة داخل نطاقين مختلفي النوع، اربطه بالنطاق المطابق لنوعه ولا تستبعده
  if (candidates.length > 1 && (reportSector === 'مياه' || reportSector === 'صرف')) {
    candidates.sort((a, b) => {
      const aMatches = (a.featSector === reportSector || getProjectSector(a.project) === reportSector) ? 1 : 0
      const bMatches = (b.featSector === reportSector || getProjectSector(b.project) === reportSector) ? 1 : 0
      if (aMatches !== bMatches) return bMatches - aMatches
      return b.confidence - a.confidence
    })
  } else {
    candidates.sort((a, b) => b.confidence - a.confidence)
  }

  // تعادل المرشحين: إذا كان أعلى مرشحين لمشروعين مختلفين والفرق بينهما أقل من 0.03
  if (candidates.length >= 2) {
    const c0 = candidates[0]
    const c1 = candidates[1]
    const diffProject = String(c0.project?.id) !== String(c1.project?.id)
    const diffConf = Math.abs(c0.confidence - c1.confidence)
    if (diffProject && diffConf < 0.03 && c0.confidence >= 0.70) {
      return {
        matched: true,
        project: c0.project,
        confidence: c0.confidence,
        reason: 'tie_between_projects',
        shouldReview: true,
        needsReview: true,
        alternatives: [c0, c1]
      }
    }
  }

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
      excludedReason: 'تابع لإدارة التشغيل والصيانة (خارج نطاق مشروع العوالي)',
      confidence: 0,
      reason: 'civil_works_maintenance'
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
  // تنظيف اسم الشركة المتكرر بأشكاله لتفادي تزييف نتيجة المياه
  const cleanText = fullText
    .replace(/شرك[ةه]\s+المياه(\s+الوطني[ةه])?/gi, '')
    .replace(/شركة المياه/gi, '')
    .replace(/شركه المياه/gi, '')

  const hasSewer = /صرف|صحي|مجاري|مجرور|محطة معالجة|بيارة|بياره|خط طرد|غرفة تفتيش|منهل|مناهل/.test(cleanText)
  const hasWater = /شبك[ةه]\s+مياه|خطوط\s+مياه|انبوب\s+مياه|أنبوب\s+مياه|ماسورة\s+مياه|عداد\s+مياه|تسريب\s+مياه|انكسار\s+مياه|انكسار\s+خط|توصيل[ةه]\s+مياه|شبكة\s+المياه|خط\s+مياه/.test(cleanText)

  if (hasSewer && !hasWater) return 'صرف'
  if (hasWater && !hasSewer) return 'مياه'
  return 'عام'
}

export function computeAgeDays(report, processingDate = new Date()) {
  const dateStr = report.dateReport || report.dateIncident
  if (!dateStr) {
    return { ageDays: null, missingDate: true }
  }
  const refDate = new Date(dateStr)
  if (isNaN(refDate.getTime())) {
    return { ageDays: null, missingDate: true }
  }
  const pDate = processingDate instanceof Date ? processingDate : new Date(processingDate)
  const diffDays = Math.floor((pDate - refDate) / (1000 * 60 * 60 * 24))
  return { ageDays: diffDays, missingDate: false }
}

export function processReports(reports, projects, geoJsonData, overrides, contractorsConfig, processingDate = new Date()) {
  const processed = []

  // تصفية المشاريع النشطة
  const activeProjects = projects.filter(p => ACTIVE_STATUSES.includes(p.status))
  const maintenanceDistricts = loadMaintenanceDistricts()

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
    } else if (String(project.id).trim() === '61' || (project.name?.includes('المرحلة الرابعة') && project.contractor?.includes('النمال'))) {
      // مشروع النمال - عقد 26 المرحلة الرابعة: ربطه مباشرة بكافة خطوط النمال المعتمدة
      project._kmzFeatures = ongoingFeatures.filter(f => f.properties?.isNimalLines || f.properties?.kmzFile?.includes('المرحلة الرابعة') || f.properties?.projectId === '61')
    } else {
      project._kmzFeatures = ongoingFeatures.filter(f => !f.properties?.isGovernorate && !f.properties?.isNimalLines && matchProjectToFeature(project, f))
    }
  }

  const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

  for (const report of reports) {
    const isMaintenance = isMaintenanceReport(report)
    const rIdNorm = normalizeId(report.id)

    // مطابقة التعديلات اليدوية بـ reportId فقط
    const override = overrides?.find(o => {
      const oIdNorm = normalizeId(o.reportId)
      return !!(oIdNorm && rIdNorm && oIdNorm === rIdNorm)
    })

    // (0) البلاغات التاريخية المحفوظة (الدمج الأسبوعي الآمن)
    if (report.isHistorical && !override) {
      const ageInfo = computeAgeDays(report, processingDate)
      processed.push({
        ...report,
        isHistorical: true,
        disappearedFromWeekly: true,
        archived: true,
        ageDays: ageInfo.ageDays,
        actionCategory: report.actionCategory || (report.matched ? 'تمت المعالجة' : 'مستبعد')
      })
      continue
    }

    // ترتيب الفحص الجديد:
    // (1) تعديل يدوي استبعاد
    if (override?.excluded) {
      const result = {
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
      const ageInfo = computeAgeDays(report, processingDate)
      result.ageDays = ageInfo.ageDays
      if (ageInfo.missingDate) result.missingDate = true
      processed.push(result)
      continue
    }

    // (2) تعديل يدوي تثبيت
    if (override?.projectId || (override?.isLocked && (override?.project || override?.projectId))) {
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

      const result = {
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
      const ageInfo = computeAgeDays(report, processingDate)
      result.ageDays = ageInfo.ageDays
      if (ageInfo.missingDate) result.missingDate = true
      if (report.status === 'تحت معالجة المقاول') {
        result.actionCategory = 'تحت معالجة المقاول'
      } else if (report.status === 'تمت المعالجة') {
        result.actionCategory = 'تمت المعالجة'
      } else {
        result.actionCategory = 'تحت الإجراء'
      }
      processed.push(result)
      continue
    }

    // (3) حي الصيانة
    // إذا للبلاغ إحداثيات صالحة ووقع داخل مضلع أو خط مشروع نشط، لا تستبعده، بل اجعله بحاجة مراجعة
    if (isDistrictInMaintenance(report.district, maintenanceDistricts)) {
      const hasValidCoords = isValidSaudiCoords(report.longitude, report.latitude)
      let activeProjectInside = null

      if (hasValidCoords) {
        const pt = [Number(report.longitude), Number(report.latitude)]
        for (const p of activeProjects) {
          if (p._kmzFeatures?.length > 0) {
            for (const feat of p._kmzFeatures) {
              if (pointInBounds(pt, feat.geometry, feat._bbox)) {
                activeProjectInside = p
                break
              }
            }
          }
          if (activeProjectInside) break
        }
      }

      const ageInfo = computeAgeDays(report, processingDate)
      const cls = classifyReportSectorFromText(report)

      if (activeProjectInside) {
        processed.push({
          ...report,
          matched: false,
          excluded: false,
          needsReview: true,
          shouldReview: true,
          project: null,
          suggestedProject: activeProjectInside,
          programManager: null,
          confidence: 0.5,
          reason: 'maintenance_district_inside_active_project',
          actionCategory: 'تحت الإجراء',
          isMaintenance: true,
          sector: cls,
          ageDays: ageInfo.ageDays,
          ...(ageInfo.missingDate ? { missingDate: true } : {})
        })
      } else {
        processed.push({
          ...report,
          matched: false,
          excluded: true,
          project: null,
          programManager: null,
          confidence: 0,
          reason: 'maintenance_district',
          excludedReason: `حي ${report.district || ''} تابع للتشغيل والصيانة (مستبعد مباشرة من المشاريع)`,
          actionCategory: 'تشغيل وصيانة',
          isMaintenance: true,
          sector: cls,
          ageDays: ageInfo.ageDays,
          ...(ageInfo.missingDate ? { missingDate: true } : {})
        })
      }
      continue
    }

    // (4) تحديد اسم المقاول الفعلي (مع مراعاة التعديل اليدوي إن وجد)
    const effectiveContractor = (override?.customContractor !== undefined && override.customContractor !== null && String(override.customContractor).trim() !== '')
      ? String(override.customContractor).trim()
      : report.contractorName

    // (5) تطبيق محرك المطابقة (الفحص المكاني هو الحاكم أولاً ثم فحص المقاول)
    const reportToMatch = {
      ...report,
      contractorName: effectiveContractor
    }

    const match = matchReportToProject(reportToMatch, activeProjects, contractorsConfig, maintenanceDistricts)
    const result = {
      ...reportToMatch,
      ...match,
      isMaintenance
    }

    // إذا وُجد تعديل مقاول يدوي ولم يُربط بمشروع، حاول ربطه بأي مشروع تابع للمقاول
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

    // فحص البلاغ ذي التصنيف العام المرتبط بمشروع
    if (result.matched && result.project) {
      const textSector = classifyReportSectorFromText(report)
      if (textSector === 'عام') {
        result.shouldReview = true
      }
    }

    // If report was excluded, ensure project and programManager are strictly null
    if (result.excluded) {
      result.project = null
      result.programManager = null
      result.matched = false
      if (result.excludedReason?.includes('تشغيل وصيانة') || result.excludedReason?.includes('الصيانة') || result.reason === 'maintenance_contractor') {
        result.actionCategory = 'تشغيل وصيانة'
      } else {
        result.actionCategory = 'مستبعد'
      }
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

    const ageInfo = computeAgeDays(report, processingDate)
    result.ageDays = ageInfo.ageDays
    if (ageInfo.missingDate) result.missingDate = true

    processed.push(result)
  }

  return processed
}
