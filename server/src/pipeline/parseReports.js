import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

import { DATA_DIR, UPLOADS_DIR } from '../config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function normalizeDigits(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
}

export function dateToISO(excelDate) {
  if (excelDate === undefined || excelDate === null || excelDate === '') return null

  // If numeric or numeric string (Excel serial day)
  if (typeof excelDate === 'number' || (!isNaN(Number(excelDate)) && !String(excelDate).includes('/') && !String(excelDate).includes('-') && !String(excelDate).includes('.'))) {
    const num = Number(excelDate)
    if (!isNaN(num) && num > 0) {
      const date = new Date((num - 25569) * 86400 * 1000)
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0]
    }
  }

  let s = normalizeDigits(excelDate).trim()
  if (!s) return null

  // Check for DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
  const matchDMY = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/)
  if (matchDMY) {
    const day = parseInt(matchDMY[1], 10)
    const month = parseInt(matchDMY[2], 10)
    const year = parseInt(matchDMY[3], 10)
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Check for YYYY/MM/DD or YYYY-MM-DD
  const matchYMD = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/)
  if (matchYMD) {
    const year = parseInt(matchYMD[1], 10)
    const month = parseInt(matchYMD[2], 10)
    const day = parseInt(matchYMD[3], 10)
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Handle standard date strings or date with Arabic AM/PM (ص / م)
  let cleaned = s
    .replace(/صباحاً|صباحا|\bص\b/gi, 'AM')
    .replace(/مساءً|مساء|\bم\b/gi, 'PM')
    .replace(/[\u0600-\u06FF]/g, '')
    .trim()

  const d = new Date(cleaned)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return null
}

export function getLatestReportsFilePath() {
  const xlsxDir = path.join(__dirname, '../../../XLSX')
  const uploadsDir = UPLOADS_DIR

  // Check possible candidates
  const candidates = []

  // Check uploads/reports.xlsx
  const uploadedFile = path.join(uploadsDir, 'reports.xlsx')
  if (fs.existsSync(uploadedFile)) {
    candidates.push({ path: uploadedFile, mtime: fs.statSync(uploadedFile).mtimeMs })
  }

  // Check XLSX dir
  if (fs.existsSync(xlsxDir)) {
    const files = fs.readdirSync(xlsxDir)
    for (const file of files) {
      if (!file.endsWith('.xlsx') && !file.endsWith('.xls')) continue
      if (file.startsWith('~$')) continue // Skip temp lock files
      // Ignore executive export files and directory exports to avoid picking wrong file
      if (
        file.includes('التنفيذي') || 
        file.includes('تقرير_البلاغات_المعلقة') || 
        file.includes('سجل_بيانات_مقاولي') || 
        file.includes('تقرير_المقاولين') ||
        file.includes('المعتمدة_المحدثة') ||
        file.includes('بيانات_مقاولين')
      ) continue
      if (!file.includes('بلاغ') && !file.toLowerCase().includes('report')) continue

      const fullPath = path.join(xlsxDir, file)
      try {
        const stats = fs.statSync(fullPath)
        candidates.push({ path: fullPath, mtime: stats.mtimeMs })
      } catch (e) {
        // ignore
      }
    }
  }

  // Sort by newest modified time
  candidates.sort((a, b) => b.mtime - a.mtime)

  if (candidates.length > 0) {
    return candidates[0].path
  }

  return path.join(xlsxDir, 'بلاغات تعدي مقاولي شركة المياه الوطنية 12 سبتمبر.xlsx')
}

export function parseReports(customFilePath = null) {
  const filePath = customFilePath || getLatestReportsFilePath()
  console.log(`📂 استخدام ملف البلاغات: ${path.basename(filePath)}`)

  try {
    const workbook = XLSX.readFile(filePath)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // Auto-detect header row to skip title/banner rows
    const rowsGrid = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    let headerRowIndex = 0
    let maxCols = 0
    for (let i = 0; i < Math.min(rowsGrid.length, 15); i++) {
      const row = rowsGrid[i] || []
      const nonEmpties = row.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length
      if (nonEmpties > maxCols) {
        maxCols = nonEmpties
        headerRowIndex = i
      }
    }

    const rawData = XLSX.utils.sheet_to_json(sheet, { range: headerRowIndex })

    // Helper to find value across candidate column keys (robust against extra spaces or slight name changes)
    const getField = (row, keyPatterns) => {
      const rowKeys = Object.keys(row)
      for (const pattern of keyPatterns) {
        // Exact or trimmed match
        const exactMatch = rowKeys.find(k => k.trim() === pattern)
        if (exactMatch && row[exactMatch] !== undefined && row[exactMatch] !== '') {
          return row[exactMatch]
        }
        // Substring / regex match
        const subMatch = rowKeys.find(k => k.includes(pattern))
        if (subMatch && row[subMatch] !== undefined && row[subMatch] !== '') {
          return row[subMatch]
        }
      }
      return ''
    }

    const rejectedRows = []
    let nullDatesCount = 0
    const reports = []

    for (let idx = 0; idx < rawData.length; idx++) {
      const row = rawData[idx]
      const rawId = getField(row, ['رقم بلاغ التعدي', 'رقم_بلاغ_التعدي', 'رقم البلاغ', 'رقم_البلاغ', 'رقم التعدي', 'رقم_التعدي', 'رقم بلاغ', 'id', 'ID', 'A'])

      if (rawId === undefined || rawId === null || String(rawId).trim() === '' || String(rawId).trim().toUpperCase() === 'NULL') {
        rejectedRows.push({
          rowIndex: idx + headerRowIndex + 1,
          rowData: row,
          reason: 'missing_report_id'
        })
        continue
      }

      const cleanId = typeof rawId === 'number' ? rawId : String(rawId).trim()

      const rawLng = getField(row, ['خط الطول', 'خط_الطول', 'خط طول', 'longitude', 'Lng', 'lng', 'X'])
      const rawLat = getField(row, ['خط العرض', 'خط_العرض', 'خط عرض', 'latitude', 'Lat', 'lat', 'Y'])

      const rawStatus = getField(row, ['حالة البلاغ', 'حالة_البلاغ', 'الحالة', 'status', 'Status'])
      const rawContractor = getField(row, ['اسم المقاول', 'اسم_المقاول', 'المقاول', 'اسم مقاول', 'contractor', 'Contractor'])
      const rawConversations = getField(row, ['سجل المحادثات', 'سجل_المحادثات', 'المحادثات', 'conversation'])

      const dateIncident = dateToISO(getField(row, ['تاريخ التعدي', 'تاريخ الحادث']))
      const dateReport = dateToISO(getField(row, ['تاريخ البلاغ', 'تاريخ البلاغ التعدي']))

      if (!dateIncident) nullDatesCount++
      if (!dateReport) nullDatesCount++

      reports.push({
        id: cleanId,
        description: getField(row, ['وصف التعدي', 'الوصف', 'وصف']) || '',
        impact: getField(row, ['أثر التعدي', 'الاثر', 'الأثر', 'اثر']) || '',
        dateIncident,
        licenseNumber: String(getField(row, ['رقم الرخصة', 'الرخصة']) || '').trim(),
        dateReport,
        ownerEntity: getField(row, ['الجهة المالكة', 'المالك']) || '',
        encroachingEntity: getField(row, ['الجهة المتعدية', 'المتعدي']) || '',
        contractorName: rawContractor !== '' ? String(rawContractor).trim() : 'NULL',
        longitude: rawLng ? Number(rawLng) : null,
        latitude: rawLat ? Number(rawLat) : null,
        status: rawStatus ? String(rawStatus).trim() : 'تحت معالجة المقاول',
        city: getField(row, ['المدينة']) || 'مدينة الرياض',
        district: getField(row, ['الحي']) || '',
        street: getField(row, ['الشارع']) || '',
        centerComment: getField(row, ['تعليق المركز', 'تعليق']) || '',
        conversationLog: String(rawConversations || '').split('|').map(s => s.trim()).filter(Boolean),
      })
    }

    reports.rejectedRows = rejectedRows
    reports.nullDatesCount = nullDatesCount
    return reports
  } catch (err) {
    console.error('Error parsing reports:', err)
    throw err
  }
}

