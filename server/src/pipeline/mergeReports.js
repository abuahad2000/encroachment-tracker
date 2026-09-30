import fs from 'fs'

export const normalizeId = (id) => String(id ?? '').trim().replace(/^0+/, '') || String(id ?? '').trim()

export async function mergeWeeklyReports(newReportsFromExcel, existingReportsPath) {
  let existingReports = []
  try {
    if (fs.existsSync(existingReportsPath)) {
      existingReports = JSON.parse(fs.readFileSync(existingReportsPath, 'utf8'))
    }
  } catch (e) {
    console.log('ℹ️ ملف التقارير الحالي غير موجود، سيتم إنشاء ملف جديد.')
  }

  const existingMap = new Map()
  existingReports.forEach(r => existingMap.set(normalizeId(r.reportId || r.id), r))

  const merged = []
  const processedIds = new Set()

  for (const newRow of newReportsFromExcel) {
    const normId = normalizeId(newRow.reportId || newRow.id)
    processedIds.add(normId)

    if (existingMap.has(normId)) {
      const old = existingMap.get(normId)
      const hasStatusChange = old.status !== newRow.status
      merged.push({
        ...old,
        ...newRow,
        lastUpdated: new Date().toISOString(),
        statusChangeHistory: [
          ...(old.statusChangeHistory || []),
          ...(hasStatusChange ? [{ date: new Date().toISOString(), oldStatus: old.status, newStatus: newRow.status }] : [])
        ]
      })
    } else {
      merged.push({
        ...newRow,
        firstSeenDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        statusChangeHistory: [{ date: new Date().toISOString(), oldStatus: null, newStatus: newRow.status }]
      })
    }
  }

  let archived = 0
  for (const [id, old] of existingMap.entries()) {
    if (!processedIds.has(id)) {
      old.isArchived = true
      old.lastUpdated = new Date().toISOString()
      merged.push(old)
      archived++
    }
  }

  fs.writeFileSync(existingReportsPath, JSON.stringify(merged, null, 2), 'utf8')
  console.log(`✅ دُمج ${processedIds.size} بلاغ، أُرشِف ${archived} بلاغ.`)
  return merged
}

export default { mergeWeeklyReports, normalizeId }
