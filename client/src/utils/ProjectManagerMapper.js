// ProjectManagerMapper.js - Precise project to program manager mapping
export const ProjectManagerMapper = {
  // Composite Key generation
  generateProjectKey: (project) => {
    if (!project) return null
    const name = (project.name || '').trim()
    const phase = (project.phase || project.status || 'ongoing').trim()
    const type = (project.type || 'capital').trim()
    const opNumber = (project.operationNumber || '').trim()
    return `${name}|${phase}|${type}|${opNumber}`.toLowerCase()
  },

  // Build mapping dictionary from projects
  buildMappingDictionary: (projects = []) => {
    const dictionary = {}
    projects.forEach(project => {
      const key = ProjectManagerMapper.generateProjectKey(project)
      if (key) {
        dictionary[key] = {
          projectId: project.id,
          name: project.name,
          programManager: project.programManager,
          projectManager: project.projectManager,
          contractor: project.contractor,
          phase: project.phase || project.status || 'ongoing',
          type: project.type || 'capital',
          sector: project.sector,
          scope: project.scope
        }
      }
    })
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('projectManagerDictionary', JSON.stringify(dictionary))
      }
    } catch (e) {}
    return dictionary
  },

  // Get program manager with multi-tier fallback
  getProgramManager: (report, projects = [], cachedDict = null) => {
    if (!report) return null

    // 1. Direct project composite key match
    if (report.project) {
      const key = ProjectManagerMapper.generateProjectKey(report.project)
      const dict = cachedDict || (() => {
        try {
          return JSON.parse(window.localStorage?.getItem('projectManagerDictionary') || '{}')
        } catch (e) {
          return {}
        }
      })()
      if (dict && dict[key]?.programManager) {
        return dict[key].programManager
      }
    }

    // 2. Direct report or project programManager field
    if (report.project?.programManager && report.project.programManager !== 'غير محدد') {
      return report.project.programManager
    }
    if (report.programManager && report.programManager !== 'غير محدد') {
      return report.programManager
    }

    // 3. Contractor + project scope/name matching
    const contractor = (report.customContractor || report.contractorName || report.contractor || '').trim()
    const district = (report.district || '').trim()
    const city = (report.city || '').trim()

    if (contractor && projects.length > 0) {
      const match = projects.find(p => {
        const pCont = (p.contractor || '').trim()
        const pScope = ((p.scope || '') + ' ' + (p.name || '')).trim()
        const contMatch = pCont.includes(contractor) || contractor.includes(pCont)
        const distMatch = district ? pScope.includes(district) : true
        return contMatch && distMatch && p.programManager
      })
      if (match?.programManager) return match.programManager
    }

    // 4. Regional and Contractor Specific Rules (NWC Governance)
    if (contractor.includes('برق') || city.includes('العيينة') || city.includes('الدرعية') || city.includes('ضرماء') || city.includes('المزاحمية')) {
      return 'سعيد الحارث'
    }
    if (contractor.includes('ماءك')) {
      return 'سفر العتيبي'
    }
    if (contractor.includes('بلر')) {
      return 'عبدالله علي العنزي'
    }
    if (contractor.includes('السبق') || city.includes('الخرج') || city.includes('حوطة') || city.includes('الأفلاج') || city.includes('السليل')) {
      return 'شاكر الحقباني'
    }
    if (contractor.includes('اليمامة')) {
      return 'عسكر لسلوم'
    }
    if (contractor.includes('الدولية')) {
      return 'تركي ظافر يحيى الاسمري'
    }
    if (city.includes('المجمعة') || city.includes('الزلفي') || city.includes('الغاط') || city.includes('شقراء') || city.includes('حريملاء') || city.includes('ثادق') || city.includes('رماح')) {
      return 'علي القحطاني'
    }
    if (city.includes('الدوادمي') || city.includes('عفيف') || city.includes('القويعية')) {
      return 'فهد العنزي'
    }

    return null
  },

  // Validate mapping accuracy (target 95%+)
  validateMapping: (reports = [], projects = []) => {
    const targetReports = (reports || []).filter(r => !r.excluded && !r.isExcluded && (r.matched || r.status === 'تحت معالجة المقاول' || r.project))
    const issues = []
    let matched = 0
    let unmatched = 0

    const dict = ProjectManagerMapper.buildMappingDictionary(projects)

    targetReports.forEach(report => {
      const manager = ProjectManagerMapper.getProgramManager(report, projects, dict)
      if (manager && manager !== 'غير مسند' && manager !== 'غير محدد') {
        matched++
      } else {
        unmatched++
        issues.push({
          reportId: report.id || report.reportId,
          district: report.district || 'غير محدد',
          contractor: report.contractorName || report.contractor || 'غير محدد',
          issue: 'لم يتم العثور على مدير برنامج مطابق'
        })
      }
    })

    const total = targetReports.length
    const accuracy = total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '0%'

    return {
      total,
      matched,
      unmatched,
      accuracy,
      issues: issues.slice(0, 50)
    }
  }
}

export default ProjectManagerMapper
