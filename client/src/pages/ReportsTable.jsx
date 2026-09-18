import { useEffect, useState, useMemo } from 'react'

export default function ReportsTable() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [editContractorReport, setEditContractorReport] = useState(null)
  const [contractorInput, setContractorInput] = useState('')
  const [savingContractor, setSavingContractor] = useState(false)

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(d => {
        setReports(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [])

  const handleExclude = async (reportId) => {
    if (!confirm('هل تريد استبعاد هذا البلاغ؟')) return
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, excluded: true, reason: 'user_excluded' })
      })
      if (res.ok) {
        setReports(reports.map(r =>
          r.id === reportId ? { ...r, excluded: true, matched: false } : r
        ))
        setShowDetails(false)
      }
    } catch (e) {
      console.error('Error:', e)
    }
  }

  const handleSaveContractor = async () => {
    if (!editContractorReport) return
    setSavingContractor(true)
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: editContractorReport.id,
          customContractor: contractorInput.trim(),
          reason: 'تعديل اسم المقاول'
        })
      })
      if (res.ok) {
        setReports(reports.map(r => {
          if (r.id === editContractorReport.id) {
            return {
              ...r,
              contractorName: contractorInput.trim(),
              customContractor: contractorInput.trim()
            }
          }
          return r
        }))
        if (selectedReport && selectedReport.id === editContractorReport.id) {
          setSelectedReport({
            ...selectedReport,
            contractorName: contractorInput.trim(),
            customContractor: contractorInput.trim()
          })
        }
        setEditContractorReport(null)
        alert('تم حفظ المقاول بنجاح مع استمرار ربط البلاغ بالمشروع ومدير البرنامج')
      }
    } catch (e) {
      console.error('Error saving contractor:', e)
      alert('حدث خطأ أثناء الحفظ')
    } finally {
      setSavingContractor(false)
    }
  }

  const tabCounts = useMemo(() => {
    const pending = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تمت المعالجة').length
    const processed = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تمت المعالجة').length
    const noKmz = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تمت المعالجة' && !r.reason?.includes('spatial')).length
    const excluded = reports.filter(r => r.excluded).length
    return { pending, processed, noKmz, excluded }
  }, [reports])

  const filtered = useMemo(() => {
    let list = []
    if (activeTab === 'pending') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تمت المعالجة')
    } else if (activeTab === 'processed') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تمت المعالجة')
    } else if (activeTab === 'no-kmz') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تمت المعالجة' && !r.reason?.includes('spatial'))
    } else if (activeTab === 'excluded') {
      list = reports.filter(r => r.excluded)
    } else {
      list = reports
    }

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(r => {
      const idStr = String(r.id)
      const dist = (r.district || r.city || '').toLowerCase()
      const proj = (r.project?.name || '').toLowerCase()
      const cont = (r.contractorName || r.project?.contractor || '').toLowerCase()
      const mgr = (r.project?.programManager || '').toLowerCase()
      return idStr.includes(q) || dist.includes(q) || proj.includes(q) || cont.includes(q) || mgr.includes(q)
    })
  }, [reports, activeTab, searchQuery])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📑</span>
            <span>سجل بلاغات التعدي المعتمدة</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            جدول تفاعلي مع إمكانية تعديل المقاولين أو تفريغهم مع بقاء الارتباط بمدراء البرامج
          </p>
        </div>

        {/* Search */}
        <div className="w-full md:w-80">
          <input
            type="text"
            placeholder="بحث برقم البلاغ، الحي، المشروع، المقاول..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>⏳ البلاغات المعلقة</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
            {tabCounts.pending}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('processed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'processed'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>✅ تمت المعالجة</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'processed' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
            {tabCounts.processed}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('no-kmz')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'no-kmz'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>👤 مطابقة مقاول/حي (بدون KMZ)</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'no-kmz' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
            {tabCounts.noKmz}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('excluded')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'excluded'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>🚫 المستبعدة</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'excluded' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
            {tabCounts.excluded}
          </span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">جاري تحميل سجل البلاغات...</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3">رقم البلاغ</th>
                  <th className="px-4 py-3">الحي / المدينة</th>
                  <th className="px-4 py-3">المشروع المسند</th>
                  <th className="px-4 py-3">مدير البرنامج</th>
                  <th className="px-4 py-3">المقاول</th>
                  <th className="px-4 py-3">المصدر</th>
                  <th className="px-4 py-3">التأخير</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filtered.map(r => {
                  const effectiveContractor = r.contractorName || r.project?.contractor || 'غير محدد'
                  const reasonLabel = r.reason?.includes('spatial') ? '📍 خريطة KMZ' :
                                      r.reason?.includes('governorate') ? '🏛️ مقاول المحافظات' :
                                      r.reason?.includes('aswad_exception') ? '⭐ استثناء الرياض' :
                                      r.reason?.includes('contractor') ? '👤 مقاول + حي' :
                                      r.reason === 'manual_override' ? '✏️ تعديل يدوي' : '❓ مطابقة'

                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                      <td className="px-4 py-3 font-bold text-primary-600 dark:text-primary-400 whitespace-nowrap">
                        #{r.id}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-semibold text-gray-900 dark:text-white block">{r.district || r.city}</span>
                        {r.street && <span className="text-xs text-gray-400 block truncate max-w-[150px]">{r.street}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="font-medium text-gray-900 dark:text-gray-200 block truncate" title={r.project?.name}>
                          {r.project?.name || (r.excluded ? r.excludedReason : 'غير مسند')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {r.project?.programManager || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${effectiveContractor === 'غير محدد' ? 'text-gray-400 italic' : 'text-gray-800 dark:text-gray-200'}`}>
                            {effectiveContractor}
                          </span>
                          <button
                            onClick={() => {
                              setEditContractorReport(r)
                              setContractorInput(effectiveContractor === 'غير محدد' ? '' : effectiveContractor)
                            }}
                            title="تعديل اسم المقاول"
                            className="text-gray-400 hover:text-blue-600 text-xs p-1"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                        {reasonLabel}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          r.ageDays > 60 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
                          r.ageDays > 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                          'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        }`}>
                          {r.ageDays || 0} يوم
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <button
                          className="px-2.5 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/50 rounded-lg transition"
                          onClick={() => { setSelectedReport(r); setShowDetails(true); }}
                        >
                          عرض
                        </button>
                        {!r.excluded && r.status !== 'تمت المعالجة' && (
                          <button
                            className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition mr-1"
                            onClick={() => handleExclude(r.id)}
                          >
                            استبعاد
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-12 text-center text-gray-500">لا توجد بلاغات في هذا التبويب</div>
          )}
        </div>
      )}

      {/* Modal تفاصيل البلاغ */}
      {showDetails && selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-xs text-primary-600 dark:text-primary-400 font-semibold block">بطاقة البلاغ التفصيلية</span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">بلاغ رقم #{selectedReport.id}</h2>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
                onClick={() => setShowDetails(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">الحي والمدينة</label>
                  <p className="font-bold text-gray-800 dark:text-gray-200">{selectedReport.district || selectedReport.city} - {selectedReport.street || 'غير محدد'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">حالة البلاغ</label>
                  <p className="font-bold text-amber-600">{selectedReport.status}</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">وصف التعدي</label>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                  {selectedReport.description}
                </div>
              </div>

              {selectedReport.project && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="text-xs font-bold text-gray-500">المشروع المسند:</div>
                  <div className="font-bold text-gray-900 dark:text-white">{selectedReport.project.name}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><strong>رقم العملية:</strong> {selectedReport.project.operationNumber || '-'}</div>
                    <div><strong>مدير البرنامج:</strong> {selectedReport.project.programManager || '-'}</div>
                    <div><strong>المقاول:</strong> {selectedReport.contractorName || selectedReport.project.contractor || 'غير محدد'}</div>
                    <div><strong>الحالة:</strong> {selectedReport.project.status}</div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-300 transition"
                  onClick={() => setShowDetails(false)}
                >
                  إغلاق
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition"
                  onClick={() => {
                    setEditContractorReport(selectedReport)
                    setContractorInput(selectedReport.contractorName || selectedReport.project?.contractor || '')
                    setShowDetails(false)
                  }}
                >
                  ✏️ تعديل المقاول
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal تعديل المقاول */}
      {editContractorReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              تعديل اسم المقاول للبلاغ #{editContractorReport.id}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              يمكنك كتابة اسم المقاول الفعلي أو تركه فارغاً مع بقاء البلاغ مرتبطاً بالمشروع ومدير البرنامج ({editContractorReport.project?.programManager || 'المسند'}).
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  اسم المقاول
                </label>
                <input
                  type="text"
                  placeholder="اتركه فارغاً إذا لم يوجد مقاول..."
                  value={contractorInput}
                  onChange={e => setContractorInput(e.target.value)}
                  className="w-full px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setContractorInput('')}
                  className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200"
                >
                  تفريغ (تركه فارغاً)
                </button>
                {editContractorReport.project?.contractor && (
                  <button
                    type="button"
                    onClick={() => setContractorInput(editContractorReport.project.contractor)}
                    className="px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100"
                  >
                    استخدام مقاول المشروع
                  </button>
                )}
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  onClick={() => setEditContractorReport(null)}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-300 transition text-sm"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveContractor}
                  disabled={savingContractor}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition text-sm disabled:opacity-50"
                >
                  {savingContractor ? 'جاري الحفظ...' : 'حفظ التعديل'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
