import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPORTS_PATH = path.join(__dirname, '../server/data/generated/reports.json')
const BACKUP_PATH = path.join(__dirname, '../server/data/generated/reports_before_dedup.json')

const normalizeId = (id) =>
  String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

function deduplicateReports() {
  console.log('📖 قراءة ملف البلاغات...')
  const reports = JSON.parse(fs.readFileSync(REPORTS_PATH, 'utf8'))
  console.log(📊 إجمالي البلاغات قبل التنظيف: )

  fs.writeFileSync(BACKUP_PATH, JSON.stringify(reports, null, 2), 'utf8')
  console.log(💾 نسخة احتياطية: )

  const uniqueMap = new Map()
  let duplicateCount = 0

  for (const report of reports) {
    const key = normalizeId(report.reportId || report.id)
    if (!key) continue

    if (uniqueMap.has(key)) {
      const existing = uniqueMap.get(key)
      const existingDate = new Date(existing.lastUpdated || existing.dateReport || 0)
      const newDate = new Date(report.lastUpdated || report.dateReport || 0)
      if (newDate > existingDate) {
        uniqueMap.set(key, { ...report, reportId: key })
      }
      duplicateCount++
    } else {
      uniqueMap.set(key, { ...report, reportId: key })
    }
  }

  const uniqueReports = Array.from(uniqueMap.values())
  console.log(🗑️  حُذف  مكرر)
  console.log(✅ بلاغات فريدة: )

  fs.writeFileSync(REPORTS_PATH, JSON.stringify(uniqueReports, null, 2), 'utf8')
  console.log('💾 تم حفظ الملف النظيف.')

  return { before: reports.length, after: uniqueReports.length, removed: duplicateCount }
}

try {
  const stats = deduplicateReports()
  console.log('\n📈 ملخص:', JSON.stringify(stats, null, 2))
} catch (e) {
  console.error('❌ خطأ:', e.message)
  process.exit(1)
}
