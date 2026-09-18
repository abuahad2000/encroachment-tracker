import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'

export default function ManagerCards() {
  const [managers, setManagers] = useState([])
  const [selectedSubProgram, setSelectedSubProgram] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/managers')
      .then(r => r.json())
      .then(d => {
        setManagers(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [])

  const subPrograms = useMemo(() => {
    const set = new Set()
    managers.forEach(m => {
      if (m.scope) set.add(m.scope)
    })
    return Array.from(set)
  }, [managers])

  const filteredManagers = useMemo(() => {
    if (selectedSubProgram === 'all') return managers
    return managers.filter(m => m.scope === selectedSubProgram)
  }, [managers, selectedSubProgram])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300 font-medium">جاري تحميل بطاقات مدراء البرامج...</p>
      </div>
    )
  }

  const totalPending = managers.reduce((sum, m) => sum + (m.pendingReportsCount || m.activeReports || 0), 0)
  const totalProcessed = managers.reduce((sum, m) => sum + (m.processedReportsCount || 0), 0)

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>👥</span>
            <span>لوحة مدراء البرامج ({managers.length} مدراء)</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            متابعة حية لتوزيع بلاغات التعدي المعلقة والمعالجة على مسؤولي البرامج الرأسمالية بالرياض والمحافظات
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-center">
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium block">إجمالي المعلقة</span>
            <span className="text-xl font-bold text-amber-700 dark:text-amber-300">{totalPending}</span>
          </div>
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium block">إجمالي المعالجة</span>
            <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{totalProcessed}</span>
          </div>
        </div>
      </div>

      {/* SubProgram Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedSubProgram('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            selectedSubProgram === 'all'
              ? 'bg-primary-600 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
          }`}
        >
          كافة النطاقات ({managers.length})
        </button>
        {subPrograms.map(sp => (
          <button
            key={sp}
            onClick={() => setSelectedSubProgram(sp)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedSubProgram === sp
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            }`}
          >
            {sp}
          </button>
        ))}
      </div>

      {/* Manager Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredManagers.map(mgr => {
          const pendingCount = mgr.pendingReportsCount ?? mgr.activeReports ?? 0
          const processedCount = mgr.processedReportsCount ?? 0
          const hasPending = pendingCount > 0

          return (
            <Link key={mgr.id} to={`/managers/${mgr.id}`}>
              <div className={`p-5 rounded-2xl bg-white dark:bg-gray-800 border transition-all duration-200 hover:shadow-xl cursor-pointer ${
                hasPending
                  ? 'border-amber-200 dark:border-amber-800/60 shadow-sm hover:border-amber-400'
                  : 'border-gray-200 dark:border-gray-700 shadow-sm hover:border-primary-400'
              }`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span>👤</span>
                      <span>{mgr.name}</span>
                    </h2>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {mgr.scope}
                    </span>
                  </div>

                  {/* Pending Badge */}
                  <div className={`px-3 py-1 rounded-xl text-center font-bold text-xs ${
                    hasPending
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  }`}>
                    <span className="block text-[10px] font-normal">المعلقة</span>
                    <span className="text-base">{pendingCount}</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 my-4 p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl text-center text-xs">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block mb-0.5">المشاريع</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{mgr.activeProjects || 0} جاري</span>
                  </div>
                  <div className="border-r border-l border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 block mb-0.5">المعلقة</span>
                    <span className={`font-bold ${hasPending ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {pendingCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block mb-0.5">المعالجة</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{processedCount}</span>
                  </div>
                </div>

                {/* Contact Footer */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1 truncate">
                    <span>📱</span>
                    <span className="truncate">{mgr.phone}</span>
                  </div>
                  <span className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">
                    فتح اللوحة ←
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {filteredManagers.length === 0 && (
        <div className="text-center py-12 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          لا توجد بيانات مدراء مطابقة لهذا النطاق
        </div>
      )}
    </div>
  )
}
