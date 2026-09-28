// DataNormalizer.js - Manager names standardization and consistency checker
export const DataNormalizer = {
  managerNameMap: {
    'عسكر لسلوم': 'عسكر لسلوم',
    'عسكر لسوم': 'عسكر لسلوم',
    'م. عسكر لسلوم': 'عسكر لسلوم',
    'عبدالله الأسود العنزي': 'عبدالله الأسود العنزي',
    'عبدالله الاسود': 'عبدالله الأسود العنزي',
    'عبدالله علي العنزي': 'عبدالله علي العنزي',
    'عبدالله العنزي': 'عبدالله علي العنزي',
    'تركي ظافر يحيى الاسمري': 'تركي ظافر يحيى الاسمري',
    'تركي الاسمري': 'تركي ظافر يحيى الاسمري',
    'سفر العتيبي': 'سفر العتيبي',
    'علي الشهري': 'علي الشهري',
    'أمجد الفالح': 'أمجد الفالح',
    'شاكر الحقباني': 'شاكر الحقباني',
    'سعيد الحارث': 'سعيد الحارث',
    'فهد العنزي': 'فهد العنزي',
    'علي القحطاني': 'علي القحطاني'
  },

  normalizeManagerName: (name) => {
    if (!name) return null
    const cleanName = name
      .trim()
      .replace(/^(م\.|المهندس|م\s+)/, '')
      .trim()
    return DataNormalizer.managerNameMap[cleanName] || cleanName
  },

  findInconsistentNames: (projects = []) => {
    const names = new Set()
    const inconsistencies = []

    projects.forEach(p => {
      if (p.programManager) {
        const normalized = DataNormalizer.normalizeManagerName(p.programManager)
        if (normalized !== p.programManager) {
          inconsistencies.push({
            projectId: p.id,
            projectName: p.name,
            originalName: p.programManager,
            normalizedName: normalized
          })
        }
        names.add(normalized)
      }
    })

    return {
      uniqueManagers: Array.from(names).sort(),
      inconsistencies
    }
  }
}

export default DataNormalizer
