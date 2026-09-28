// ContractorPhaseResolver.js - Resolves contractor overlap and classifies capital vs maintenance
export const ContractorPhaseResolver = {
  // Classify project into capital or maintenance
  classifyProjectPhase: (project) => {
    if (!project) return 'unknown'

    const status = (project.status || '').toLowerCase().trim()
    const phase = (project.phase || '').toLowerCase().trim()
    const type = (project.type || '').toLowerCase().trim()
    const name = (project.name || project.projectName || '').toLowerCase().trim()
    const folder = (project.folder || '').toLowerCase().trim()

    // Maintenance / Handover keywords
    if (
      status.includes('مسلم') ||
      status.includes('صيانة') ||
      status.includes('maintenance') ||
      status.includes('handover') ||
      phase === 'maintenance' ||
      phase === 'handover' ||
      type === 'maintenance' ||
      folder.includes('صيانة') ||
      folder.includes('مسلم') ||
      name.includes('صيانة') ||
      name.includes('إحلال') ||
      name.includes('تجديد') ||
      name.includes('تشغيل')
    ) {
      return 'maintenance'
    }

    // Capital / Ongoing keywords
    if (
      status.includes('جاري') ||
      status.includes('ongoing') ||
      type === 'capital' ||
      phase === 'ongoing' ||
      name.includes('تنفيذ') ||
      name.includes('إنشاء') ||
      name.includes('عقد استكمال') ||
      name.includes('توسعة') ||
      name.includes('مشروع')
    ) {
      return 'capital'
    }

    return 'capital' // default active projects to capital
  },

  // Build contractor phase map separating capital and maintenance projects
  buildContractorPhaseMap: (projects = []) => {
    const contractorMap = {}

    projects.forEach(project => {
      const contractor = (project.contractor || '').trim()
      if (!contractor || contractor === '-' || contractor === 'غير محدد') return

      const phase = ContractorPhaseResolver.classifyProjectPhase(project)

      if (!contractorMap[contractor]) {
        contractorMap[contractor] = {
          capital: [],
          maintenance: [],
          unknown: []
        }
      }

      const targetPhase = contractorMap[contractor][phase] ? phase : 'unknown'
      contractorMap[contractor][targetPhase].push({
        id: project.id,
        name: project.name,
        operationNumber: project.operationNumber,
        programManager: project.programManager,
        projectManager: project.projectManager,
        status: project.status,
        scope: project.scope,
        phase: targetPhase
      })
    })

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('contractorPhaseMap', JSON.stringify(contractorMap))
      }
    } catch (e) {}

    return contractorMap
  },

  // Resolve manager giving priority to capital/ongoing projects
  resolveManagerForReport: (report, contractorMap = null, projects = []) => {
    if (!report) return null

    // 1. Direct project attached
    if (report.project) {
      const phase = ContractorPhaseResolver.classifyProjectPhase(report.project)
      return {
        programManager: report.project.programManager,
        phase,
        confidence: 'high',
        source: 'direct_project'
      }
    }

    // 2. Resolve via contractor with capital priority
    const contractor = (report.contractorName || report.contractor || report.matchedContractor || '').trim()
    if (contractor) {
      const map = contractorMap || ContractorPhaseResolver.buildContractorPhaseMap(projects)
      const contractorData = map[contractor]
      if (!contractorData) return null

      // Priority 1: Capital ongoing
      if (contractorData.capital.length > 0) {
        const district = (report.district || '').trim()
        const matchedScope = contractorData.capital.find(p => district && ((p.scope || '') + ' ' + (p.name || '')).includes(district))
        const selected = matchedScope || contractorData.capital[0]
        return {
          programManager: selected.programManager,
          projectId: selected.id,
          phase: 'capital',
          confidence: matchedScope ? 'high' : 'medium',
          note: 'مرتبط بمشروع رأسمالي جاري (أولوية)'
        }
      }

      // Priority 2: Maintenance / Handover
      if (contractorData.maintenance.length > 0) {
        return {
          programManager: contractorData.maintenance[0].programManager,
          projectId: contractorData.maintenance[0].id,
          phase: 'maintenance',
          confidence: 'medium',
          note: 'مرتبط بعقد صيانة / تسليم ابتدائي'
        }
      }
    }

    return null
  },

  // Overlap statistics
  getOverlapStats: (projects = []) => {
    const map = ContractorPhaseResolver.buildContractorPhaseMap(projects)
    const overlapping = []
    const capitalOnly = []
    const maintenanceOnly = []

    Object.entries(map).forEach(([contractor, data]) => {
      const hasCapital = data.capital.length > 0
      const hasMaintenance = data.maintenance.length > 0

      if (hasCapital && hasMaintenance) {
        overlapping.push({
          contractor,
          capitalCount: data.capital.length,
          maintenanceCount: data.maintenance.length,
          total: data.capital.length + data.maintenance.length
        })
      } else if (hasCapital) {
        capitalOnly.push({ contractor, count: data.capital.length })
      } else if (hasMaintenance) {
        maintenanceOnly.push({ contractor, count: data.maintenance.length })
      }
    })

    return {
      overlapping: overlapping.sort((a, b) => b.total - a.total),
      totalOverlapping: overlapping.length,
      capitalOnly: capitalOnly.length,
      maintenanceOnly: maintenanceOnly.length
    }
  }
}

export default ContractorPhaseResolver
