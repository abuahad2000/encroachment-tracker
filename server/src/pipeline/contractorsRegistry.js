import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { normalizeArabic } from './normalize.js'
import { cleanContractorName } from './matchEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REGISTRY_PATH = path.join(__dirname, '../../data/reference/contractors_registry.json')

let cachedRegistry = null

export function loadContractorsRegistry() {
  if (cachedRegistry) return cachedRegistry

  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
      cachedRegistry = data
      return data
    } catch (e) {
      console.error('Error loading contractors registry:', e.message)
    }
  }

  return {
    _metadata: {},
    contractors: []
  }
}

export function reloadContractorsRegistry() {
  cachedRegistry = null
  return loadContractorsRegistry()
}

/**
 * Checks if a contractor name matches an entry in registry
 */
function matchesContractor(inputName, entry) {
  if (!inputName || !entry) return false
  const normInput = normalizeArabic(inputName).toLowerCase().trim()
  const cleanInput = cleanContractorName(inputName)

  const targets = [
    entry.name,
    entry.normalized_name,
    entry.clean_name,
    ...(entry.aliases || [])
  ].filter(Boolean)

  for (const t of targets) {
    const normTarget = normalizeArabic(t).toLowerCase().trim()
    const cleanTarget = cleanContractorName(t)

    if (normInput === normTarget || (cleanInput && cleanTarget && cleanInput === cleanTarget)) return true
    if (normInput.includes(normTarget) || normTarget.includes(normInput)) return true
    if (cleanInput && cleanTarget && (cleanInput.includes(cleanTarget) || cleanTarget.includes(cleanInput))) return true
  }

  return false
}

/**
 * Check if the contractor is classified as Operation & Maintenance (تشغيل وصيانة)
 * Takes report context into account to evaluate allowed exceptions (e.g., Al-Awali #57 for Civil Works)
 */
export function checkMaintenanceContractor(contractorName, report = null) {
  if (!contractorName) return { isMaintenance: false }
  const reg = loadContractorsRegistry()
  const contractors = reg.contractors || reg.maintenanceContractors || []

  for (const c of contractors) {
    const isMaint = c.department_type === 'maintenance' || c.classification === 'maintenance'
    if (!isMaint) continue

    if (matchesContractor(contractorName, c)) {
      // Check for exception rules:
      // 1. Civil Works (#57 Al-Awali)
      if (c.id === 'MNT-001' || c.name.includes('الأعمال المدنية') || c.name.includes('الاعمال المدنية')) {
        const repDistrict = normalizeArabic(report?.district || '').toLowerCase()
        const repDesc = normalizeArabic((report?.description || '') + ' ' + (report?.centerComment || '')).toLowerCase()
        if (repDistrict.includes('عوالي') || repDesc.includes('عوالي')) {
          return {
            isMaintenance: false,
            isAllowedException: true,
            allowedProjectId: '57',
            allowedDistrict: 'العوالي',
            notes: 'مشروع العوالي #57 استثناء معتمد'
          }
        }
      }

      // 2. Al-Areen (Al-Narjis #59)
      if (c.id === 'MNT-012' || c.name.includes('العرين')) {
        const repDistrict = normalizeArabic(report?.district || '').toLowerCase()
        const repDesc = normalizeArabic((report?.description || '') + ' ' + (report?.centerComment || '')).toLowerCase()
        if (repDistrict.includes('نرجس') || repDesc.includes('نرجس')) {
          return {
            isMaintenance: false,
            isAllowedException: true,
            allowedProjectId: '59',
            allowedDistrict: 'النرجس',
            notes: 'مشروع شبكات مياه النرجس #59 تحت م. عبدالله الأسود استثناء معتمد'
          }
        }
      }

      return {
        isMaintenance: true,
        contractorId: c.id,
        contractorName: c.name,
        reason: 'maintenance_contractor',
        category: c.category || 'تشغيل وصيانة',
        excludedReason: `المقاول (${c.name}) تابع لإدارة التشغيل والصيانة وليس للمشاريع الرأسمالية (${c.notes || c.category || 'تشغيل وصيانة'})`
      }
    }
  }

  return { isMaintenance: false }
}

/**
 * Check if the contractor is classified as Capital Projects.
 * Supports department_type='capital_project' and classification='dual'.
 */
export function checkCapitalContractor(contractorName) {
  if (!contractorName) return null
  const reg = loadContractorsRegistry()
  const contractors = reg.contractors || reg.capitalContractors || []

  for (const c of contractors) {
    const isCapital = c.department_type === 'capital_project' ||
                      c.classification === 'capital_project' ||
                      c.classification === 'dual'
    if (!isCapital) continue

    if (matchesContractor(contractorName, c)) {
      return {
        ...c,
        programManagers: c.approved_program_managers || c.programManagers || [],
        projects: c.linked_project_ids || c.projects || [],
        allowed_sectors: c.allowed_sectors || ['صرف', 'مياه']
      }
    }
  }

  return null
}

/**
 * Validate contractor against registry for Spatial-First logic.
 * Returns { isValid, contractor, reason }
 * Used by matchEngine after spatial check passes.
 *
 * @param {string} contractorName - name from report
 * @param {string|null} reportSector - 'مياه' | 'صرف' | 'عام' | null
 * @returns {{ isValid: boolean, contractor?: object, reason?: string }}
 */
export function getContractorValidation(contractorName, reportSector = null) {
  if (!contractorName) return { isValid: false, reason: 'no_contractor_name' }

  const reg = loadContractorsRegistry()
  const contractors = reg.contractors || []

  // البحث في السجل بالاسم والاسم المنظف والـ aliases
  let matched = null
  for (const c of contractors) {
    if (matchesContractor(contractorName, c)) {
      matched = c
      break
    }
  }

  if (!matched) {
    return { isValid: false, reason: 'not_in_registry' }
  }

  // مقاولو الصيانة البحتة: مستبعدون دائماً من التحقق الرأسمالي
  if (matched.classification === 'maintenance' && matched.department_type === 'maintenance') {
    return { isValid: false, reason: 'maintenance_only_contractor', contractor: matched }
  }

  // فحص توافق القطاع (يتجاهل الفحص إذا كان القطاع 'عام' أو غير محدد)
  if (reportSector && reportSector !== 'عام' && matched.allowed_sectors && matched.allowed_sectors.length > 0) {
    const sectorAllowed = matched.allowed_sectors.includes(reportSector)
    if (!sectorAllowed) {
      return { isValid: false, reason: 'sector_mismatch', contractor: matched }
    }
  }

  return { isValid: true, contractor: matched }
}
