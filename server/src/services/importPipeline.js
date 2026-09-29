import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { calculateStats, createManagersData } from '../pipeline/buildData.js'

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

          if (contractorMatch && districtMatch) {
            score += 45
            reasons.push('تطابق المقاول والحي')
          } else if (contractorMatch) {
            const contractorInfo = contractorManagerCount[project.contractor.trim()]
            if (contractorInfo && contractorInfo.isUnique) {
              score += 35
              reasons.push('تطابق المقاول (فريد لمدير واحد)')
            } else {
              score += 20
              reasons.push('تطابق المقاول')
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
      // ⚠️ حماية شركة العرين - لا تستبعدها أبداً
      const contractor = (row.contractorName || row.contractor || '').toLowerCase()
      if (contractor.includes('العرين')) {
        return { ...row, excluded: false, protectedByRule: 'Al-Areen protection' }
      }

      // استبعاد البلاغات التي تمت معالجتها
      if (row.status === 'تمت المعالجة') {
        return { ...row, excluded: true, excludedReason: 'تمت المعالجة' }
      }

      // البلاغات المرتبطة بمشروع لا تُستبعد
      if (row.matched && row.project) {
        return { ...row, excluded: false }
      }

      // استبعاد غير المرتبط
      if (!row.matched && !row.project) {
        return { ...row, excluded: true, excludedReason: 'غير مرتبط بمشروع رأسمالي' }
      }

      return row
    })
  }

  async stage6_save(data, options) {
    const directReportsPath = path.join(__dirname, '../../data/reports.json')
    const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')
    const reportsPath = fs.existsSync(directReportsPath) ? directReportsPath : generatedReportsPath

    const existingReports = fs.existsSync(reportsPath) 
      ? JSON.parse(fs.readFileSync(reportsPath, 'utf8')) 
      : []

    const newIds = new Set(data.map(r => r.id).filter(Boolean))
    const merged = [
      ...existingReports.filter(r => !newIds.has(r.id)),
      ...data
    ]

    fs.writeFileSync(directReportsPath, JSON.stringify(merged, null, 2), 'utf8')

    if (fs.existsSync(path.dirname(generatedReportsPath))) {
      fs.writeFileSync(generatedReportsPath, JSON.stringify(merged, null, 2), 'utf8')
    }

    // Update stats.json and managers.json so dashboard numbers and manager cards update immediately
    const projectsPath = path.join(__dirname, '../../data/generated/projects.json')
    if (fs.existsSync(projectsPath)) {
      try {
        const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'))
        const updatedStats = calculateStats(merged, projects)
        const updatedManagers = createManagersData(projects, merged)
        const statsPath = path.join(__dirname, '../../data/generated/stats.json')
        const managersPath = path.join(__dirname, '../../data/generated/managers.json')
        fs.writeFileSync(statsPath, JSON.stringify(updatedStats, null, 2), 'utf8')
        fs.writeFileSync(managersPath, JSON.stringify(updatedManagers, null, 2), 'utf8')
      } catch (e) {
        console.error('Error recalculating stats and managers in importPipeline:', e)
      }
    }

    // تسجيل العملية
    const logPath = path.join(__dirname, '../../data/import_logs.json')
    const logs = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : []
    logs.push({
      timestamp: new Date().toISOString(),
      fileName: options.fileName,
      uploadedBy: options.uploadedBy,
      count: data.length
    })
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2), 'utf8')
  }
}

export const pipeline = new ImportPipeline()
export default { pipeline }
