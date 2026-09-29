import { useEffect, useState, useMemo } from 'react'

export default function MappingReview() {
  const [reports, setReports] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedManager, setSelectedManager] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/projects').then(r => r.json())
    ]).then(([reportsData, projectsData]) => {
      setReports(reportsData || [])
      setProjects(projectsData || [])
      setLoading(false)
    })
  }, [])

  // فلترة البلاغات التي تحتاج مراجعة فقط
  const reportsNeedingReview = useMemo(() => {
    return reports.filter(r => 
      r.needsReview === true || 
      r.confidence === 'medium' || 
      r.confidence === 'low'
    )
  }, [reports])

  // إحصائيات
  const stats = useMemo(() => ({
    total: reportsNeedingReview.length,
    medium: reportsNeedingReview.filter(r => r.confidence === 'medium').length,
    low: reportsNeedingReview.filter(r => r.confidence === 'low').length
  }), [reportsNeedingReview])

  const handleCorrectMapping = async () => {
    if (!selectedReport) return
    setSaving(true)
    
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: selectedReport.id,
          customProgramManager: selectedManager,
          projectId: selectedProject,
          reason: 'تصحيح يدوي بعد مراجعة الربط التلقائي'
        })
      })

      if (res.ok) {
        alert('✅ تم تصحيح الربط بنجاح')
        setShowModal(false)
        setSelectedReport(null)
        setSelectedManager('')
        setSelectedProject('')
        // إعادة تحميل البيانات
        const newReports = await fetch('/api/reports').then(r => r.json())
        setReports(newReports || [])
      } else {
        alert('❌ فشل التصحيح')
      }
    } catch (error) {
      alert('❌ خطأ: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span>🔍</span>
          <span>مراجعة الربط التلقائي</span>
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          البلاغات التي لم يتم الربط التلقائي لها بدقة عالية وتحتاج مراجعة يدوية
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">إجمالي يحتاج مراجعة</div>
          <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{stats.total}</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800">
          <div className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">ثقة متوسطة</div>
          <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.medium}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-xl border border-red-200 dark:border-red-800">
          <div className="text-xs text-red-700 dark:text-red-300 font-medium">ثقة منخفضة</div>
          <div className="text-2xl font-bold text-red-900 dark:text-red-100">{stats.low}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/70 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3">رقم البلاغ</th>
                <th className="px-4 py-3">الحي</th>
                <th className="px-4 py-3">المقاول</th>
                <th className="px-4 py-3">مدير البرنامج المسند</th>
                <th className="px-4 py-3">درجة الثقة</th>
                <th className="px-4 py-3">سبب الربط</th>
                <th className="px-4 py-3">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {reportsNeedingReview.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                  <td className="px-4 py-3 font-mono font-bold">{r.id}</td>
                  <td className="px-4 py-3">{r.district || '-'}</td>
                  <td className="px-4 py-3">{r.contractorName || '-'}</td>
                  <td className="px-4 py-3 text-blue-700 dark:text-blue-300 font-medium">
                    {r.programManager || 'غير مسند'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      r.confidence === 'medium' 
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {r.confidenceScore || 0}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {r.matchReason || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setSelectedReport(r)
                        setSelectedManager(r.programManager || '')
                        setSelectedProject(r.projectId || '')
                        setShowModal(true)
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition"
                    >
                      ️ تصحيح
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reportsNeedingReview.length === 0 && (
          <div className="p-12 text-center text-gray-500">
            ✅ لا توجد بلاغات تحتاج مراجعة
          </div>
        )}
      </div>

      {/* Modal التصحيح */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              تصحيح ربط البلاغ #{selectedReport.id}
            </h3>

            <div className="space-y-4">
              {/* معلومات البلاغ */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                <div><strong>الحي:</strong> {selectedReport.district || '-'}</div>
                <div><strong>المقاول:</strong> {selectedReport.contractorName || '-'}</div>
              </div>

              {/* اختيار مدير البرنامج */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  مدير البرنامج الصحيح:
                </label>
                <select
                  value={selectedManager}
                  onChange={e => {
                    setSelectedManager(e.target.value)
                    setSelectedProject('') // إعادة تعيين المشروع
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">— اختر مدير البرنامج —</option>
                  {[...new Set(projects.map(p => p.programManager).filter(Boolean))].map(mgr => (
                    <option key={mgr} value={mgr}>{mgr}</option>
                  ))}
                </select>
              </div>

              {/* اختيار المشروع */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                  المشروع الصحيح:
                </label>
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  disabled={!selectedManager}
                >
                  <option value="">— اختر المشروع —</option>
                  {projects
                    .filter(p => p.programManager === selectedManager)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.scope || '-'})
                      </option>
                    ))}
                </select>
              </div>

              {/* أزرار */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowModal(false)
                    setSelectedReport(null)
                  }}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-300 transition"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleCorrectMapping}
                  disabled={saving || !selectedManager || !selectedProject}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ التصحيح'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
