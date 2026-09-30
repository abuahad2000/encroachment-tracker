import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let contractorMap = null
let managerMap = null

export function normalizeArabic(str) {
  return String(str || '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim()
}

export function loadReferenceData() {
  const cPath = path.join(__dirname, '../../data/reference/contractors_registry.json')
  const mPath = path.join(__dirname, '../../data/reference/managers_registry.json')

  const contractors = JSON.parse(fs.readFileSync(cPath, 'utf8')).contractors
  contractorMap = new Map()
  contractors.forEach(c => {
    contractorMap.set(normalizeArabic(c.name), c)
    contractorMap.set(normalizeArabic(c.clean_name), c)
    if (c.normalized_name) {
      contractorMap.set(normalizeArabic(c.normalized_name), c)
    }
  })

  const managers = JSON.parse(fs.readFileSync(mPath, 'utf8'))
  managerMap = new Map()
  managers.executive_managers.forEach(exec => {
    exec.program_managers.forEach(prog => {
      managerMap.set(normalizeArabic(prog.name), prog)
      if (prog.normalized_name) {
        managerMap.set(normalizeArabic(prog.normalized_name), prog)
      }
    })
  })

  console.log(`✅ تم تحميل ${contractors.length} مقاول (${contractors.filter(c => c.department_type === 'capital_project').length} رأسمالي + ${contractors.filter(c => c.department_type === 'maintenance').length} صيانة).`)
  console.log(`✅ تم تحميل ${managerMap.size} مدير برنامج.`)
}

export function isMaintenanceContractor(contractorName) {
  if (!contractorMap) loadReferenceData()
  const c = contractorMap.get(normalizeArabic(contractorName))
  return c ? c.department_type === 'maintenance' : false
}

export function isContractorCompatibleWithManager(contractorName, programManagerName) {
  if (!contractorMap || !managerMap) loadReferenceData()
  const c = contractorMap.get(normalizeArabic(contractorName))
  const m = managerMap.get(normalizeArabic(programManagerName))
  if (!c || !m) return false
  return m.approved_contractor_ids.includes(c.id)
}

export const getContractorMap = () => {
  if (!contractorMap) loadReferenceData()
  return contractorMap
}

export const getManagerMap = () => {
  if (!managerMap) loadReferenceData()
  return managerMap
}

export default {
  loadReferenceData,
  isMaintenanceContractor,
  isContractorCompatibleWithManager,
  getContractorMap,
  getManagerMap
}
