import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
      // ===== المرحلة 1: التنظيف =====
      this.addStage('Cleaning', 'جاري تنظيف البيانات...')
      data = this.stage1_clean(data)
      this.completeStage()

      // ===== المرحلة 2: التصنيف =====
      this.addStage('Classification', 'جاري تصنيف المشاريع...')
      data = this.stage2_classify(data)
      this.completeStage()

      // ===== المرحلة 3: توحيد الأسماء =====
      this.addStage('Normalization', 'جاري توحيد أسماء المدراء...')
      data = this.stage3_normalize(data)
      this.completeStage()

      // ===== المرحلة 4: الربط الدقيق مع نظام الثقة =====
      this.addStage('Mapping', 'جاري الربط بالمشاريع...')
      const mappingResult = await this.stage4_map(data)
      data = mappingResult.data
      audit.matched = mappingResult.matched
      audit.unmatched = mappingResult.unmatched
      this.completeStage()

      // ===== المرحلة 5: تطبيق قواعد الاستبعاد =====
      this.addStage('Exclusion', 'جاري تطبيق قواعد الاستبعاد...')
      data = this.stage5_exclude(data)
      this.completeStage()

      // ===== المرحلة 6: التحقق والحفظ =====
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

  // ===== المرحلة 1: التنظيف =====
  stage1_clean(data) {
    const seen = new Set()
    return data
      .filter(row => row && typeof row === 'object')
      .map(row => ({
        id: row.id || row['رقم البلاغ'] || row.reportId,
        licenseNumber: row.licenseNumber || row['رقم الرخصة'] || '',
        district: row.district || row['الحي'] || row.city || '',
        city: row.city || row['المحافظة'] || 'الرياض',
        contractorName: row.contractorName || row.contractor || row['المقاول'] || '',
        description: row.description || row['الوصف'] || row['Description'] || '',
        status: row.status || row['الحالة'] || 'تحت معالجة المقاول',
        latitude: parseFloat(row.latitude || row.lat || 0),
        longitude: parseFloat(row.longitude || row.lng || row.lon || 0),
        ageDays: parseInt(row.ageDays || row['أيام التأخير'] || 0),
        projectName: row.projectName || row['اسم المشروع'] || '',
        operationNumber: row.operationNumber || row['رقم العملية'] || '',
        sector: row.sector || ''
      }))
      .filter(row => {
        if (row.latitude && (row.latitude < 15 || row.latitude > 30)) return false
        if (row.longitude && (row.longitude < 34 || row.longitude > 56)) return false
        const key = row.licenseNumber || `${row.district}-${row.contractorName}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  // ===== المرحلة 2: التصنيف =====
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

  // ===== المرحلة 3: توحيد الأسماء =====
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

  // ===== المرحلة 4: الربط الدقيق مع نظام الثقة (النسخة المصححة والمدمجة) =====
  async stage4_map(data) {
    const directProjectsPath = path.join(__dirname, '../../data/projects.json')
    const generatedProjectsPath = path.join(__dirname, '../../data/generated/projects.json')
    const projectsPath = fs.existsSync(directProjectsPath) ? directProjectsPath : generatedProjectsPath

    const projects = fs.existsSync(projectsPath) 
      ? JSON.parse(fs.readFileSync(projectsPath, 'utf8')) 
      : []

    let matched = 0
    let unmatched = 0
    let lowConfidence = 0

    const mappedData = data.map(row => {
      let bestMatch = null
      let bestScore = 0
      let matchReason = ''

      projects.forEach(project => {
        let score = 0
        let reasons = []

        // المعيار 1: تطابق اسم المشروع (40 نقطة)
        if (row.projectName && project.name) {
          const rowName = row.projectName.toLowerCase().trim()
          const projName = project.name.toLowerCase().trim()
          if (rowName === projName) {
            score += 40
            reasons.push('تطابق تام في اسم المشروع')
          } else if (rowName.includes(projName) || projName.includes(rowName)) {
            score += 25
            reasons.push('تطابق جزئي في اسم المشروع')
          }
        }

        // المعيار 2: تطابق رقم العملية (30 نقطة) - الأقوى
        if (row.operationNumber && project.operationNumber) {
          if (row.operationNumber === project.operationNumber) {
            score += 30
            reasons.push('تطابق رقم العملية')
          }
        }

        // المعيار 3: تطابق المقاول + الحي معاً (20 نقطة)
        if (row.contractorName && row.district && project.contractor && project.scope) {
          const contractorMatch = row.contractorName === project.contractor
          const districtMatch = project.scope.includes(row.district) || project.name.includes(row.district)
          if (contractorMatch && districtMatch) {
            score += 20
            reasons.push('تطابق المقاول والحي')
          } else if (contractorMatch) {
            score += 8
            reasons.push('تطابق المقاول فقط')
          }
        }

        // المعيار 4: تطابق القطاع (10 نقاط)
        if (row.sector && project.sector) {
          if (row.sector === project.sector) {
            score += 10
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
      if (bestScore >= 70) {
        matched++
        return {
          ...row,
          project: bestMatch,
          projectId: bestMatch.id,
          programManager: bestMatch.programManager,
          projectManager: bestMatch.projectManager,
          contractor: bestMatch.contractor || row.contractorName,
          matched: true,
          confidence: 'high',
          confidenceScore: bestScore,
          matchReason,
          needsReview: false
        }
      } else if (bestScore >= 40) {
        lowConfidence++
        return {
          ...row,
          project: bestMatch,
          projectId: bestMatch.id,
          programManager: bestMatch ? bestMatch.programManager : row.programManager,
          matched: true,
          confidence: 'medium',
          confidenceScore: bestScore,
          matchReason,
          needsReview: true // ⚠️ علامة للمراجعة اليدوية
        }
      } else {
        unmatched++
        return {
          ...row,
          matched: false,
          confidence: 'low',
          confidenceScore: bestScore,
          matchReason: 'لا يوجد تطابق كافٍ',
          needsReview: true // ⚠️ علامة للمراجعة اليدوية
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

      // استبعاد المعالجة
      if (row.status === 'تمت المعالجة') {
        return { ...row, excluded: true, excludedReason: 'تمت المعالجة' }
      }

      // استبعاد غير المرتبط
      if (!row.matched && !row.project) {
        return { ...row, excluded: true, excludedReason: 'غير مرتبط بمشروع رأسمالي' }
      }

      return row
    })
  }

  // ===== المرحلة 6: الحفظ =====
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
