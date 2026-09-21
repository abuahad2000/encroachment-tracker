import XLSX from 'xlsx'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function getLatestReportsFilePath() {
  const xlsxDir = path.join(__dirname, '../../../XLSX')
  const uploadsDir = path.join(__dirname, '../../../uploads')

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
      if (file.includes('التنفيذي') || file.includes('تقرير_البلاغات_المعلقة') || file.includes('سجل_بيانات_مقاولي') || file.includes('تقرير_المقاولين')) continue
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
    const rawData = XLSX.utils.sheet_to_json(sheet)

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

    return rawData.map((row, idx) => {
      // تحويل تواريخ Excel إلى تواريخ JS
      const dateToISO = (excelDate) => {
        if (!excelDate || excelDate === '') return null
        const num = Number(excelDate)
        if (isNaN(num)) {
          // Check if already string date
          const d = new Date(excelDate)
          return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
        }
        const date = new Date((num - 25569) * 86400 * 1000)
        return date.toISOString().split('T')[0]
      }

      const rawId = getField(row, ['رقم بلاغ التعدي', 'رقم البلاغ', 'رقم التعدي', 'رقم بلاغ', 'A'])
      const cleanId = rawId !== '' ? (typeof rawId === 'number' ? rawId : String(rawId).trim()) : (idx + 1)

      const rawLng = getField(row, ['خط الطول', 'خط طول', 'longitude', 'Lng'])
      const rawLat = getField(row, ['خط العرض', 'خط عرض', 'latitude', 'Lat'])

      const rawStatus = getField(row, ['حالة البلاغ', 'الحالة', 'status'])
      const rawContractor = getField(row, ['اسم المقاول', 'المقاول', 'اسم مقاول', 'contractor'])
      const rawConversations = getField(row, ['سجل المحادثات', 'المحادثات', 'conversation'])

      return {
        id: cleanId,
        description: getField(row, ['وصف التعدي', 'الوصف', 'وصف']) || '',
        impact: getField(row, ['أثر التعدي', 'الاثر', 'الأثر', 'اثر']) || '',
        dateIncident: dateToISO(getField(row, ['تاريخ التعدي', 'تاريخ الحادث'])),
        licenseNumber: String(getField(row, ['رقم الرخصة', 'الرخصة']) || '').trim(),
        dateReport: dateToISO(getField(row, ['تاريخ البلاغ', 'تاريخ البلاغ التعدي'])),
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
      }
    })
  } catch (err) {
    console.error('Error parsing reports:', err)
    throw err
  }
}

