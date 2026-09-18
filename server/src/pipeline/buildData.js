import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseReports } from './parseReports.js'
import { parseProjects } from './parseProjects.js'
import { parseAllKMZ } from './parseKmz.js'
import { processReports } from './matchEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function buildData() {
  console.log('🔄 جاري معالجة البيانات...')

  try {
    // 1. Parse data
    console.log('📖 قراءة البلاغات...')
    const reports = parseReports()
    console.log(`   ✓ تم قراءة ${reports.length} بلاغاً`)

    console.log('📖 قراءة المشاريع...')
    const projects = parseProjects()
    console.log(`   ✓ تم قراءة ${projects.length} مشروعاً`)

    console.log('📖 قراءة طبقات KMZ...')
    const geoJsonData = await parseAllKMZ()
    console.log('   ✓ تم قراءة ملفات KMZ')

    // 2. Load overrides
    const overridesPath = path.join(__dirname, '../../data/overrides.json')
    let overrides = []
    if (fs.existsSync(overridesPath)) {
      overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'))
    }

    // 3. Process reports
    console.log('⚙️  جاري معالجة ومطابقة البلاغات...')
    const processedReports = processReports(reports, projects, geoJsonData, overrides)

    // 4. Calculate statistics
    const stats = calculateStats(processedReports, projects)

    // 5. Create managers data
    const managers = createManagersData(projects, processedReports)

    // 6. Create output directory
    const outputDir = path.join(__dirname, '../../data/generated')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // 7. Write output files
    fs.writeFileSync(
      path.join(outputDir, 'reports.json'),
      JSON.stringify(processedReports, null, 2)
    )

    fs.writeFileSync(
      path.join(outputDir, 'projects.json'),
      JSON.stringify(projects, null, 2)
    )

    fs.writeFileSync(
      path.join(outputDir, 'stats.json'),
      JSON.stringify(stats, null, 2)
    )

    fs.writeFileSync(
      path.join(outputDir, 'managers.json'),
      JSON.stringify(managers, null, 2)
    )

    fs.writeFileSync(
      path.join(outputDir, 'layers.json'),
      JSON.stringify(geoJsonData, null, 2)
    )

    // 8. Summary
    console.log('\n✅ تم إتمام المعالجة بنجاح!')
    console.log(`\n📊 الإحصائيات:`)
    console.log(`   • إجمالي البلاغات: ${reports.length}`)
    console.log(`   • البلاغات المطابقة: ${stats.matchedReports}`)
    console.log(`   • تمت المعالجة: ${stats.processedCount}`)
    console.log(`   • تحت المعالجة: ${stats.underProcessingCount}`)
    console.log(`   • متوسط التأخير: ${stats.avgDelay} يوم`)
    console.log(`   • آخر تحديث: ${new Date().toLocaleString('ar-SA')}`)

    return { success: true, stats }
  } catch (err) {
    console.error('❌ خطأ في المعالجة:', err.message)
    throw err
  }
}

function calculateStats(reports, projects) {
  // البلاغات المطابقة فقط (مع مشروع)
  const matched = reports.filter(r => r.matched && !r.archived && !r.excluded)
  const archived = reports.filter(r => r.archived)
  const active = reports.filter(r => !r.archived && r.status !== 'تمت المعالجة')

  // إحصائيات البلاغات المطابقة
  const processed = archived.filter(r => r.matched)
  const underProcessing = matched.filter(r => r.status === 'تحت معالجة المقاول')

  const ageDays = matched
    .filter(r => r.ageDays >= 0)
    .map(r => r.ageDays)
    .sort((a, b) => a - b)

  const statusDist = {}
  for (const r of reports) {
    statusDist[r.status] = (statusDist[r.status] || 0) + 1
  }

  const topManagers = {}
  for (const r of matched) {
    if (r.project?.programManager) {
      topManagers[r.project.programManager] = (topManagers[r.project.programManager] || 0) + 1
    }
  }

  return {
    totalReports: reports.length,
    matchedReports: matched.length,
    processedCount: processed.length,
    underProcessingCount: underProcessing.length,
    archivedCount: archived.length,
    avgDelay: ageDays.length > 0 ? Math.round(ageDays.reduce((a, b) => a + b) / ageDays.length) : 0,
    medianDelay: ageDays.length > 0 ? ageDays[Math.floor(ageDays.length / 2)] : 0,
    maxDelay: ageDays.length > 0 ? Math.max(...ageDays) : 0,
    statusDistribution: statusDist,
    topManagers: Object.entries(topManagers)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    lastUpdate: new Date().toISOString(),
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'جاري').length,
    deliveredProjects: projects.filter(p => p.status === 'مسلم ابتدائي').length,
  }
}

const MANAGER_SLUGS = {
  'تركي ظافر يحيى الاسمري': 'turki-alasmari',
  'تركي الاسمري': 'turki-alasmari',
  'عسكر لسلوم': 'askar-lasloum',
  'عبدالله علي العنزي': 'abdullah-alenezi',
  'عبدالله العنزي': 'abdullah-alenezi',
  'سفر العتيبي': 'safar-alotaibi',
  'علي الشهري': 'ali-alshehri',
  'أمجد الفالح': 'amjad-alfaleh',
  'عبدالله الأسود العنزي': 'abdullah-alaswad',
  'عبدالله الأسود': 'abdullah-alaswad',
  'علي القحطاني': 'ali-alqahtani',
  'شاكر الحقباني': 'shaker-alhaqbani',
  'سعيد الحارث': 'saeed-alharthe'
}

function createManagersData(projects, reports) {
  const managers = {}

  // Group projects by manager
  for (const proj of projects) {
    const mgr = proj.programManager
    if (!mgr || mgr === '-' || mgr === 'غير محدد') continue
    if (!managers[mgr]) {
      managers[mgr] = {
        name: mgr,
        projects: [],
        reports: [],
        pendingReports: [],
        processedReports: []
      }
    }
    managers[mgr].projects.push(proj)
  }

  // Add reports to managers
  for (const report of reports) {
    if (report.matched && report.project && !report.excluded) {
      const mgr = report.project.programManager
      if (managers[mgr]) {
        managers[mgr].reports.push(report)
        if (report.status === 'تمت المعالجة') {
          managers[mgr].processedReports.push(report)
        } else {
          managers[mgr].pendingReports.push(report)
        }
      }
    }
  }

  // Convert to array with stats
  return Object.values(managers).map(m => {
    const slug = MANAGER_SLUGS[m.name] || encodeURIComponent(m.name.toLowerCase().replace(/\s+/g, '-'))
    const firstProj = m.projects[0]
    return {
      id: slug,
      slug,
      name: m.name,
      scope: firstProj?.subProgram || 'متعدد',
      subProgram: firstProj?.subProgram || '',
      activeProjects: m.projects.filter(p => p.status === 'جاري').length,
      deliveredProjects: m.projects.filter(p => p.status === 'مسلم ابتدائي').length,
      totalProjects: m.projects.length,
      pendingReportsCount: m.pendingReports.length,
      processedReportsCount: m.processedReports.length,
      activeReports: m.pendingReports.length, // التوافق مع الحقول السابقة
      totalReportsCount: m.reports.length,
      phone: firstProj?.progPhone || '-',
      email: firstProj?.progEmail || '-',
      projects: m.projects.map(p => ({
        id: p.id,
        name: p.name,
        scope: p.scope,
        status: p.status,
        contractor: p.contractor
      }))
    }
  }).sort((a, b) => b.pendingReportsCount - a.pendingReportsCount)
}

// Run if called directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildData().catch(() => process.exit(1))
}
