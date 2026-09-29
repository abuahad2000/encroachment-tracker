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
        const district = (report.district || '').trim().replace(/^حي\s+/, '')
        // فحص التطابق مع نطاق المشروع الجغرافي
        const matchedScope = district 
          ? contractorData.capital.find(p => {
              const scopeText = ((p.scope || '') + ' ' + (p.name || '')).replace(/^حي\s+/, '')
              return scopeText.includes(district) || district.includes(p.scope?.replace(/^حي\s+/, ''))
            })
          : null
        
        // العقود الشاملة المعتمدة بالرياض (التي تغطي كامل المدينة)
        const cityWideProj = contractorData.capital.find(p => (p.scope || '').includes('شامل'))

        if (matchedScope) {
          return {
            programManager: matchedScope.programManager,
            projectId: matchedScope.id,
            phase: 'capital',
            confidence: 'high',
            note: 'مرتبط بمشروع رأسمالي جاري (تطابق الحي والنطاق)'
          }
        } else if (cityWideProj) {
          return {
            programManager: cityWideProj.programManager,
            projectId: cityWideProj.id,
            phase: 'capital',
            confidence: 'medium',
            note: 'مرتبط بعقد متفرقات شامل لمدينة الرياض'
          }
        }

        // إذا كان المقاول مشتركاً والبلاغ في حي خارج نطاق مشروعه الرأسمالي (مثل الأعمال المدنية خارج العوالي):
        // يعتبر قطعاً تابعاً للتشغيل والصيانة ولا يُسند لمدير البرنامج الرأسمالي!
        return {
          programManager: null,
          projectId: null,
          phase: 'maintenance',
          excluded: true,
          excludedReason: 'خارج نطاق المشروع الجغرافي (تابع لإدارة التشغيل والصيانة)',
          confidence: 'high',
          note: 'مقاول مشترك: البلاغ خارج نطاق المشروع الرأسمالي ويعتبر تابعاً للتشغيل والصيانة'
        }
      }

      // Priority 2: Maintenance / Handover
      if (contractorData.maintenance.length > 0) {
        return {
          programManager: null, // لا يُسند لمدير برنامج المشاريع الرأسمالية حتى لا يخلط الإحصائيات
          projectId: contractorData.maintenance[0].id,
          phase: 'maintenance',
          excluded: true,
          excludedReason: 'تابع لعقد تشغيل وصيانة / تسليم ابتدائي',
          confidence: 'high',
          note: 'مرتبط بعقد صيانة / تسليم ابتدائي (مستبعد من إحصائيات المشاريع)'
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
