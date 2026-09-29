import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeArabic } from './normalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// قائمة الأحياء والمحافظات المعتمدة لمشاريع إدارة المشاريع (NWC)
export function buildDistrictsClassification(projects) {
  const districtMap = {}

  projects.forEach(p => {
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

  // فرز وتنسيق النتيجة
  const result = Object.values(districtMap).map(d => ({
    district: d.district,
    normalizedDistrict: d.normalizedDistrict,
    type: d.type,
    programManagers: Array.from(d.programManagers),
    contractors: Array.from(d.contractors),
    sectors: Array.from(d.sectors),
    projectsCount: d.projects.length,
    projects: d.projects
  })).sort((a, b) => a.district.localeCompare(b.district, 'ar'))

  return result
}

// فحص ما إذا كان الحي يتبع مشاريع إدارة المشاريع
export function isDistrictInCapitalProjects(districtName, classification) {
  if (!districtName) return false
  const norm = normalizeArabic(districtName).replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim()
  return classification.some(c => 
    c.normalizedDistrict === norm || 
    c.normalizedDistrict.includes(norm) || 
    norm.includes(c.normalizedDistrict)
  )
}

// الحصول على مشاريع حي معين
export function getProjectsForDistrict(districtName, classification) {
  if (!districtName) return []
  const norm = normalizeArabic(districtName).replace(/^حي\s+/, '').replace(/^محافظة\s+/, '').trim()
  const found = classification.find(c => 
    c.normalizedDistrict === norm || 
    c.normalizedDistrict.includes(norm) || 
    norm.includes(c.normalizedDistrict)
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
