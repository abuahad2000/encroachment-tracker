import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { calculateStats, createManagersData } from '../pipeline/buildData.js'
import { isDistrictInMaintenance } from '../pipeline/districtClassification.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class ImportPipeline {
  constructor() {
    this.stages = []
    this.currentStage = 0
  }

  async process(rawData, options = {}) {
    this.stages = []
    let data = [...rawData]
    const audit = { total: data.length, matched: 0, unmatched: 0, issues: [] }

    try {
      this.addStage('Cleaning', 'جاري تنظيف البيانات...')
      data = this.stage1_clean(data)
      this.completeStage()

      this.addStage('Classification', 'جاري تصنيف المشاريع...')
      data = this.stage2_classify(data)
      this.completeStage()

      this.addStage('Normalization', 'جاري توحيد أسماء المدراء...')
      data = this.stage3_normalize(data)
      this.completeStage()

      this.addStage('Mapping', 'جاري الربط بالمشاريع...')
      const mappingResult = await this.stage4_map(data)
      data = mappingResult.data
      audit.matched = mappingResult.matched
      audit.unmatched = mappingResult.unmatched
      this.completeStage()

      this.addStage('Exclusion', 'جاري تطبيق قواعد الاستبعاد...')
      data = this.stage5_exclude(data)
      this.completeStage()

      this.addStage('Validation', 'جاري التحقق والحفظ...')
      audit.accuracy = ((audit.matched / (audit.matched + audit.unmatched || 1)) * 100).toFixed(1)
      await this.stage6_save(data, options)
      this.completeStage()

      return {
        success: true,
        stages: this.stages,
        audit: { ...audit, processed: data.length },
        fileName: options.fileName
      }
    } catch (error) {
      console.error('Pipeline Error:', error)
      return { success: false, error: error.message, stages: this.stages }
    }
  }

  addStage(name, message) {
    this.stages.push({ name, message, status: 'running', timestamp: Date.now() })
    this.currentStage++
  }

  completeStage() {
    if (this.stages.length > 0) {
      this.stages[this.stages.length - 1].status = 'done'
    }
  }

  stage1_clean(data) {
    const seen = new Set()

    const getField = (row, keyPatterns) => {
      const rowKeys = Object.keys(row)
      for (const pattern of keyPatterns) {
        const exact = rowKeys.find(k => k.trim() === pattern)
        if (exact && row[exact] !== undefined && row[exact] !== null && String(row[exact]).trim() !== '') {
          return row[exact]
        }
        const lowerExact = rowKeys.find(k => k.trim().toLowerCase() === pattern.toLowerCase())
        if (lowerExact && row[lowerExact] !== undefined && row[lowerExact] !== null && String(row[lowerExact]).trim() !== '') {
          return row[lowerExact]
        }
        const sub = rowKeys.find(k => k.includes(pattern))
        if (sub && row[sub] !== undefined && row[sub] !== null && String(row[sub]).trim() !== '') {
          return row[sub]
        }
      }
      return ''
    }

    return data
      .filter(row => row && typeof row === 'object')
      .map((row, idx) => {
        const rawId = getField(row, ['رقم_بلاغ_التعدي', 'رقم بلاغ التعدي', 'رقم البلاغ', 'رقم_البلاغ', 'رقم التعدي', 'reportId', 'id', 'ID'])
        const cleanId = rawId !== '' ? String(rawId).trim() : (idx + 1)

        const rawLat = getField(row, ['خط_العرض', 'خط العرض', 'latitude', 'lat', 'خط عرض', 'Lat'])
        const rawLng = getField(row, ['خط_الطول', 'خط الطول', 'longitude', 'lng', 'lon', 'خط طول', 'Lng'])

        const rawContractor = getField(row, ['اسم المقاول', 'المقاول', 'المقاول_المعتمد', 'contractor', 'contractorName', 'اسم_المقاول'])
        const rawDistrict = getField(row, ['الحي', 'حي', 'district', 'الشارع'])
        const rawCity = getField(row, ['المدينة', 'المحافظة', 'city', 'governorate', 'location'])
        const rawStatus = getField(row, ['حالة_البلاغ', 'حالة البلاغ', 'الحالة', 'status'])
        const rawDesc = getField(row, ['وصف_التعدي', 'وصف التعدي', 'الوصف', 'description', 'Description', 'أثر التعدي'])
        const rawLicense = getField(row, ['رقم_الرخصة', 'رقم الرخصة', 'الرخصة', 'licenseNumber', 'po'])
        const rawProject = getField(row, ['اسم_المشروع', 'اسم المشروع', 'المشروع', 'name', 'projectName'])
        const rawOp = getField(row, ['رقم_العملية', 'رقم العملية', 'operation_number', 'operationNumber'])
        const rawManager = getField(row, ['مدير_البرنامج', 'مدير البرنامج', 'program_manager_nwc', 'programManager', 'program_manager'])
        const rawAge = getField(row, ['أيام التأخير', 'أيام_التأخير', 'age_days', 'ageDays', 'age'])

        return {
          id: cleanId,
          licenseNumber: String(rawLicense || '').trim(),
          district: String(rawDistrict || '').trim(),
          city: String(rawCity || 'الرياض').trim(),
          contractorName: String(rawContractor || '').trim(),
          description: String(rawDesc || '').trim(),
          status: String(rawStatus || 'تحت معالجة المقاول').trim(),
          latitude: parseFloat(rawLat || 0),
          longitude: parseFloat(rawLng || 0),
          ageDays: parseInt(rawAge || 0),
          projectName: String(rawProject || '').trim(),
          operationNumber: String(rawOp || '').trim(),
          programManager: String(rawManager || '').trim(),
          sector: getField(row, ['القطاع', 'sector', 'sub_program']) || ''
        }
      })
      .filter((row, idx) => {
        if (row.latitude && (row.latitude < 15 || row.latitude > 30)) return false
        if (row.longitude && (row.longitude < 34 || row.longitude > 56)) return false
        const key = row.id ? String(row.id) : `${row.licenseNumber || idx}-${row.district}-${row.contractorName}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  stage2_classify(data) {
    return data.map(row => {
      const name = (row.projectName || row.description || '').toLowerCase()
      const status = (row.status || '').toLowerCase()
      
      let phase = 'capital'
      if (status.includes('مسلم') || status.includes('صيانة') || status.includes('maintenance')) {
        phase = 'maintenance'
      } else if (name.includes('صيانة') || name.includes('إحلال') || name.includes('تجديد')) {
        phase = 'maintenance'
      }

      let sector = 'sanitation'
      if (name.includes('مياه') || name.includes('water') || name.includes('شبكة مياه')) {
        sector = 'water'
      } else if (name.includes('صرف') || name.includes('sewage')) {
        sector = 'sanitation'
      }

      return { ...row, phase, sector }
    })
  }

  stage3_normalize(data) {
    const nameMap = {
      'عسكر لسوم': 'عسكر لسلوم',
      'عسكر لسلوم': 'عسكر لسلوم',
      'م. عسكر لسلوم': 'عسكر لسلوم',
      'عبدالله الاسود': 'عبدالله الأسود العنزي',
      'عبدالله الأسود': 'عبدالله الأسود العنزي',
      'عبدالله علي العنزي': 'عبدالله علي العنزي',
      'عبدالله العنزي': 'عبدالله علي العنزي',
      'تركي الاسمري': 'تركي ظافر يحيى الاسمري',
      'تركي ظافر': 'تركي ظافر يحيى الاسمري',
      'سفر العتيبي': 'سفر العتيبي',
      'علي الشهري': 'علي الشهري',
      'أمجد الفالح': 'أمجد الفالح',
      'شاكر الحقباني': 'شاكر الحقباني',
      'سعيد الحارث': 'سعيد الحارث',
      'فهد العنزي': 'فهد العنزي',
      'علي القحطاني': 'علي القحطاني'
    }

    return data.map(row => {
      let manager = row.programManager || row['مدير البرنامج'] || ''
      manager = manager.trim().replace(/^م\.\s*/, '').replace(/^م\/\s*/, '')
      manager = nameMap[manager] || manager
      return { ...row, programManager: manager }
    })
  }

  // ===== المرحلة 4: الربط الدقيق مع التحقق من تفرد المقاول (النسخة الصحيحة) =====
  async stage4_map(data) {
    const directProjectsPath = path.join(__dirname, '../../data/projects.json')
    const generatedProjectsPath = path.join(__dirname, '../../data/generated/projects.json')
    const projectsPath = fs.existsSync(directProjectsPath) ? directProjectsPath : generatedProjectsPath

    const projects = fs.existsSync(projectsPath) 
      ? JSON.parse(fs.readFileSync(projectsPath, 'utf8')) 
      : []

    // 1. بناء خريطة تفرد المقاولين (هل يعمل المقاول تحت مدير واحد أم عدة مدراء؟)
    const contractorManagers = {}
    projects.forEach(p => {
      if (!p.contractor || p.contractor === '-') return
      const contractor = p.contractor.trim()
      if (!contractorManagers[contractor]) {
        contractorManagers[contractor] = new Set()
      }
      contractorManagers[contractor].add(p.programManager)
    })

    const contractorManagerCount = {}
    Object.entries(contractorManagers).forEach(([contractor, managers]) => {
      contractorManagerCount[contractor] = {
        count: managers.size,
        managers: Array.from(managers),
        isUnique: managers.size === 1 // true إذا كان المقاول يعمل تحت مدير واحد فقط
      }
    })

    let matched = 0
    let unmatched = 0
    let lowConfidence = 0

    const mappedData = data.map(row => {
      let bestMatch = null
      let bestScore = 0
      let matchReason = ''

      // 0. فحص مباشر بالمعرف إذا كان محدداً
      if (row.projectId || row.id) {
        const byId = projects.find(p => String(p.id).trim() === String(row.projectId || row.id).trim())
        if (byId) {
          matched++
          return {
            ...row,
            project: byId,
            projectId: byId.id,
            programManager: byId.programManager || row.programManager,
            projectManager: byId.projectManager,
            contractor: byId.contractor || row.contractorName,
            matched: true,
            confidence: 'high',
            confidenceScore: 100,
            matchReason: 'تطابق معرف المشروع المباشر',
            needsReview: false
          }
        }
      }

      projects.forEach(project => {
        let score = 0
        let reasons = []

        // المعيار 1: تطابق اسم المشروع
        if (row.projectName && project.name) {
          const rowName = row.projectName.toLowerCase().trim()
          const projName = project.name.toLowerCase().trim()
          if (rowName === projName) {
            score += 50
            reasons.push('تطابق تام في اسم المشروع')
          } else if (rowName.includes(projName) || projName.includes(rowName)) {
            score += 35
            reasons.push('تطابق جزئي في اسم المشروع')
          }
        }

        // المعيار 2: تطابق رقم العملية
        if (row.operationNumber && project.operationNumber) {
          if (row.operationNumber.trim() === project.operationNumber.trim()) {
            score += 50
            reasons.push('تطابق رقم العملية')
          }
        }

        // المعيار 3: تطابق مدير البرنامج المحدد في البلاغ
        if (row.programManager && project.programManager) {
          const rMgr = row.programManager.replace(/^م\.\s*/, '').replace(/^م\/\s*/, '').trim()
          const pMgr = project.programManager.replace(/^م\.\s*/, '').replace(/^م\/\s*/, '').trim()
          if (rMgr && pMgr && (rMgr === pMgr || rMgr.includes(pMgr) || pMgr.includes(rMgr))) {
            score += 30
            reasons.push('تطابق مدير البرنامج')
          }
        }

        // المعيار 4: تطابق المقاول والحي
        if (row.contractorName && project.contractor) {
          const rCont = row.contractorName.trim().toLowerCase()
          const pCont = project.contractor.trim().toLowerCase()
          const contractorMatch = rCont === pCont || rCont.includes(pCont) || pCont.includes(rCont)
          const districtMatch = row.district && project.scope && (project.scope.includes(row.district) || project.name?.includes(row.district))

          // فحص خاص لشركة الأعمال المدنية والمقاولين المشتركين مع الصيانة:
          const isCivilWorks = rCont.includes('اعمال مدنية') || rCont.includes('الاعمال المدنيه') || rCont.includes('أعمال مدنية')
          const isSpecificProject = project.scope && !project.scope.includes('شامل')

          if (isCivilWorks) {
            // شركة الأعمال المدنية لا ترتبط بالمشاريع إلا إذا كان البلاغ بحي العوالي حصراً!
            if (row.district && (row.district.includes('العوالي') || project.scope?.includes('العوالي')) && (project.id === '57' || String(project.id) === '57')) {
              score += 65
              reasons.push('تطابق مشروع الأعمال المدنية بحي العوالي (م. أمجد الفالح)')
            } else {
              // خارج العوالي لا يحصل على أي نقاط ويعتبر تشغيل وصيانة!
              score = -100
              reasons.push('خارج نطاق العوالي - تابع للتشغيل والصيانة')
            }
          } else if (contractorMatch && districtMatch) {
            score += 45
            reasons.push('تطابق المقاول والحي')
          } else if (contractorMatch) {
            // إذا كان المشروع له نطاق حي محدد والبلاغ في حي مختلف، لا نمنح نقاط تفرد المقاول لمنع الخلط بين الصيانة والمشاريع
            if (!isSpecificProject) {
              const contractorInfo = contractorManagerCount[project.contractor.trim()]
              if (contractorInfo && contractorInfo.isUnique) {
                score += 35
                reasons.push('تطابق المقاول (عقد شامل فريد لمدير واحد)')
              } else {
                score += 20
                reasons.push('تطابق المقاول')
              }
            }
          }
        }

        // المعيار 5: تطابق القطاع
        if (row.sector && project.sector) {
          if (row.sector === project.sector) {
            score += 5
            reasons.push('تطابق القطاع')
          }
        }

        if (score > bestScore) {
          bestScore = score
          bestMatch = project
          matchReason = reasons.join(' + ')
        }
      })

      // ===== قرار الربط بناءً على الثقة =====
      if (bestScore >= 35 && bestMatch) {
        matched++
        return {
          ...row,
          project: bestMatch,
          projectId: bestMatch.id,
          programManager: bestMatch.programManager || row.programManager,
          projectManager: bestMatch.projectManager,
          contractor: bestMatch.contractor || row.contractorName,
          matched: true,
          confidence: bestScore >= 50 ? 'high' : 'medium',
          confidenceScore: bestScore,
          matchReason,
          needsReview: bestScore < 50
        }
      } else {
        unmatched++
        return {
          ...row,
          matched: false,
          confidence: 'low',
          confidenceScore: bestScore,
          matchReason: matchReason || 'لا يوجد تطابق كافٍ',
          needsReview: true,
          suggestedProject: bestMatch ? bestMatch.name : null
        }
      }
    })

    return { data: mappedData, matched, unmatched, lowConfidence }
  }

  // ===== المرحلة 5: الاستبعاد =====
  stage5_exclude(data) {
    return data.map(row => {
      // فحص حي الصيانة: استبعاد مباشر من المشاريع دون الحاجة لربطه بأي مشروع
      if (isDistrictInMaintenance(row.district)) {
        return {
          ...row,
          project: null,
          projectId: null,
          programManager: null,
          matched: false,
          excluded: true,
          excludedReason: `حي ${row.district || ''} تابع للتشغيل والصيانة (مستبعد مباشرة من المشاريع)`,
          actionCategory: 'تشغيل وصيانة'
        }
      }

      // ⚠️ فحص خاص لمقاول الأعمال المدنية: إذا لم يكن بحي العوالي يعتبر تشغيل وصيانة فوراً
      const cName = (row.contractorName || row.contractor || '').toLowerCase()
      const isCivil = cName.includes('اعمال مدنية') || cName.includes('الاعمال المدنيه') || cName.includes('أعمال مدنية')
      if (isCivil) {
        const isAwal = row.district && row.district.includes('العوالي')
        if (!isAwal) {
          return {
            ...row,
            project: null,
            projectId: null,
            programManager: null,
            matched: false,
            excluded: true,
            excludedReason: 'تابع لإدارة التشغيل والصيانة (خارج نطاق مشروع العوالي)',
            actionCategory: 'تشغيل وصيانة'
          }
        }
      }

      // ⚠️ حماية شركة العرين - لا تستبعدها أبداً
      if (cName.includes('العرين')) {
        return { ...row, excluded: false, protectedByRule: 'Al-Areen protection' }
      }

      // استبعاد البلاغات التي تمت معالجتها
      if (row.status === 'تمت المعالجة') {
        return { ...row, excluded: true, excludedReason: 'تمت المعالجة' }
      }

      // البلاغات المرتبطة بمشروع رأسمالي جاري لا تُستبعد وتأخذ اسم مدير البرنامج
      if (row.matched && row.project) {
        return {
          ...row,
          programManager: row.project.programManager,
          excluded: false,
          actionCategory: row.status === 'تحت معالجة المقاول' ? 'تحت معالجة المقاول' : (row.status === 'تمت المعالجة' ? 'تمت المعالجة' : 'تحت الإجراء')
        }
      }

      // استبعاد غير المرتبط واعتباره تابعاً للتشغيل والصيانة
      if (!row.matched && !row.project) {
        return {
          ...row,
          project: null,
          programManager: null,
          matched: false,
          excluded: true,
          excludedReason: 'تابع للتشغيل والصيانة (خارج نطاق مشاريع إدارة المشاريع)',
          actionCategory: 'تشغيل وصيانة'
        }
      }

      return row
    })
  }

  async stage6_save(data, options) {
    const rawReportsPath = path.join(__dirname, '../../data/raw/reports_initial.json')
    const directReportsPath = path.join(__dirname, '../../data/reports.json')
    const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')
    const reportsPath = fs.existsSync(generatedReportsPath)
      ? generatedReportsPath
      : (fs.existsSync(rawReportsPath) ? rawReportsPath : directReportsPath)

    // ── تحميل البيانات القديمة ──
    const existingReports = fs.existsSync(reportsPath)
      ? JSON.parse(fs.readFileSync(reportsPath, 'utf8'))
      : []

    const normalizeId = (id) =>
      String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

    // ── بناء خريطة البيانات القديمة بـ reportId كمفتاح ──
    const existingMap = new Map()
    for (const r of existingReports) {
      const key = normalizeId(r.reportId || r.id)
      if (key) existingMap.set(key, r)
    }

    // ── تطبيق Upsert على البيانات الجديدة ──
    const merged = []
    const processedIds = new Set()
    let updatedCount = 0
    let addedCount = 0

    for (const newRow of data) {
      const key = normalizeId(newRow.reportId || newRow.id)
      if (!key) continue
      processedIds.add(key)

      if (existingMap.has(key)) {
        const old = existingMap.get(key)
        const hasStatusChange = old.status !== newRow.status
        merged.push({
          ...old,
          ...newRow,
          reportId: key,
          lastUpdated: new Date().toISOString(),
          isArchived: false,
          statusChangeHistory: [
            ...(old.statusChangeHistory || []),
            ...(hasStatusChange ? [{
              date: new Date().toISOString(),
              oldStatus: old.status,
              newStatus: newRow.status,
              source: 'weekly_upload'
            }] : [])
          ]
        })
        updatedCount++
      } else {
        merged.push({
          ...newRow,
          reportId: key,
          firstSeenDate: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          isArchived: false,
          statusChangeHistory: [{
            date: new Date().toISOString(),
            oldStatus: null,
            newStatus: newRow.status,
            source: 'weekly_upload'
          }]
        })
        addedCount++
      }
    }

    // ── أرشفة البلاغات التي اختفت من الملف الجديد ──
    let archivedCount = 0
    for (const [key, old] of existingMap.entries()) {
      if (!processedIds.has(key) && !old.isArchived) {
        merged.push({
          ...old,
          isArchived: true,
          archiveReason: 'لم يظهر في الملف الأسبوعي الحالي',
          lastUpdated: new Date().toISOString()
        })
        archivedCount++
      } else if (!processedIds.has(key) && old.isArchived) {
        merged.push(old) // احتفظ بالمؤرشف القديم كما هو
      }
    }

    console.log(`✅ Upsert: تحديث ${updatedCount} | إضافة ${addedCount} | أرشفة ${archivedCount} | الإجمالي ${merged.length}`)

    // ── حفظ ──
    fs.writeFileSync(directReportsPath, JSON.stringify(merged, null, 2), 'utf8')
    if (fs.existsSync(path.dirname(generatedReportsPath))) {
      fs.writeFileSync(generatedReportsPath, JSON.stringify(merged, null, 2), 'utf8')
    }

    // ── تحديث stats.json و managers.json ──
    const projectsPath = path.join(__dirname, '../../data/generated/projects.json')
    if (fs.existsSync(projectsPath)) {
      try {
        const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
        const activeReports = merged.filter(r => !r.isArchived)
        const updatedStats = calculateStats(activeReports, projects)
        const updatedManagers = createManagersData(projects, activeReports)
        fs.writeFileSync(path.join(__dirname, '../../data/generated/stats.json'), JSON.stringify(updatedStats, null, 2), 'utf8')
        fs.writeFileSync(path.join(__dirname, '../../data/generated/managers.json'), JSON.stringify(updatedManagers, null, 2), 'utf8')
      } catch (e) {
        console.error('Error recalculating stats:', e)
      }
    }

    // ── تسجيل العملية ──
    const logPath = path.join(__dirname, '../../data/logs/import_logs.json')
    if (!fs.existsSync(path.dirname(logPath))) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true })
    }
    const legacyLogPath = path.join(__dirname, '../../data/import_logs.json')
    const actualLogPath = fs.existsSync(logPath) ? logPath : (fs.existsSync(legacyLogPath) ? legacyLogPath : logPath)
    const logs = fs.existsSync(actualLogPath) ? JSON.parse(fs.readFileSync(actualLogPath, 'utf8')) : []
    logs.push({
      timestamp: new Date().toISOString(),
      fileName: options.fileName,
      uploadedBy: options.uploadedBy,
      newInFile: data.length,
      updated: updatedCount,
      added: addedCount,
      archived: archivedCount,
      totalActive: merged.filter(r => !r.isArchived).length
    })
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8')
  }

}

export const pipeline = new ImportPipeline()
export default { pipeline }
