// DistrictAnalytics.js - Analytics and charts data preparation
export const DistrictAnalytics = {
  // Apply filtering logic
  applyFilters: (data = [], filters = {}) => {
    let result = Array.isArray(data) ? data : []

    if (filters.governorate && filters.governorate !== 'all') {
      result = result.filter(r => (r.city || r.governorate) === filters.governorate)
    }

    if (filters.district && filters.district !== 'all') {
      result = result.filter(r => r.district === filters.district)
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'excluded') {
        result = result.filter(r => r.excluded === true || r.isExcluded === true)
      } else {
        result = result.filter(r => r.status === filters.status)
      }
    }

    return result
  },

  // 1. Top districts by report count
  getReportsByDistrict: (data = [], filters = {}) => {
    const filtered = DistrictAnalytics.applyFilters(data, filters)
    const grouped = filtered.reduce((acc, r) => {
      const d = (r.district || 'غير محدد').trim()
      acc[d] = (acc[d] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([label, value]) => ({ label, value, x: label, y: value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
  },

  // 2. Top delayed districts by average delay days
  getTopDelayedDistricts: (data = [], filters = {}) => {
    const filtered = DistrictAnalytics.applyFilters(data, filters)
    const grouped = filtered.reduce((acc, r) => {
      const d = (r.district || 'غير محدد').trim()
      if (!acc[d]) acc[d] = { total: 0, count: 0 }
      const age = typeof r.ageDays === 'number' ? r.ageDays : parseFloat(r.ageDays) || 0
      acc[d].total += age
      acc[d].count += 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([label, obj]) => {
        const val = Math.round(obj.total / (obj.count || 1))
        return { label, value: val, x: label, y: val }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  },

  // 3. Status distribution
  getReportsByStatus: (data = [], filters = {}) => {
    const filtered = DistrictAnalytics.applyFilters(data, filters)
    const grouped = filtered.reduce((acc, r) => {
      const st = (r.excluded || r.isExcluded) ? 'مستبعد' : (r.status || 'غير محدد')
      acc[st] = (acc[st] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([label, value]) => ({ label, value, x: label, y: value }))
  },

  // 4. Distribution by program managers
  getReportsByManager: (data = [], filters = {}) => {
    const filtered = DistrictAnalytics.applyFilters(data, filters)
    const grouped = filtered.reduce((acc, r) => {
      const m = (r.project?.programManager || r.programManager || 'غير مسند').trim()
      acc[m] = (acc[m] || 0) + 1
      return acc
    }, {})

    return Object.entries(grouped)
      .map(([label, value]) => ({ label, value, x: label, y: value }))
      .sort((a, b) => b.value - a.value)
  }
}

export default DistrictAnalytics
