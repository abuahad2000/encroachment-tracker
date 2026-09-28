import { useState, useEffect, useMemo } from 'react'
import { ContractorPhaseResolver } from '../utils/ContractorPhaseResolver'
import { CacheManager } from '../utils/CacheManager'

export default function ContractorOverlapAudit() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContractor, setSelectedContractor] = useState(null)
  const [alertMessage, setAlertMessage] = useState(null)

  const loadData = async () => {
    try {
      const data = await CacheManager.getWithCache(
        'projects',
        () => fetch('/api/projects').then(r => r.json()),
        300
      )
      setProjects(data || [])
    } catch (e) {
      console.error('Error loading projects:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Overlap stats from ContractorPhaseResolver
  const stats = useMemo(() => {
    return ContractorPhaseResolver.getOverlapStats(projects)
  }, [projects])

  // Contractor Phase Map for details
  const phaseMap = useMemo(() => {
    return ContractorPhaseResolver.buildContractorPhaseMap(projects)
  }, [projects])

  // Filter overlapping contractors by search query
  const filteredOverlapping = useMemo(() => {
    if (!searchQuery.trim()) return stats.overlapping
    const q = searchQuery.toLowerCase().trim()
    return stats.overlapping.filter(item => item.contractor.toLowerCase().includes(q))
  }, [stats.overlapping, searchQuery])

  const handleRebuildMap = () => {
    ContractorPhaseResolver.buildContractorPhaseMap(projects)
    setAlertMessage('✅ تم إعادة بناء خريطة المقاولين وحفظها بنجاح')
    setTimeout(() => setAlertMessage(null), 4000)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300 font-bold">جاري تحميل تدقيق تداخل المقاولين...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 border border-blue-900/50">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚖️</span>
            <div>
              <h1 className="text-2xl font-black">تدقيق تداخل المقاولين (Contractor Overlap Audit)</h1>
              <p className="text-blue-200 text-xs mt-1">
                فصل المقاولين المشتركين بين المشاريع الرأسمالية (الجارية) ومشاريع الصيانة (المسلمة ابتدائياً) لضمان دقة الإسناد
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleRebuildMap}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition"
            title="إعادة فحص وتصنيف خريطة المقاولين"
          >
            <span>🔄</span>
            <span>إعادة بناء الخريطة</span>
          </button>
        </div>
      </div>

      {alertMessage && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 rounded-xl text-xs font-bold animate-pulse text-center">
          {alertMessage}
        </div>
      )}

      {/* Main KPI Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Overlapping */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-amber-200 dark:border-amber-900/60 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 block mb-1">المقاولون المتداخلون</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white font-mono">{stats.totalOverlapping}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1">يعملون في الرأسمالي والصيانة معاً</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-2xl">
            ⚠️
          </div>
        </div>

        {/* Card 2: Capital Only */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-blue-200 dark:border-blue-900/60 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400 block mb-1">مقاولون رأسمالي فقط</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white font-mono">{stats.capitalOnly}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1">مشاريع جارية تنفيذية بحتة</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-2xl">
            🏗️
          </div>
        </div>

        {/* Card 3: Maintenance Only */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-400 block mb-1">مقاولون صيانة فقط</span>
            <span className="text-2xl font-black text-gray-900 dark:text-white font-mono">{stats.maintenanceOnly}</span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-1">مشاريع مسلمة ابتدائياً أو صيانة</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl">
            🔧
          </div>
        </div>
      </div>

      {/* Overlapping Contractors Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>📋</span>
              <span>جدول المقاولين المتداخلين وتفصيل المشاريع ({stats.totalOverlapping})</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              انقر على أي مقاول لعرض تفاصيل مشاريعه الرأسمالية ومشاريع الصيانة بشكل مستقل
            </p>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="بحث باسم المقاول..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 font-bold border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 text-center w-16">#</th>
                <th className="px-4 py-3 min-w-[240px]">اسم المقاول (Contractor)</th>
                <th className="px-4 py-3 text-center min-w-[140px]">مشاريع رأسمالية (Capital)</th>
                <th className="px-4 py-3 text-center min-w-[140px]">مشاريع صيانة (Maintenance)</th>
                <th className="px-4 py-3 text-center min-w-[100px]">الإجمالي (Total)</th>
                <th className="px-4 py-3 text-center w-28">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {filteredOverlapping.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-12 text-gray-400">
                    لا يوجد مقاول متداخل يطابق البحث
                  </td>
                </tr>
              ) : (
                filteredOverlapping.map((item, idx) => (
                  <tr
                    key={item.contractor}
                    className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition cursor-pointer"
                    onClick={() => setSelectedContractor(item.contractor)}
                  >
                    <td className="px-4 py-3 text-center font-mono text-gray-400 font-bold">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                      {item.contractor}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-black text-xs font-mono">
                        🏗️ {item.capitalCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-black text-xs font-mono">
                        🔧 {item.maintenanceCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-black text-gray-900 dark:text-white text-sm">
                      {item.total}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedContractor(item.contractor)
                        }}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-[11px] transition shadow-xs"
                      >
                        تفاصيل المشاريع
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contractor Projects Details Modal */}
      {selectedContractor && phaseMap[selectedContractor] && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">تفصيل مشاريع المقاول</span>
                <h3 className="text-xl font-black text-gray-900 dark:text-white mt-0.5">
                  {selectedContractor}
                </h3>
              </div>
              <button
                onClick={() => setSelectedContractor(null)}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-500 hover:bg-gray-200 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Capital Projects Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-blue-700 dark:text-blue-400">
                <span>🏗️</span>
                <span>المشاريع الرأسمالية (الجارية) - أولوية الإسناد: ({phaseMap[selectedContractor].capital.length})</span>
              </div>
              {phaseMap[selectedContractor].capital.length === 0 ? (
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl text-xs text-gray-400">لا توجد مشاريع رأسمالية</div>
              ) : (
                <div className="space-y-2">
                  {phaseMap[selectedContractor].capital.map(p => (
                    <div key={p.id} className="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-gray-900 dark:text-white">{p.name}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600 dark:text-gray-300 text-[11px]">
                        <span><strong>مدير البرنامج:</strong> {p.programManager || 'غير محدد'}</span>
                        {p.operationNumber && <span><strong>رقم العملية:</strong> {p.operationNumber}</span>}
                        <span><strong>الحالة:</strong> {p.status || 'جاري'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Maintenance Projects Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-400">
                <span>🔧</span>
                <span>مشاريع الصيانة والتسليم الابتدائي: ({phaseMap[selectedContractor].maintenance.length})</span>
              </div>
              {phaseMap[selectedContractor].maintenance.length === 0 ? (
                <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl text-xs text-gray-400">لا توجد مشاريع صيانة</div>
              ) : (
                <div className="space-y-2">
                  {phaseMap[selectedContractor].maintenance.map(p => (
                    <div key={p.id} className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-xs space-y-1">
                      <div className="font-bold text-gray-900 dark:text-white">{p.name}</div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-600 dark:text-gray-300 text-[11px]">
                        <span><strong>مدير البرنامج:</strong> {p.programManager || 'غير محدد'}</span>
                        {p.operationNumber && <span><strong>رقم العملية:</strong> {p.operationNumber}</span>}
                        <span><strong>الحالة:</strong> {p.status || 'مسلم ابتدائي'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedContractor(null)}
                className="px-5 py-2 bg-gray-900 dark:bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-gray-800 transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
