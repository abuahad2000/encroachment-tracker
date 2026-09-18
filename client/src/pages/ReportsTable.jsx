import { useEffect, useState, useMemo } from 'react'

export default function ReportsTable() {
  const [reports, setReports] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [sectorFilter, setSectorFilter] = useState('all') // 'all' | 'water' | 'sanitation'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [editReport, setEditReport] = useState(null)
  const [contractorInput, setContractorInput] = useState('')
  const [managerInput, setManagerInput] = useState('')
  const [projectInput, setProjectInput] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/projects').then(r => r.json())
    ])
      .then(([reportsData, projectsData]) => {
        setReports(reportsData || [])
        setProjects(projectsData || [])
        setLoading(false)
      })
      .catch(e => {
        console.error('Error fetching data:', e)
        setLoading(false)
      })
  }, [])

  // Unique contractors from projects list
  const projectContractors = useMemo(() => {
    const set = new Set()
    projects.forEach(p => {
      if (p.contractor && p.contractor.trim() && p.contractor !== '-') {
        set.add(p.contractor.trim())
      }
    })
    return Array.from(set).sort()
  }, [projects])

  // Unique program managers from projects list
  const programManagers = useMemo(() => {
    const set = new Set()
    projects.forEach(p => {
      if (p.programManager && p.programManager.trim() && p.programManager !== '-' && p.programManager !== 'غير محدد') {
        set.add(p.programManager.trim())
      }
    })
    return Array.from(set).sort()
  }, [projects])

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

  const openEditModal = (report) => {
    setEditReport(report)
    setContractorInput(report.contractorName || report.project?.contractor || '')
    setManagerInput(report.project?.programManager || '')
    setProjectInput(report.project?.id || '')
  }

  const handleSaveEdit = async () => {
    if (!editReport) return
    setSavingEdit(true)
    try {
      const payload = {
        reportId: editReport.id,
        customContractor: contractorInput.trim(),
        customProgramManager: managerInput.trim(),
        projectId: projectInput ? projectInput : undefined,
        reason: 'تعديل المقاول ومدير البرنامج'
      }

      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const selectedProj = projects.find(p => String(p.id) === String(projectInput)) || editReport.project
        const newSector = (selectedProj?.name?.includes('مياه') || selectedProj?.subProgram?.includes('مياه')) ? 'مياه' : 'صرف'

        setReports(reports.map(r => {
          if (r.id === editReport.id) {
            return {
              ...r,
              contractorName: contractorInput.trim(),
              customContractor: contractorInput.trim(),
              sector: newSector,
              project: selectedProj ? {
                ...selectedProj,
                programManager: managerInput.trim() || selectedProj.programManager
              } : r.project
            }
          }
          return r
        }))

        if (selectedReport && selectedReport.id === editReport.id) {
          setSelectedReport({
            ...selectedReport,
            contractorName: contractorInput.trim(),
            customContractor: contractorInput.trim(),
            sector: newSector,
            project: selectedProj ? {
              ...selectedProj,
              programManager: managerInput.trim() || selectedProj.programManager
            } : selectedReport.project
          })
        }

        setEditReport(null)
        alert('تم حفظ التعديلات بنجاح')
      }
    } catch (e) {
      console.error('Error saving edits:', e)
      alert('حدث خطأ أثناء الحفظ')
    } finally {
      setSavingEdit(false)
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

    // Filter by Sector: water vs sanitation
    if (sectorFilter === 'water') {
      list = list.filter(r => {
        const s = r.sector || ((r.project?.name?.includes('مياه') || r.project?.subProgram?.includes('مياه')) ? 'مياه' : 'صرف')
        return s === 'مياه'
      })
    } else if (sectorFilter === 'sanitation') {
      list = list.filter(r => {
        const s = r.sector || ((r.project?.name?.includes('مياه') || r.project?.subProgram?.includes('مياه')) ? 'مياه' : 'صرف')
        return s === 'صرف'
      })
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
  }, [reports, activeTab, sectorFilter, searchQuery])

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📑</span>
            <span>سجل بلاغات التعدي المعتمدة</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            عرض بيانات البلاغات في صف كامل مع تصنيف قطاع المياه والصرف وقوائم المقاولين ومدراء البرامج
          </p>
        </div>

        {/* Search */}
        <div className="w-full lg:w-80">
          <input
            type="text"
            placeholder="بحث برقم البلاغ، الحي، المشروع، المقاول..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs & Filters Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-2 bg-gray-100 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'pending'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>⏳ البلاغات المعلقة</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
              {tabCounts.pending}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('processed')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'processed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>✅ تمت المعالجة</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'processed' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
              {tabCounts.processed}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('no-kmz')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'no-kmz'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>👤 بدون KMZ</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'no-kmz' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
              {tabCounts.noKmz}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('excluded')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'excluded'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🚫 المستبعدة</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'excluded' ? 'bg-red-800 text-white' : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'}`}>
              {tabCounts.excluded}
            </span>
          </button>
        </div>

        {/* Sector Classification Filter */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-gray-700 p-1 rounded-xl border border-gray-200 dark:border-gray-600">
          <button
            onClick={() => setSectorFilter('all')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${sectorFilter === 'all' ? 'bg-gray-900 text-white dark:bg-gray-200 dark:text-gray-900' : 'text-gray-600 dark:text-gray-300'}`}
          >
            كافة القطاعات
          </button>
          <button
            onClick={() => setSectorFilter('water')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1 ${sectorFilter === 'water' ? 'bg-blue-600 text-white' : 'text-blue-700 dark:text-blue-300 hover:bg-blue-50'}`}
          >
            <span>💧</span>
            <span>مشاريع المياه</span>
          </button>
          <button
            onClick={() => setSectorFilter('sanitation')}
            className={`px-2.5 py-1 text-xs rounded-lg font-medium transition flex items-center gap-1 ${sectorFilter === 'sanitation' ? 'bg-emerald-600 text-white' : 'text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50'}`}
          >
            <span>🚰</span>
            <span>مشاريع الصرف</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 mb-3"></div>
          <p className="text-gray-600 dark:text-gray-300 text-sm">جاري تحميل سجل البلاغات والمشاريع...</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/70 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 font-bold whitespace-nowrap">
                <tr>
                  <th className="px-3 py-3 text-center">رقم البلاغ</th>
                  <th className="px-2 py-3 text-center">القطاع</th>
                  <th className="px-3 py-3">الحي / المدينة</th>
                  <th className="px-3 py-3">المشروع المسند</th>
                  <th className="px-3 py-3">مدير البرنامج</th>
                  <th className="px-3 py-3">المقاول</th>
                  <th className="px-2 py-3 text-center">المصدر</th>
                  <th className="px-2 py-3 text-center">التأخير</th>
                  <th className="px-3 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filtered.map(r => {
                  const effectiveContractor = r.contractorName || r.project?.contractor || 'غير محدد'
                  const isWater = (r.sector === 'مياه') || (r.project?.name?.includes('مياه') || r.project?.subProgram?.includes('مياه'))
                  const reasonLabel = r.reason?.includes('spatial') ? '📍 خريطة KMZ' :
                                      r.reason?.includes('governorate') ? '🏛️ مقاول المحافظات' :
                                      r.reason?.includes('aswad_exception') ? '⭐ استثناء الرياض' :
                                      r.reason?.includes('contractor') ? '👤 مقاول + حي' :
                                      r.reason === 'manual_override' ? '✏️ تعديل يدوي' : '❓ مطابقة'

                  return (
                    <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-750 transition whitespace-nowrap">
                      {/* رقم البلاغ بدون رمز # */}
                      <td className="px-3 py-3 font-mono font-bold text-gray-900 dark:text-white text-center text-sm">
                        {r.id}
                      </td>

                      {/* تصنيف القطاع: مياه أو صرف */}
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          isWater
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}>
                          <span>{isWater ? '💧' : '🚰'}</span>
                          <span>{isWater ? 'مياه' : 'صرف'}</span>
                        </span>
                      </td>

                      {/* الحي والشارع في سطر واحد */}
                      <td className="px-3 py-3">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {r.district || r.city}
                        </span>
                        {r.street && (
                          <span className="text-gray-400 dark:text-gray-500 mr-1 text-[11px]">
                            ({r.street})
                          </span>
                        )}
                      </td>

                      {/* المشروع المسند في صف كامل */}
                      <td className="px-3 py-3 max-w-[280px] truncate" title={r.project?.name}>
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {r.project?.name || (r.excluded ? r.excludedReason : 'غير مسند')}
                        </span>
                      </td>

                      {/* مدير البرنامج في سطر واحد */}
                      <td className="px-3 py-3 font-semibold text-gray-800 dark:text-gray-200">
                        {r.project?.programManager || '-'}
                      </td>

                      {/* المقاول مع زر التعديل في سطر واحد */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${effectiveContractor === 'غير محدد' ? 'text-gray-400 italic' : 'text-gray-900 dark:text-gray-100'}`}>
                            {effectiveContractor}
                          </span>
                          <button
                            onClick={() => openEditModal(r)}
                            title="تعديل المقاول ومدير البرنامج"
                            className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>

                      {/* المصدر */}
                      <td className="px-2 py-3 text-center text-gray-500 text-[11px]">
                        {reasonLabel}
                      </td>

                      {/* التأخير */}
                      <td className="px-2 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.ageDays > 60 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
                          r.ageDays > 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                          'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        }`}>
                          {r.ageDays || 0} يوم
                        </span>
                      </td>

                      {/* الإجراءات */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            className="px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/50 rounded transition"
                            onClick={() => { setSelectedReport(r); setShowDetails(true); }}
                          >
                            عرض
                          </button>
                          {!r.excluded && r.status !== 'تمت المعالجة' && (
                            <button
                              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition"
                              onClick={() => handleExclude(r.id)}
                            >
                              استبعاد
                            </button>
                          )}
                        </div>
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
                <span className="text-xs text-primary-600 dark:text-primary-400 font-semibold block">تفاصيل البلاغ</span>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">بلاغ رقم {selectedReport.id}</h2>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
                onClick={() => setShowDetails(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">الحي والمدينة</label>
                  <p className="font-bold text-gray-800 dark:text-gray-200">{selectedReport.district || selectedReport.city}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">القطاع</label>
                  <p className="font-bold text-blue-600">{selectedReport.sector || 'صرف'}</p>
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
                  <div className="text-xs font-bold text-gray-500">المشروع الرأسمالي المسند:</div>
                  <div className="font-bold text-gray-900 dark:text-white">{selectedReport.project.name}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><strong>رقم العملية:</strong> {selectedReport.project.operationNumber || '-'}</div>
                    <div><strong>مدير البرنامج:</strong> {selectedReport.project.programManager || '-'}</div>
                    <div><strong>المقاول:</strong> {selectedReport.contractorName || selectedReport.project.contractor || 'غير محدد'}</div>
                    <div><strong>القطاع:</strong> {selectedReport.sector || 'صرف'}</div>
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
                    openEditModal(selectedReport)
                    setShowDetails(false)
                  }}
                >
                  ✏️ تعديل المقاول / مدير البرنامج
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal تعديل المقاول ومدير البرنامج بقوائم منسدلة من الإكسيل */}
      {editReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              تعديل بيانات البلاغ {editReport.id}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              اختر اسم المقاول ومدير البرنامج من القوائم المعتمدة بملف الإكسيل أو قم بتفريغ المقاول.
            </p>

            <div className="space-y-4">
              {/* 1. قائمة المقاولين المنسدلة من ملف الإكسيل */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  اسم المقاول (من مشاريع الإكسيل)
                </label>
                <select
                  value={contractorInput}
                  onChange={e => setContractorInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none mb-2"
                >
                  <option value="">— بدون مقاول (فارغ) —</option>
                  {editReport.project?.contractor && (
                    <option value={editReport.project.contractor}>
                      ⭐ مقاول المشروع الحالي: {editReport.project.contractor}
                    </option>
                  )}
                  <optgroup label="كافة مقاولي المشاريع بملف الإكسيل:">
                    {projectContractors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                </select>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContractorInput('')}
                    className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200"
                  >
                    تفريغ المقاول
                  </button>
                  {editReport.project?.contractor && (
                    <button
                      type="button"
                      onClick={() => setContractorInput(editReport.project.contractor)}
                      className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100"
                    >
                      مقاول المشروع الأصلي
                    </button>
                  )}
                </div>
              </div>

              {/* 2. قائمة مدراء البرامج المنسدلة من ملف الإكسيل */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  اسم مدير البرنامج (من قائمة الإكسيل)
                </label>
                <select
                  value={managerInput}
                  onChange={e => setManagerInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">— اختر مدير البرنامج —</option>
                  {programManagers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* 3. اختيار المشروع المسند */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  المشروع المسند (اختياري)
                </label>
                <select
                  value={projectInput}
                  onChange={e => {
                    setProjectInput(e.target.value)
                    const p = projects.find(x => String(x.id) === String(e.target.value))
                    if (p) {
                      if (p.contractor && p.contractor !== '-') setContractorInput(p.contractor)
                      if (p.programManager && p.programManager !== '-') setManagerInput(p.programManager)
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">— الإبقاء على المشروع الحالي ({editReport.project?.name}) —</option>
                  {projects
                    .filter(p => !managerInput || p.programManager === managerInput)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.scope}) - {p.programManager}
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  onClick={() => setEditReport(null)}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-300 transition text-xs"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition text-xs disabled:opacity-50"
                >
                  {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
