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
    metadata: {},
    capitalContractors: [],
    maintenanceContractors: []
  }
}

export function reloadContractorsRegistry() {
  cachedRegistry = null
  return loadContractorsRegistry()
}

/**
 * Checks if a contractor name matches an entry in registry by full name, clean name, or alias
 */
function matchesContractor(inputName, targetName, aliases = []) {
  if (!inputName || !targetName) return false
  const normInput = normalizeArabic(inputName).toLowerCase().trim()
  const normTarget = normalizeArabic(targetName).toLowerCase().trim()
  const cleanInput = cleanContractorName(inputName)
  const cleanTarget = cleanContractorName(targetName)

  if (normInput === normTarget || (cleanInput && cleanTarget && cleanInput === cleanTarget)) return true
  if (normInput.includes(normTarget) || normTarget.includes(normInput)) return true
  if (cleanInput && cleanTarget && (cleanInput.includes(cleanTarget) || cleanTarget.includes(cleanInput))) return true

  for (const alias of aliases) {
    if (!alias) continue
    const normAlias = normalizeArabic(alias).toLowerCase().trim()
    const cleanAlias = cleanContractorName(alias)
    if (normInput === normAlias || (cleanInput && cleanAlias && cleanInput === cleanAlias)) return true
    if (normInput.includes(normAlias) || normAlias.includes(normInput)) return true
    if (cleanInput && cleanAlias && (cleanInput.includes(cleanAlias) || cleanAlias.includes(cleanInput))) return true
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

  for (const mc of reg.maintenanceContractors || []) {
    if (matchesContractor(contractorName, mc.name, mc.aliases)) {
      // Check for exception rule (e.g. Civil Works for Al-Awali, or Al-Areen for Al-Narjis)
      if (mc.exceptionRule) {
        const repDistrict = normalizeArabic(report?.district || '').toLowerCase()
        const repDesc = normalizeArabic((report?.description || '') + ' ' + (report?.centerComment || '')).toLowerCase()
        const allowedDist = normalizeArabic(mc.exceptionRule.allowedDistrict || '').toLowerCase()

        const matchesDistrict = repDistrict.includes(allowedDist) || repDesc.includes(allowedDist)
        if (matchesDistrict) {
          return {
            isMaintenance: false,
            isAllowedException: true,
            allowedProjectId: mc.exceptionRule.allowedProjectId,
            allowedDistrict: mc.exceptionRule.allowedDistrict,
            notes: mc.exceptionRule.notes
          }
        }
      }

      return {
        isMaintenance: true,
        contractorName: mc.name,
        reason: 'maintenance_contractor',
        scope: mc.maintenanceScope || 'تشغيل وصيانة',
        excludedReason: `المقاول (${mc.name}) تابع لإدارة التشغيل والصيانة وليس للمشاريع الرأسمالية (${mc.maintenanceScope || 'صيانة وتوصيلات'})`
      }
    }
  }

  return { isMaintenance: false }
}

/**
 * Check if the contractor is classified as Capital Projects
 */
export function checkCapitalContractor(contractorName) {
  if (!contractorName) return null
  const reg = loadContractorsRegistry()

  for (const cc of reg.capitalContractors || []) {
    if (matchesContractor(contractorName, cc.name, cc.aliases)) {
      return cc
    }
  }

  return null
}
