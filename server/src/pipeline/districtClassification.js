import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeArabic } from './normalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { DATA_DIR } from '../config.js'

// مسارات ملفات أحياء الصيانة
const maintenanceDistrictsRefPath = path.join(DATA_DIR, 'reference/maintenance_districts.json')
const maintenanceDistrictsPath = path.join(DATA_DIR, 'maintenance_districts.json')
const maintenanceDistrictsBackupPath = path.join(DATA_DIR, 'maintenance_districts_backup.json')

// تحميل قائمة أحياء الصيانة المعتمدة
export function loadMaintenanceDistricts() {
  try {
    if (fs.existsSync(maintenanceDistrictsRefPath)) {
      const content = fs.readFileSync(maintenanceDistrictsRefPath, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) return parsed
    }
    if (fs.existsSync(maintenanceDistrictsPath)) {
      const content = fs.readFileSync(maintenanceDistrictsPath, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) return parsed
    }
    if (fs.existsSync(maintenanceDistrictsBackupPath)) {
      const content = fs.readFileSync(maintenanceDistrictsBackupPath, 'utf-8')
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (err) {
    console.error('Error loading maintenance districts:', err)
  }
  return []
}

// حفظ قائمة أحياء الصيانة
export function saveMaintenanceDistricts(districtsList) {
  try {
    const refDir = path.dirname(maintenanceDistrictsRefPath)
    if (!fs.existsSync(refDir)) fs.mkdirSync(refDir, { recursive: true })
    const content = JSON.stringify(districtsList, null, 2)
    fs.writeFileSync(maintenanceDistrictsRefPath, content, 'utf-8')
    return true
  } catch (err) {
    console.error('Error saving maintenance districts:', err)
    return false
  }
}

// فحص ما إذا كان الحي مصنف كحي صيانة مستقل (مستبعد مباشرة من المشاريع)
export function isDistrictInMaintenance(districtName, maintenanceList = null) {
  if (!districtName) return false
  const list = maintenanceList || loadMaintenanceDistricts()
  if (!list || list.length === 0) return false

  const norm = normalizeArabic(districtName).replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim().toLowerCase()
  if (!norm) return false

  return list.some(item => {
    const itemNorm = (item.normalizedDistrict || normalizeArabic(item.district || ''))
      .replace(/^حي\s+/, '')
      .replace(/^محافظة\s+/, '')
      .trim()
      .toLowerCase()
    if (!itemNorm) return false
    return itemNorm === norm || itemNorm.includes(norm) || norm.includes(itemNorm)
  })
}

// إضافة حي صيانة جديد
export function addMaintenanceDistrict({ district, notes = '', city = 'مدينة الرياض' }) {
  if (!district || !String(district).trim()) {
    throw new Error('اسم الحي مطلوب')
  }
  const cleanDistrict = String(district).trim().replace(/^حي\s+/, '').trim()
  const norm = normalizeArabic(cleanDistrict)

  const list = loadMaintenanceDistricts()
  const exists = list.some(d => {
    const dNorm = (d.normalizedDistrict || normalizeArabic(d.district || '')).replace(/^حي\s+/, '').trim()
    return dNorm === norm
  })

  if (exists) {
    return { success: false, message: 'الحي موجود بالفعل ضمن أحياء الصيانة', list }
  }

  const newEntry = {
    id: `maint_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    district: cleanDistrict,
    normalizedDistrict: norm,
    notes: notes ? String(notes).trim() : 'حي صيانة (مستبعد مباشرة من المشاريع الرأسمالية)',
    city: city || 'مدينة الرياض',
    createdAt: new Date().toISOString()
  }

  list.push(newEntry)
  saveMaintenanceDistricts(list)
  return { success: true, entry: newEntry, list }
}

// حذف حي صيانة
export function removeMaintenanceDistrict(identifier) {
  if (!identifier) return { success: false, message: 'معرف أو اسم الحي مطلوب' }
  const clean = String(identifier).trim()
  const norm = normalizeArabic(clean).replace(/^حي\s+/, '').trim()

  const list = loadMaintenanceDistricts()
  const filtered = list.filter(d => {
    if (d.id && String(d.id).trim() === clean) return false
    const dNorm = (d.normalizedDistrict || normalizeArabic(d.district || '')).replace(/^حي\s+/, '').trim()
    return dNorm !== norm
  })

  if (filtered.length === list.length) {
    return { success: false, message: 'لم يتم العثور على الحي لحذفه', list }
  }

  saveMaintenanceDistricts(filtered)
  return { success: true, list: filtered }
}

// قائمة الأحياء والمحافظات المعتمدة لمشاريع إدارة المشاريع (NWC) مع دمج أحياء الصيانة
export function buildDistrictsClassification(projects) {
  const districtMap = {}

  projects.forEach(p => {
    if (p.status === 'مسحوب') return
    const scope = p.scope || ''
    if (!scope || scope.includes('شامل')) return

    const isGov = scope.includes('محافظة') || p.subProgram?.includes('المحافظات')
    const items = scope
      .split(/\s+و\s+|،|,|\s*–\s*|\s*-\s*/)
      .map(s => s.trim().replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim())
      .filter(s => s.length >= 2)

    items.forEach(d => {
      const normD = normalizeArabic(d)
      if (!districtMap[normD]) {
        districtMap[normD] = {
          district: d,
          normalizedDistrict: normD,
          type: isGov ? 'محافظة / مركز' : 'حي بمدينة الرياض',
          programManagers: new Set(),
          contractors: new Set(),
          sectors: new Set(),
          projects: []
        }
      }

      if (p.programManager && p.programManager !== '-' && p.programManager !== 'غير محدد') {
        districtMap[normD].programManagers.add(p.programManager)
      }
      if (p.contractor && p.contractor !== '-' && p.contractor !== 'غير محدد') {
        districtMap[normD].contractors.add(p.contractor)
      }
      
      const sector = (p.name?.includes('صرف') || p.subProgram?.includes('صرف')) ? 'صرف صحي' : 'مياه'
      districtMap[normD].sectors.add(sector)

      districtMap[normD].projects.push({
        id: p.id,
        operationNumber: p.operationNumber,
        name: p.name,
        scope: p.scope,
        programManager: p.programManager,
        projectManager: p.projectManager,
        contractor: p.contractor,
        sector,
        status: p.status || 'جاري'
      })
    })
  })

  // دمج أحياء الصيانة (التي لا ترتبط بأي مشروع رأسمالي)
  const maintenanceDistricts = loadMaintenanceDistricts()
  const maintenanceResult = maintenanceDistricts.map(md => ({
    id: md.id,
    district: md.district,
    normalizedDistrict: md.normalizedDistrict || normalizeArabic(md.district),
    type: 'حي تابع للتشغيل والصيانة',
    isMaintenance: true,
    notes: md.notes || 'حي صيانة (مستبعد مباشرة من المشاريع)',
    city: md.city || 'مدينة الرياض',
    createdAt: md.createdAt,
    programManagers: ['إدارة التشغيل والصيانة'],
    contractors: [],
    sectors: ['تشغيل وصيانة'],
    projectsCount: 0,
    projects: []
  }))

  // فرز وتنسيق النتيجة
  const projectDistricts = Object.values(districtMap).map(d => ({
    district: d.district,
    normalizedDistrict: d.normalizedDistrict,
    type: d.type,
    isMaintenance: false,
    programManagers: Array.from(d.programManagers),
    contractors: Array.from(d.contractors),
    sectors: Array.from(d.sectors),
    projectsCount: d.projects.length,
    projects: d.projects
  })).sort((a, b) => a.district.localeCompare(b.district, 'ar'))

  return [...projectDistricts, ...maintenanceResult]
}

// فحص ما إذا كان الحي يتبع مشاريع إدارة المشاريع
export function isDistrictInCapitalProjects(districtName, classification) {
  if (!districtName) return false
  const norm = normalizeArabic(districtName).replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim()
  return classification.some(c => 
    !c.isMaintenance && (
      c.normalizedDistrict === norm || 
      c.normalizedDistrict.includes(norm) || 
      norm.includes(c.normalizedDistrict)
    )
  )
}

// الحصول على مشاريع حي معين
export function getProjectsForDistrict(districtName, classification) {
  if (!districtName) return []
  const norm = normalizeArabic(districtName).replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim()
  const found = classification.find(c => 
    !c.isMaintenance && (
      c.normalizedDistrict === norm || 
      c.normalizedDistrict.includes(norm) || 
      norm.includes(c.normalizedDistrict)
    )
  )
  return found ? found.projects : []
}

// حفظ التصنيف في مجلد generated
export function saveDistrictsClassification(classification) {
  const outputDir = path.join(__dirname, '../../data/generated')
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
  
  const filePath = path.join(outputDir, 'districts_classification.json')
  fs.writeFileSync(filePath, JSON.stringify(classification, null, 2), 'utf-8')
  return filePath
}
