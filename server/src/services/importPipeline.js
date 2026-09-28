import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import { buildData } from '../pipeline/buildData.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const pipeline = {
  process: async (rawData = [], options = {}) => {
    try {
      const fileName = options.fileName || 'imported_reports.xlsx'
      const uploadedBy = options.uploadedBy || 'system'

      const xlsxDir = path.join(__dirname, '../../../XLSX')
      if (!fs.existsSync(xlsxDir)) {
        fs.mkdirSync(xlsxDir, { recursive: true })
      }

      // Convert rawData back to workbook to maintain full pipeline compatibility
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(rawData)
      XLSX.utils.book_append_sheet(wb, ws, 'البلاغات')

      const targetExcelPath = path.join(xlsxDir, 'reports.xlsx')
      XLSX.writeFile(wb, targetExcelPath)

      // Run buildData pipeline
      console.log(`🚀 [importPipeline] تشغيل المعالجة لـ ${rawData.length} سجلاً من ${fileName}`)
      const buildResult = await buildData(targetExcelPath)

      // Also ensure direct data/reports.json is synced
      const generatedReportsPath = path.join(__dirname, '../../data/generated/reports.json')
      const directReportsPath = path.join(__dirname, '../../data/reports.json')
      if (fs.existsSync(generatedReportsPath)) {
        fs.copyFileSync(generatedReportsPath, directReportsPath)
      }

      return {
        success: true,
        count: rawData.length,
        fileName,
        uploadedBy,
        stats: buildResult?.stats || {},
        timestamp: new Date().toISOString(),
        message: 'تم استيراد ومعالجة البيانات وتحديث الخرائط والتقارير بنجاح'
      }
    } catch (error) {
      console.error('Error in importPipeline.process:', error)
      throw error
    }
  }
}

export default { pipeline }
