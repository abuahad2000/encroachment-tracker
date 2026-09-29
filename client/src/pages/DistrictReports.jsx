import { useState, useEffect, useMemo } from 'react'
import { DistrictAnalytics } from '../utils/DistrictAnalytics'
import { CacheManager } from '../utils/CacheManager'
import DistrictProjectsCatalog from '../components/DistrictProjectsCatalog'

export default function DistrictReports() {
  const [activeTab, setActiveTab] = useState('reports') // 'reports' | 'classification'
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedGovernorate, setSelectedGovernorate] = useState('')
  const [selectedDistrict, setSelectedDistrict] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 20

  const loadReports = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true)
        await CacheManager.invalidateCache('reports')
      }
      const data = await CacheManager.getWithCache(
        'reports',
        () => fetch('/api/reports').then(r => r.json()),
        60
      )
      setReports(data || [])
    } catch (e) {
      console.error('Error fetching reports:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadReports()
  }, [])

  // 1. GovernorateSelect Options: قائمة المدن والمحافظات الفريدة
  const governorateOptions = useMemo(() => {
    const cities = reports
      .map(r => r.city)
      .filter(c => Boolean(c) && c !== 'NULL' && c !== '-')
    return Array.from(new Set(cities)).sort()
  }, [reports])

  // 2. DistrictSelect Options (Cascading): قائمة الأحياء التابعة للمحافظة المختارة فقط
  const districtOptions = useMemo(() => {
    const filteredByCity = reports.filter(r => !selectedGovernorate || r.city === selectedGovernorate)
    const districts = filteredByCity
      .map(r => r.district)
      .filter(d => Boolean(d) && d !== 'NULL' && d !== '-')
    return Array.from(new Set(districts)).sort()
  }, [reports, selectedGovernorate])

  // إعادة ضبط الحي عند تغيير المحافظة
  const handleGovernorateChange = (city) => {
    setSelectedGovernorate(city)
    setSelectedDistrict('')
    setCurrentPage(1)
  }

  const handleDistrictChange = (district) => {
    setSelectedDistrict(district)
    setCurrentPage(1)
  }

  // 3. البلاغات المفلترة
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // فلتر المحافظة / المدينة
      if (selectedGovernorate && r.city !== selectedGovernorate) return false
      // فلتر الحي
      if (selectedDistrict && r.district !== selectedDistrict) return false
      // فلتر الحالة
      if (statusFilter === 'pending' && r.status !== 'تحت معالجة المقاول') return false
      if (statusFilter === 'in_progress' && (r.status === 'تحت معالجة المقاول' || r.status === 'تمت المعالجة')) return false
      if (statusFilter === 'processed' && r.status !== 'تمت المعالجة') return false
      if (statusFilter === 'excluded' && !r.excluded) return false

      // فلتر البحث النصي
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const text = [
          r.id,
          r.city,
          r.district,
          r.street,
          r.contractorName,
          r.project?.contractor,
          r.project?.programManager,
          r.description
        ].filter(Boolean).join(' ').toLowerCase()
        if (!text.includes(q)) return false
      }

      return true
    })
  }, [reports, selectedGovernorate, selectedDistrict, statusFilter, searchQuery])

  // إحصائيات سريعة للنطاق المفلتر
  const summaryStats = useMemo(() => {
    const total = filteredReports.length
    const pending = filteredReports.filter(r => r.status === 'تحت معالجة المقاول').length
    const inProgress = filteredReports.filter(r => r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة').length
    const processed = filteredReports.filter(r => r.status === 'تمت المعالجة').length
    const excluded = filteredReports.filter(r => r.excluded).length
    const totalDays = filteredReports.reduce((acc, r) => acc + (parseFloat(r.ageDays) || 0), 0)
    const avgDelay = total > 0 ? Math.round(totalDays / total) : 0
    return { total, pending, inProgress, processed, excluded, avgDelay }
  }, [filteredReports])

  // 4 Chart datasets via DistrictAnalytics
  const topDistricts = useMemo(() => DistrictAnalytics.getReportsByDistrict(filteredReports).slice(0, 7), [filteredReports])
  const topDelayed = useMemo(() => DistrictAnalytics.getTopDelayedDistricts(filteredReports).slice(0, 7), [filteredReports])
  const statusDist = useMemo(() => DistrictAnalytics.getReportsByStatus(filteredReports), [filteredReports])
  const managerDist = useMemo(() => DistrictAnalytics.getReportsByManager(filteredReports).slice(0, 7), [filteredReports])

  const handleExportCSV = () => {
    if (filteredReports.length === 0) {
      alert('لا توجد بيانات لتصديرها')
      return
    }
    const headers = ['رقم البلاغ', 'المحافظة/المدينة', 'الحي', 'الشارع', 'المقاول', 'مدير البرنامج', 'الحالة', 'عمر البلاغ (يوم)', 'سبب الاستبعاد']
    const rows = filteredReports.map(r => [
      r.id,
      `"${(r.city || '').replace(/"/g, '""')}"`,
      `"${(r.district || '').replace(/"/g, '""')}"`,
      `"${(r.street || '').replace(/"/g, '""')}"`,
      `"${(r.customContractor || r.contractorName || r.project?.contractor || '').replace(/"/g, '""')}"`,
      `"${(r.project?.programManager || '').replace(/"/g, '""')}"`,
      `"${(r.status || '').replace(/"/g, '""')}"`,
      r.ageDays || 0,
      `"${(r.excludedReason || '').replace(/"/g, '""')}"`
    ])
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `تقرير_الأحياء_NWC_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // التصفح والصفحات
  const totalPages = Math.ceil(filteredReports.length / pageSize) || 1
  const paginatedReports = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredReports.slice(start, start + pageSize)
  }, [filteredReports, currentPage])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300 font-bold">جاري تحميل تقارير الأحياء والبلاغات...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏘️</span>
            <div>
              <h1 className="text-2xl font-black">تقارير بلاغات الأحياء والمحافظات</h1>
              <p className="text-blue-100 text-xs mt-1">
                استعراض وتدقيق بلاغات التعدي بحسب المدينة والحي المختار مع تصفية هرمية مترابطة ورسوم بيانية ذكية
              </p>
            </div>
          </div>
        </div>

        {/* أزرار الإجراءات والمؤشرات السريعة */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => loadReports(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/20 transition disabled:opacity-50"
            title="تحديث البيانات ومسح الذاكرة المؤقتة (Cache)"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'جاري التحديث...' : 'تحديث (مسح Cache)'}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition"
            title="تصدير جدول البلاغات المفلترة كملف CSV"
          >
            <span>📊</span>
            <span>تصدير البيانات (CSV)</span>
          </button>

          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/15 text-xs font-bold">
            <span>📍 النتائج:</span>
            <span className="bg-white text-blue-900 px-2 py-0.5 rounded-lg font-black text-sm">
              {filteredReports.length.toLocaleString('ar-SA')}
            </span>
          </div>
        </div>
      </div>

      {/* شريط التبديل بين البلاغات ودليل تصنيف المشاريع بالأحياء */}
      <div className="flex items-center gap-3 bg-gray-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-gray-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('reports')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition ${
            activeTab === 'reports'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <span>🏘️</span>
          <span>استعراض وتدقيق بلاغات الأحياء ({filteredReports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('classification')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black transition ${
            activeTab === 'classification'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <span>📋</span>
          <span>دليل تصنيف مشاريع إدارة المشاريع بالأحياء المعتمدة (48 حي ومحافظة)</span>
        </button>
      </div>

      {activeTab === 'classification' ? (
        <DistrictProjectsCatalog />
      ) : (
        <>
      {/* لوحة الفلاتر (GovernorateSelect & DistrictSelect) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. GovernorateSelect (المدينة / المحافظة) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              🏛️ المدينة / المحافظة (GovernorateSelect)
            </label>
            <select
              value={selectedGovernorate}
              onChange={(e) => handleGovernorateChange(e.target.value)}
              className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            >
              <option value="">جميع المدن والمحافظات ({governorateOptions.length})</option>
              {governorateOptions.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>

          {/* 2. DistrictSelect (الحي - Cascading) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              🏡 الحي التابع (DistrictSelect)
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => handleDistrictChange(e.target.value)}
              disabled={districtOptions.length === 0}
              className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white disabled:opacity-50"
            >
              <option value="">
                {selectedGovernorate ? `كافة أحياء ${selectedGovernorate} (${districtOptions.length})` : `جميع الأحياء (${districtOptions.length})`}
              </option>
              {districtOptions.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          </div>

          {/* 3. فلتر حالة البلاغ */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              ⏳ حالة البلاغ
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
            >
              <option value="all">كافة الحالات</option>
              <option value="pending">معلقة (تحت المقاول) ⏳</option>
              <option value="in_progress">تحت الإجراء 🔄</option>
              <option value="processed">تمت المعالجة ✅</option>
              <option value="excluded">مستبعدة من المشاريع 🚫</option>
            </select>
          </div>

          {/* 4. البحث المباشر */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
              🔍 بحث برقم البلاغ / المقاول / الشارع
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث بالاسم أو الرقم..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full text-xs font-bold pr-3 pl-8 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2 top-2.5 text-gray-400 hover:text-gray-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* شريط الإحصائيات المصغر */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-800 text-xs">
          <span className="font-bold text-gray-500 dark:text-gray-400">إحصائية النطاق الحالي:</span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800">
            ⏳ المعلقة: {summaryStats.pending}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold border border-sky-200 dark:border-sky-800">
            🔄 تحت الإجراء: {summaryStats.inProgress}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800">
            ✅ المعالجة: {summaryStats.processed}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 font-bold border border-red-200 dark:border-red-800">
            🚫 مستبعدة: {summaryStats.excluded}
          </span>

          {(selectedGovernorate || selectedDistrict || statusFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setSelectedGovernorate('')
                setSelectedDistrict('')
                setStatusFilter('all')
                setSearchQuery('')
                setCurrentPage(1)
              }}
              className="mr-auto text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-1 rounded-lg border border-red-200 dark:border-red-900 transition"
            >
              🔄 إعادة تعيين الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* 4 Analytics Charts Section (DistrictAnalytics) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chart 1: Top Districts by Reports (Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-black text-xs text-gray-900 dark:text-white">
                <span>📊</span>
                <span>الأحياء الأكثر بلاغات</span>
              </div>
              <span className="text-[10px] text-gray-400 font-bold">أعلى 7</span>
            </div>
            <div className="space-y-2.5">
              {topDistricts.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">لا توجد بيانات</div>
              ) : (
                topDistricts.map((item, idx) => {
                  const maxVal = topDistricts[0]?.value || 1
                  const pct = Math.round((item.value / maxVal) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-gray-800 dark:text-gray-200 truncate max-w-[120px]" title={item.label}>
                          {idx + 1}. {item.label}
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-mono font-black">{item.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Chart 2: Top Delayed Districts (Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-black text-xs text-gray-900 dark:text-white">
                <span>⏱️</span>
                <span>الأحياء الأكثر تأخراً</span>
              </div>
              <span className="text-[10px] text-red-500 font-bold">متوسط الأيام</span>
            </div>
            <div className="space-y-2.5">
              {topDelayed.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">لا توجد بيانات</div>
              ) : (
                topDelayed.map((item, idx) => {
                  const maxVal = topDelayed[0]?.value || 1
                  const pct = Math.round((item.value / maxVal) * 100)
                  const isHigh = item.value > 60
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-gray-800 dark:text-gray-200 truncate max-w-[120px]" title={item.label}>
                          {idx + 1}. {item.label}
                        </span>
                        <span className={`font-mono font-black ${isHigh ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {item.value} يوم
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isHigh ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Chart 3: Status Distribution (Pie / Donut Chart) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-black text-xs text-gray-900 dark:text-white">
                <span>🎯</span>
                <span>توزيع الحالات</span>
              </div>
              <span className="text-[10px] text-gray-400 font-bold">إجمالي: {filteredReports.length}</span>
            </div>

            {filteredReports.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-xs">لا توجد بيانات</div>
            ) : (
              <div className="space-y-3">
                {/* Visual Segmented Progress Ring */}
                <div className="flex items-center justify-center py-2">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-28 h-28 -rotate-90 transform" viewBox="0 0 36 36">
                      <path
                        className="text-gray-100 dark:text-slate-800"
                        strokeWidth="3.8"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      {(() => {
                        const total = filteredReports.length || 1
                        const pPct = (summaryStats.pending / total) * 100
                        const ipPct = (summaryStats.inProgress / total) * 100
                        const prPct = (summaryStats.processed / total) * 100
                        const exPct = (summaryStats.excluded / total) * 100

                        return (
                          <>
                            <path
                              className="text-amber-500"
                              strokeDasharray={`${pPct}, 100`}
                              strokeWidth="3.8"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className="text-sky-500"
                              strokeDasharray={`${ipPct}, 100`}
                              strokeDashoffset={`-${pPct}`}
                              strokeWidth="3.8"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className="text-emerald-500"
                              strokeDasharray={`${prPct}, 100`}
                              strokeDashoffset={`-${pPct + ipPct}`}
                              strokeWidth="3.8"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                            <path
                              className="text-red-500"
                              strokeDasharray={`${exPct}, 100`}
                              strokeDashoffset={`-${pPct + ipPct + prPct}`}
                              strokeWidth="3.8"
                              stroke="currentColor"
                              fill="none"
                              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                            />
                          </>
                        )
                      })()}
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center text-center">
                      <span className="text-xs font-black text-gray-900 dark:text-white">{filteredReports.length}</span>
                      <span className="text-[9px] text-gray-400">بلاغ</span>
                    </div>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
                    <span className="text-gray-700 dark:text-gray-300">معلق ({summaryStats.pending})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-500 shrink-0"></span>
                    <span className="text-gray-700 dark:text-gray-300">جاري ({summaryStats.inProgress})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                    <span className="text-gray-700 dark:text-gray-300">معالج ({summaryStats.processed})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0"></span>
                    <span className="text-gray-700 dark:text-gray-300">مستبعد ({summaryStats.excluded})</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chart 4: Program Managers Distribution (Bar Chart) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 font-black text-xs text-gray-900 dark:text-white">
                <span>👔</span>
                <span>توزيع مدراء البرامج</span>
              </div>
              <span className="text-[10px] text-gray-400 font-bold">أعلى 7</span>
            </div>
            <div className="space-y-2.5">
              {managerDist.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">لا توجد بيانات</div>
              ) : (
                managerDist.map((item, idx) => {
                  const maxVal = managerDist[0]?.value || 1
                  const pct = Math.round((item.value / maxVal) * 100)
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-gray-800 dark:text-gray-200 truncate max-w-[120px]" title={item.label}>
                          {idx + 1}. {item.label}
                        </span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-mono font-black">{item.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        ></div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table Widget: جدول عرض البلاغات المفلترة */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-3.5 py-3.5 text-center">#</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">رقم البلاغ</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">المدينة / المحافظة</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">الحي</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">الشارع / الموقع</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">المقاول المسجل</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">مدير البرنامج</th>
                <th className="px-3.5 py-3.5 text-center whitespace-nowrap">الحالة</th>
                <th className="px-3.5 py-3.5 text-center whitespace-nowrap">عمر البلاغ</th>
                <th className="px-3.5 py-3.5 text-center whitespace-nowrap">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {paginatedReports.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-16 text-gray-500 dark:text-gray-400">
                    <span className="text-3xl block mb-2">🔍</span>
                    <span className="font-bold">لا توجد بلاغات تطابق الفلاتر المحددة</span>
                  </td>
                </tr>
              ) : (
                paginatedReports.map((report, idx) => {
                  const isPending = report.status === 'تحت معالجة المقاول'
                  const isProcessed = report.status === 'تمت المعالجة'
                  const isExcluded = report.excluded

                  return (
                    <tr
                      key={report.id}
                      onClick={() => setSelectedReport(report)}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 cursor-pointer transition"
                    >
                      <td className="px-3.5 py-3 text-center text-gray-400 font-medium">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-3.5 py-3 font-black text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {report.id}
                      </td>
                      <td className="px-3.5 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                        {report.city || 'الرياض'}
                      </td>
                      <td className="px-3.5 py-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        {report.district || '-'}
                      </td>
                      <td className="px-3.5 py-3 text-gray-600 dark:text-gray-400 max-w-[150px] truncate" title={report.street}>
                        {report.street || '-'}
                      </td>
                      <td className="px-3.5 py-3 font-bold text-gray-900 dark:text-white max-w-[180px] truncate" title={report.contractorName || report.project?.contractor}>
                        {report.customContractor || report.contractorName || report.project?.contractor || 'غير محدد'}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          {report.project?.programManager || 'غير مسند'}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full font-black text-[11px] ${
                          isExcluded
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : isPending
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : isProcessed
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                        }`}>
                          {isExcluded ? 'مستبعد' : report.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-center font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {report.ageDays ? `${report.ageDays} يوم` : '-'}
                      </td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedReport(report)
                          }}
                          className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 hover:bg-blue-200 font-bold rounded-lg transition"
                        >
                          عرض التفاصيل
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ترقيم الصفحات (Pagination) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 text-xs font-bold">
            <span className="text-gray-500 dark:text-gray-400">
              صفحة {currentPage} من {totalPages} ({filteredReports.length} بلاغ)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                السابق
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-gray-50"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* نافذة تفاصيل البلاغ عند النقر */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">تفاصيل البلاغ</span>
                <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <span>بلاغ رقم #{selectedReport.id}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                    selectedReport.excluded ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedReport.status}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 font-bold hover:bg-gray-200 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <span className="text-gray-500 dark:text-gray-400 font-semibold block">المحافظة / المدينة:</span>
                <span className="font-bold text-gray-900 dark:text-white text-sm">{selectedReport.city || '-'}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <span className="text-gray-500 dark:text-gray-400 font-semibold block">الحي والشارع:</span>
                <span className="font-bold text-gray-900 dark:text-white text-sm">{selectedReport.district || '-'} • {selectedReport.street || '-'}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <span className="text-gray-500 dark:text-gray-400 font-semibold block">المقاول:</span>
                <span className="font-bold text-gray-900 dark:text-white">{selectedReport.contractorName || selectedReport.project?.contractor || 'غير محدد'}</span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <span className="text-gray-500 dark:text-gray-400 font-semibold block">مدير البرنامج المسؤول:</span>
                <span className="font-bold text-gray-900 dark:text-white">{selectedReport.project?.programManager || 'غير مسند'}</span>
              </div>
            </div>

            {selectedReport.description && (
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">وصف التعدي الميداني:</span>
                <p className="text-xs text-gray-800 dark:text-gray-200 leading-relaxed">{selectedReport.description}</p>
              </div>
            )}

            {selectedReport.excluded && selectedReport.excludedReason && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl space-y-1">
                <span className="text-xs font-bold text-red-700 dark:text-red-300">سبب الاستبعاد:</span>
                <p className="text-xs text-red-800 dark:text-red-200 font-bold">{selectedReport.excludedReason}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedReport(null)}
                className="px-5 py-2 bg-gray-900 dark:bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
