import XLSX from 'xlsx'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function parseReports() {
  const filePath = path.join(__dirname, '../../../XLSX/بلاغات تعدي مقاولي شركة المياه الوطنية 12 سبتمبر.xlsx')

  try {
    const workbook = XLSX.readFile(filePath)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet)

    return data.map((row, idx) => {
      // تحويل تواريخ Excel إلى تواريخ JS
      const dateToISO = (excelDate) => {
        if (!excelDate || excelDate === '') return null
        const num = Number(excelDate)
        if (isNaN(num)) return null
        const date = new Date((num - 25569) * 86400 * 1000)
        return date.toISOString().split('T')[0]
      }

      return {
        id: row['رقم بلاغ التعدي'] || row['A'],
        description: row['وصف التعدي'] || '',
        impact: row['أثر التعدي'] || '',
        dateIncident: dateToISO(row['تاريخ التعدي']),
        licenseNumber: row['رقم الرخصة'] || '',
        dateReport: dateToISO(row['تاريخ البلاغ']),
        ownerEntity: row['الجهة المالكة'] || '',
        encroachingEntity: row['الجهة المتعدية'] || '',
        contractorName: row['اسم المقاول'] || '',
        longitude: row['خط الطول'] ? Number(row['خط الطول']) : null,
        latitude: row['خط العرض'] ? Number(row['خط العرض']) : null,
        status: row['حالة البلاغ'] || '',
        city: row['المدينة'] || '',
        district: row['الحي'] || '',
        street: row['الشارع'] || '',
        centerComment: row['تعليق المركز'] || '',
        conversationLog: (row['سجل المحادثات'] || '').split('|').map(s => s.trim()).filter(Boolean),
      }
    })
  } catch (err) {
    console.error('Error parsing reports:', err)
    throw err
  }
}
