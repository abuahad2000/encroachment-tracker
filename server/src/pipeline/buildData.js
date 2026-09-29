import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseReports } from './parseReports.js'
import { parseProjects } from './parseProjects.js'
import { parseAllKMZ } from './parseKmz.js'
import { processReports } from './matchEngine.js'
import { matchGovernorateFeatureToProject } from './governorateMatcher.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function buildData(customReportsFile = null) {
  console.log('🔄 جاري معالجة البيانات...')

  try {
    // ✅ شبكة الأمان الذكية: تحديد المسار والتحقق من وجود الملف قبل المعالجة
    const defaultPath = path.join(__dirname, '../../../XLSX/بلاغات تعدي مقاولي شركة المياه الوطنية 12 سبتمبر.xlsx')
    const targetFile = customReportsFile || defaultPath

    if (!fs.existsSync(targetFile)) {
      console.warn(`⚠️ تحذير: ملف الإكسيل غير موجود في: ${targetFile}`)
      
      const outputDir = path.join(__dirname, '../../data/generated')
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const reportsPath = path.join(outputDir, 'reports.json')
      
      // 🧠 الذكاء الجديد: التحقق من وجود بيانات محفوظة مسبقاً وعدم مسحها
      if (fs.existsSync(reportsPath)) {
        try {
          const existingReports = JSON.parse(fs.readFileSync(reportsPath, 'utf-8'))
          if (existingReports && existingReports.length > 0) {
            console.log('✅ تم العثور على بيانات موجودة مسبقاً، سيتم الاحتفاظ بها وعدم مسحها.')
            
            // إعادة حساب الإحصائيات والمدراء بناءً على البيانات الموجودة لضمان تحديث الواجهة
            let projects = []
            try {
              const { parseProjects } = await import('./parseProjects.js')
              projects = parseProjects()
            } catch(e) {}
            
            const { processReports } = await import('./matchEngine.js')
            const processedReports = processReports(existingReports, projects, { water: {features:[]}, sanitation: {features:[]}, governorates: {features:[]} }, [], { customContractors: [], aliases: {} })
            
            const stats = calculateStats(processedReports, projects)
            const managers = createManagersData(projects, processedReports)

            fs.writeFileSync(reportsPath, JSON.stringify(processedReports, null, 2), 'utf-8')
            fs.writeFileSync(path.join(outputDir, 'stats.json'), JSON.stringify(stats, null, 2), 'utf-8')
            fs.writeFileSync(path.join(outputDir, 'managers.json'), JSON.stringify(managers, null, 2), 'utf-8')
            
            console.log('✅ تم الاحتفاظ بالبيانات وإعادة حساب الإحصائيات بنجاح.')
            return { success: true, stats, message: 'تم استخدام البيانات الموجودة مسبقاً' }
          }
        } catch (e) {
          console.warn('خطأ في قراءة البيانات الموجودة:', e.message)
        }
      }

      // محاولة القراءة من المسار الأصلي كبديل (إذا كان محفوظاً في المستودع)
      const originalReportsPath = path.join(__dirname, '../../data/reports.json')
      if (fs.existsSync(originalReportsPath)) {
        try {
          const originalData = JSON.parse(fs.readFileSync(originalReportsPath, 'utf-8'))
          if (originalData && originalData.length > 0) {
            fs.writeFileSync(reportsPath, JSON.stringify(originalData, null, 2), 'utf-8')
            console.log('✅ تم نسخ البيانات من المسار الأصلي بنجاح.')
            return { success: true, message: 'تم استخدام البيانات الأصلية' }
          }
        } catch (e) {}
      }

      // 🛑 في حال عدم وجود ملف بلاغات مسبق، نحرص دائماً على بناء المشاريع والطبقات الجغرافية من الملفات المصدرية
      console.log('🔄 جاري بناء المشاريع والطبقات الجغرافية الأساسية...')
      let projects = []
      let geoJsonData = { water: { features: [] }, sanitation: { features: [] }, governorates: { features: [] } }
      try { projects = parseProjects() } catch(e) { console.warn('Error parsing projects:', e) }
      try { geoJsonData = await parseAllKMZ() } catch(e) { console.warn('Error parsing KMZ:', e) }
      const emptyReports = []
      const stats = calculateStats(emptyReports, projects)
      const managers = createManagersData(projects, emptyReports)

      if (!fs.existsSync(reportsPath)) {
        fs.writeFileSync(reportsPath, '[]', 'utf-8')
      }
      fs.writeFileSync(path.join(outputDir, 'projects.json'), JSON.stringify(projects, null, 2), 'utf-8')
      fs.writeFileSync(path.join(outputDir, 'stats.json'), JSON.stringify(stats, null, 2), 'utf-8')
      fs.writeFileSync(path.join(outputDir, 'managers.json'), JSON.stringify(managers, null, 2), 'utf-8')
      fs.writeFileSync(path.join(outputDir, 'layers.json'), JSON.stringify(geoJsonData, null, 2), 'utf-8')

      return { success: true, stats, message: 'تم تهيئة المشاريع والطبقات بنجاح' }
    }

    // ==========================================
    // باقي الكود الأصلي (يعمل فقط عند وجود الملف أو عند الرفع من الواجهة)
    // ==========================================
    console.log('📖 قراءة البلاغات...')
    const reports = parseReports(customReportsFile)
    console.log(`   ✓ تم قراءة ${reports.length} بلاغاً`)

    console.log('📖 قراءة المشاريع...')
    const projects = parseProjects()
    console.log(`   ✓ تم قراءة ${projects.length} مشروعاً`)

    console.log('📖 قراءة طبقات KMZ...')
    const geoJsonData = await parseAllKMZ()
    console.log('   ✓ تم قراءة ملفات KMZ')

    // 2. Load overrides & contractors config
    const overridesPath = path.join(__dirname, '../../data/overrides.json')
    const overridesBackupPath = path.join(__dirname, '../../data/overrides_backup.json')
    const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()
    const overridesMap = new Map()

    if (fs.existsSync(overridesBackupPath)) {
      try {
        const b = JSON.parse(fs.readFileSync(overridesBackupPath, 'utf-8'))
        if (Array.isArray(b)) {
          b.forEach(o => {
            const k = normalizeId(o.reportId)
            if (k) overridesMap.set(k, o)
          })
        }
      } catch (e) {}
    }

    if (fs.existsSync(overridesPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
        if (Array.isArray(p)) {
          p.forEach(o => {
            const k = normalizeId(o.reportId)
            if (k) overridesMap.set(k, { ...overridesMap.get(k), ...o })
          })
        }
      } catch (e) {}
    }

    const AUTOMATED_EXCLUSIONS = [
      'عدم تطابق الحي مع نطاق المشروع (أعمال مدنية/تشغيل وصيانة)',
      'خارج النطاق الجغرافي للمشاريع (غير تابع لنطاق مكاني)',
      'المقاول بملف التعديات لا يتوافق مع مدير البرنامج/المشروع',
      'بلاغ شبكة مياه يقع ضمن نطاق مشروع صرف صحي (عدم تطابق نوع الخدمة)',
      'خارج مسار خطوط المشروع المعتمدة (تابع للصيانة)'
    ]
    for (const [k, v] of overridesMap.entries()) {
      if (v.excluded && AUTOMATED_EXCLUSIONS.includes(v.reason)) {
        overridesMap.delete(k)
      }
    }

    const overrides = Array.from(overridesMap.values())
    if (overrides.length > 0) {
      try {
        fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2))
        fs.writeFileSync(overridesBackupPath, JSON.stringify(overrides, null, 2))
      } catch (e) {}
    }

    const contractorsPath = path.join(__dirname, '../../data/contractors.json')
    let contractorsConfig = { customContractors: [], aliases: {} }
    if (fs.existsSync(contractorsPath)) {
      try {
        contractorsConfig = JSON.parse(fs.readFileSync(contractorsPath, 'utf-8'))
      } catch (e) {
        contractorsConfig = { customContractors: [], aliases: {} }
      }
    }

    console.log('⚙️  جاري معالجة ومطابقة البلاغات...')
    const processedReports = processReports(reports, projects, geoJsonData, overrides, contractorsConfig)
    const stats = calculateStats(processedReports, projects)
    const managers = createManagersData(projects, processedReports)

    const outputDir = path.join(__dirname, '../../data/generated')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(path.join(outputDir, 'reports.json'), JSON.stringify(processedReports, null, 2))
    fs.writeFileSync(path.join(outputDir, 'projects.json'), JSON.stringify(projects, null, 2))
    fs.writeFileSync(path.join(outputDir, 'stats.json'), JSON.stringify(stats, null, 2))
    fs.writeFileSync(path.join(outputDir, 'managers.json'), JSON.stringify(managers, null, 2))

    const cleanStr = (s) => (s || '').replace(/[^\w\d\u0600-\u06FF]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    const enrichFeatures = (features) => {
      for (const f of features) {
        const op = f.properties?.operationNumber
        const fName = f.properties?.name || ''
        const cFName = cleanStr(fName)
        let matched = null
        if (f.properties?.isNimalLines || f.properties?.projectId === '61') {
          matched = projects.find(p => String(p.id).trim() === '61' || (p.name?.includes('المرحلة الرابعة') && p.contractor?.includes('النمال')))
        }
        if (!matched && op) {
          matched = projects.find(p => p.operationNumber && p.operationNumber.trim() === op.trim())
        }
        if (!matched && cFName) {
          matched = projects.find(p => {
            const cPName = cleanStr(p.name)
            return cPName && (cFName.includes(cPName) || cPName.includes(cFName))
          })
        }
        if (matched) {
          f.properties.programManager = matched.programManager || '-'
          f.properties.projectManager = matched.projectManager || '-'
          f.properties.contractor = matched.contractor || '-'
          f.properties.po = matched.po || '-'
          f.properties.status = matched.status || 'جاري'
          f.properties.subProgram = matched.subProgram || ''
          f.properties.scope = matched.scope || ''
        }
      }
    }

    const enrichGovFeatures = (features) => {
      for (const f of features) {
        const matched = matchGovernorateFeatureToProject(f, projects)
        if (matched) {
          f.properties.projectId = matched.id
          f.properties.programManager = matched.programManager || '-'
          f.properties.projectManager = matched.projectManager || '-'
          f.properties.contractor = matched.contractor || '-'
          f.properties.po = matched.po || '-'
          f.properties.status = matched.status || 'جاري'
          f.properties.subProgram = matched.subProgram || ''
          f.properties.scope = matched.scope || ''
          f.properties.projectName = matched.name
          f.properties.sector = (matched.name?.includes('صرف') || matched.subProgram?.includes('صرف')) ? 'sanitation' : 'water'
        }
      }
    }

    enrichFeatures(geoJsonData.water?.features || [])
    enrichFeatures(geoJsonData.sanitation?.features || [])
    enrichGovFeatures(geoJsonData.governorates?.features || [])

    fs.writeFileSync(path.join(outputDir, 'layers.json'), JSON.stringify(geoJsonData, null, 2))
    syncContractorDirectory(projects)

    console.log('\n✅ تم إتمام المعالجة بنجاح!')
    console.log(`\n📊 الإحصائيات:`)
    console.log(`   • إجمالي البلاغات: ${reports.length}`)
    console.log(`   • البلاغات المطابقة: ${stats.matchedReports}`)
    console.log(`   • تمت المعالجة: ${stats.processedCount}`)
    console.log(`   • تحت المعالجة: ${stats.underProcessingCount}`)
    console.log(`   • متوسط التأخير: ${stats.avgDelay} يوم`)
    console.log(`   • آخر تحديث: ${new Date().toLocaleString('ar-SA')}`)

    return { success: true, stats }
  } catch (err) {
    console.error('❌ خطأ في المعالجة:', err.message)
    throw err
  }
}

export function calculateStats(reports, projects) {
  const assigned = reports.filter(r => r.matched && r.project && !r.excluded)
  const pending = assigned.filter(r => r.status === 'تحت معالجة المقاول')
  const inProgress = assigned.filter(r => r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة')
  const processed = assigned.filter(r => r.status === 'تمت المعالجة')
  const excluded = reports.filter(r => r.excluded)
  const underProcessing = pending
  const ageDays = pending.filter(r => r.ageDays >= 0).map(r => r.ageDays).sort((a, b) => a - b)
  const statusDist = {}
  for (const r of reports) { statusDist[r.status] = (statusDist[r.status] || 0) + 1 }
  const topManagers = {}
  for (const r of pending) {
    const rawMgr = r.project?.programManager
    if (rawMgr && rawMgr !== '-' && rawMgr !== 'غير محدد') {
      const mgrName = normalizeManagerName(rawMgr)
      topManagers[mgrName] = (topManagers[mgrName] || 0) + 1
    }
  }
  return {
    totalReports: reports.length,
    totalActive: pending.length,
    pendingCount: pending.length,
    inProgressCount: inProgress.length,
    processedCount: processed.length,
    assignedCount: assigned.length,
    excludedCount: excluded.length,
    matchedReports: pending.length,
    underProcessingCount: underProcessing.length,
    archivedCount: processed.length,
    avgDelay: ageDays.length > 0 ? Math.round(ageDays.reduce((a, b) => a + b) / ageDays.length) : 0,
    medianDelay: ageDays.length > 0 ? ageDays[Math.floor(ageDays.length / 2)] : 0,
    maxDelay: ageDays.length > 0 ? Math.max(...ageDays) : 0,
    statusDistribution: statusDist,
    topManagers: Object.entries(topManagers).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    lastUpdate: new Date().toISOString(),
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'جاري').length,
    deliveredProjects: projects.filter(p => p.status === 'مسلم ابتدائي').length,
  }
}

export const CANONICAL_MANAGERS = {
  'تركي الاسمري': 'تركي ظافر يحيى الاسمري',
  'تركي ظافر يحيى الاسمري': 'تركي ظافر يحيى الاسمري',
  'عسكر لسلوم': 'عسكر لسلوم',
  'عبدالله علي العنزي': 'عبدالله علي العنزي',
  'عبدالله العنزي': 'عبدالله علي العنزي',
  'سفر العتيبي': 'سفر العتيبي',
  'علي الشهري': 'علي الشهري',
  'أمجد الفالح': 'أمجد الفالح',
  'عبدالله الأسود العنزي': 'عبدالله الأسود العنزي',
  'عبدالله الأسود': 'عبدالله الأسود العنزي',
  'علي القحطاني': 'علي القحطاني',
  'شاكر الحقباني': 'شاكر الحقباني',
  'سعيد الحارث': 'سعيد الحارث',
  'فهد العنزي': 'فهد العنزي'
}

export function normalizeManagerName(name) {
  if (!name) return ''
  const trimmed = String(name).trim()
  return CANONICAL_MANAGERS[trimmed] || trimmed
}

const MANAGER_SLUGS = {
  'تركي ظافر يحيى الاسمري': 'turki-alasmari',
  'تركي الاسمري': 'turki-alasmari',
  'عسكر لسلوم': 'askar-lasloum',
  'عبدالله علي العنزي': 'abdullah-alenezi',
  'عبدالله العنزي': 'abdullah-alenezi',
  'سفر العتيبي': 'safar-alotaibi',
  'علي الشهري': 'ali-alshehri',
  'أمجد الفالح': 'amjad-alfaleh',
  'عبدالله الأسود العنزي': 'abdullah-alaswad',
  'عبدالله الأسود': 'abdullah-alaswad',
  'علي القحطاني': 'ali-alqahtani',
  'شاكر الحقباني': 'shaker-alhaqbani',
  'سعيد الحارث': 'saeed-alharthe',
  'فهد العنزي': 'fahad-alenezi'
}

export function createManagersData(projects, reports) {
  const managers = {}
  for (const proj of projects) {
    const rawMgr = proj.programManager
    if (!rawMgr || rawMgr === '-' || rawMgr === 'غير محدد') continue
    const mgr = normalizeManagerName(rawMgr)
    if (!managers[mgr]) {
      managers[mgr] = { name: mgr, projects: [], reports: [], pendingReports: [], inProgressReports: [], processedReports: [] }
    }
    managers[mgr].projects.push(proj)
  }
  for (const report of reports) {
    if (report.matched && report.project && !report.excluded) {
      const rawMgr = report.project.programManager
      if (!rawMgr || rawMgr === '-' || rawMgr === 'غير محدد') continue
      const mgr = normalizeManagerName(rawMgr)
      if (!managers[mgr]) {
        managers[mgr] = { name: mgr, projects: [], reports: [], pendingReports: [], inProgressReports: [], processedReports: [] }
      }
      managers[mgr].reports.push(report)
      if (report.status === 'تحت معالجة المقاول') managers[mgr].pendingReports.push(report)
      else if (report.status === 'تمت المعالجة') managers[mgr].processedReports.push(report)
      else managers[mgr].inProgressReports.push(report)
    }
  }
  return Object.values(managers).map(m => {
    const slug = MANAGER_SLUGS[m.name] || encodeURIComponent(m.name.toLowerCase().replace(/\s+/g, '-'))
    const firstProj = m.projects[0]
    return {
      id: slug, slug, name: m.name,
      scope: firstProj?.subProgram || firstProj?.scope || 'متعدد',
      subProgram: firstProj?.subProgram || '',
      activeProjects: m.projects.filter(p => p.status === 'جاري').length,
      deliveredProjects: m.projects.filter(p => p.status === 'مسلم ابتدائي').length,
      totalProjects: m.projects.length,
      pendingReportsCount: m.pendingReports.length,
      inProgressReportsCount: m.inProgressReports.length,
      processedReportsCount: m.processedReports.length,
      activeReports: m.pendingReports.length,
      totalReportsCount: m.reports.length,
      phone: firstProj?.progPhone || '-',
      email: firstProj?.progEmail || '-',
      projects: m.projects.map(p => ({ id: p.id, name: p.name, scope: p.scope, status: p.status, contractor: p.contractor }))
    }
  }).sort((a, b) => b.pendingReportsCount - a.pendingReportsCount || b.inProgressReportsCount - a.inProgressReportsCount)
}

export function syncContractorDirectory(projects) {
  const dirPath = path.join(__dirname, '../../data/contractor_directory.json')
  const backupDirPath = path.join(__dirname, '../../data/contractor_directory_backup.json')
  const profilesPath = path.join(__dirname, '../../data/contractor_profiles.json')
  const backupProfilesPath = path.join(__dirname, '../../data/contractor_profiles_backup.json')

  let profiles = {}
  if (fs.existsSync(backupProfilesPath)) { try { profiles = { ...profiles, ...JSON.parse(fs.readFileSync(backupProfilesPath, 'utf-8')) } } catch (e) {} }
  if (fs.existsSync(profilesPath)) { try { profiles = { ...profiles, ...JSON.parse(fs.readFileSync(profilesPath, 'utf-8')) } } catch (e) {} }

  const existingMap = new Map()
  const manualItems = []
  const loadItems = (filePath) => {
    if (!fs.existsSync(filePath)) return
    try {
      const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (!item) return
          const isManual = item.source === 'manual_added' || String(item.id).startsWith('manual_')
          if (isManual) {
            if (!manualItems.some(m => String(m.id) === String(item.id))) manualItems.push(item)
            return
          }
          const idKey = String(item.id).trim()
          if (!existingMap.has(idKey)) {
            existingMap.set(idKey, item)
          } else {
            const prev = existingMap.get(idKey)
            existingMap.set(idKey, {
              ...prev, ...item,
              crNumber: (item.crNumber && item.crNumber.trim()) || prev.crNumber || '',
              unifiedNumber: (item.unifiedNumber && item.unifiedNumber.trim()) || prev.unifiedNumber || '',
              managerName: (item.managerName && item.managerName.trim()) || prev.managerName || '',
              managerPhone: (item.managerPhone && item.managerPhone.trim()) || prev.managerPhone || '',
              managerEmail: (item.managerEmail && item.managerEmail.trim()) || prev.managerEmail || ''
            })
          }
          const cName = (item.contractorName || '').trim()
          if (cName && cName !== 'غير محدد' && cName !== '-') {
            const hasData = Boolean(item.crNumber || item.managerPhone || item.managerEmail || item.managerName || item.unifiedNumber)
            if (hasData) {
              const pProf = profiles[cName] || {}
              profiles[cName] = {
                crNumber: (item.crNumber && item.crNumber.trim()) || pProf.crNumber || '',
                unifiedNumber: (item.unifiedNumber && item.unifiedNumber.trim()) || pProf.unifiedNumber || '',
                managerName: (item.managerName && item.managerName.trim()) || pProf.managerName || '',
                managerPhone: (item.managerPhone && item.managerPhone.trim()) || pProf.managerPhone || '',
                managerEmail: (item.managerEmail && item.managerEmail.trim()) || pProf.managerEmail || '',
                updatedAt: item.updatedAt || new Date().toISOString()
              }
            }
          }
        })
      }
    } catch (e) {}
  }
  loadItems(backupDirPath)
  loadItems(dirPath)

  const updatedDirectory = []
  manualItems.forEach(m => updatedDirectory.push(m))
  const matchedExistingIds = new Set()

  if (Array.isArray(projects)) {
    projects.forEach(p => {
      const pId = String(p.id).trim()
      const pOp = (p.operationNumber || '').trim()
      const pName = (p.name || '').trim()
      const cName = (p.contractor || '').trim() || 'غير محدد'
      const prof = profiles[cName] || {}
      let existing = existingMap.get(pId)
      if (!existing && pOp) {
        for (const [_, item] of existingMap.entries()) {
          if (item.projectNumber && item.projectNumber.trim() === pOp) { existing = item; break }
        }
      }
      if (!existing && pName && cName) {
        for (const [_, item] of existingMap.entries()) {
          if (item.projectName && item.projectName.trim() === pName && item.contractorName === cName) { existing = item; break }
        }
      }
      if (existing) {
        matchedExistingIds.add(String(existing.id).trim())
        updatedDirectory.push({
          ...existing, id: pId, contractorName: existing.contractorName || cName,
          projectNumber: p.operationNumber || p.id || existing.projectNumber || '-',
          projectName: p.name || existing.projectName || '-',
          projectLocation: p.scope || p.subProgram || existing.projectLocation || '-',
          programManager: (existing.programManager && existing.programManager !== '-') ? existing.programManager : (p.programManager || '-'),
          projectManager: (existing.projectManager && existing.projectManager !== '-') ? existing.projectManager : (p.projectManager || '-'),
          status: p.status || existing.status || 'جاري', source: 'nwc_project',
          crNumber: (existing.crNumber && existing.crNumber.trim()) || prof.crNumber || '',
          unifiedNumber: (existing.unifiedNumber && existing.unifiedNumber.trim()) || prof.unifiedNumber || '',
          managerName: (existing.managerName && existing.managerName.trim()) || prof.managerName || '',
          managerPhone: (existing.managerPhone && existing.managerPhone.trim()) || prof.managerPhone || '',
          managerEmail: (existing.managerEmail && existing.managerEmail.trim()) || prof.managerEmail || '',
          updatedAt: existing.updatedAt || new Date().toISOString()
        })
      } else {
        updatedDirectory.push({
          id: pId, contractorName: cName, projectNumber: p.operationNumber || p.id || '-',
          projectName: p.name || '-', projectLocation: p.scope || p.subProgram || '-',
          programManager: p.programManager || '-', projectManager: p.projectManager || '-',
          crNumber: prof.crNumber || '', unifiedNumber: prof.unifiedNumber || '',
          managerName: prof.managerName || '', managerPhone: prof.managerPhone || '',
          managerEmail: prof.managerEmail || '', status: p.status || 'جاري',
          source: 'nwc_project', updatedAt: new Date().toISOString()
        })
      }
    })
  }
  for (const [idKey, item] of existingMap.entries()) {
    if (!matchedExistingIds.has(idKey)) updatedDirectory.push(item)
  }

  try {
    const dataDir = path.dirname(dirPath)
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(dirPath, JSON.stringify(updatedDirectory, null, 2))
    fs.writeFileSync(backupDirPath, JSON.stringify(updatedDirectory, null, 2))
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2))
    fs.writeFileSync(backupProfilesPath, JSON.stringify(profiles, null, 2))
    console.log(`📁 تم مزامنة وتأمين بيانات جدول المقاولين (${updatedDirectory.length} سجل)`)
  } catch (e) {
    console.error('Error saving synchronized contractor directory:', e.message)
  }
  return updatedDirectory
}

// Run if called directly from CLI
if (process.argv[1] && (
  process.argv[1].endsWith('buildData.js') ||
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()
)) {
  buildData().catch((err) => {
    console.error('buildData error:', err)
    process.exit(1)
  })
}
