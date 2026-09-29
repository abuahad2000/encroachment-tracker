import { useEffect, useState, useMemo } from 'react'

export default function MappingReview() {
  const [reports, setReports] = useState([])
  const [projects, setProjects] = useState([])
  const [maintenanceDistricts, setMaintenanceDistricts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedManager, setSelectedManager] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionAlert, setActionAlert] = useState(null) // { type: 'success' | 'error', text: '' }

  // نموذج إضافة حي يدوي للصيانة من شريط الأدوات
  const [showManualAddModal, setShowManualAddModal] = useState(false)
  const [manualDistrictName, setManualDistrictName] = useState('')
  const [manualDistrictNotes, setManualDistrictNotes] = useState('')

  const loadData = async () => {
    try {
      const [reportsData, projectsData, maintData] = await Promise.all([
        fetch('/api/reports').then(r => r.json()),
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/districts/maintenance').then(r => r.json()).catch(() => [])
      ])
      setReports(Array.isArray(reportsData) ? reportsData : [])
      setProjects(Array.isArray(projectsData) ? projectsData : [])
      setMaintenanceDistricts(Array.isArray(maintData) ? maintData : [])
    } catch (err) {
      console.error('Error loading data:', err)
      setActionAlert({ type: 'error', text: 'فشل في تحميل البيانات' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // فلترة البلاغات التي تحتاج مراجعة فقط (وليست مستبعدة)
  const reportsNeedingReview = useMemo(() => {
    return reports.filter(r => 
      !r.excluded && (
        r.needsReview === true || 
        r.confidence === 'medium' || 
        r.confidence === 'low' ||
        r.shouldReview === true ||
        !r.matched
      )
    )
  }, [reports])

  // إحصائيات
  const stats = useMemo(() => ({
    total: reportsNeedingReview.length,
    medium: reportsNeedingReview.filter(r => r.confidence === 'medium' || (r.confidenceScore >= 50 && r.confidenceScore < 80)).length,
    low: reportsNeedingReview.filter(r => r.confidence === 'low' || !r.confidence || r.confidenceScore < 50).length,
    maintenanceCount: maintenanceDistricts.length
  }), [reportsNeedingReview, maintenanceDistricts])

  // إضافة حي لقائمة الصيانة واستبعاد بلاغاته فوراً
  const handleAddDistrictToMaintenance = async (districtName, reportId = null) => {
    if (!districtName || districtName === '-' || districtName === 'غير محدد') {
      setActionAlert({ type: 'error', text: 'اسم الحي غير محدد في هذا البلاغ' })
      return
    }

    const cleanDistrict = districtName.replace(/^حي\s+/, '').trim()
    const confirmMsg = `هل تريد إضافة حي "${cleanDistrict}" إلى قائمة الصيانة؟\n\nسيتم استبعاد هذا البلاغ وكافة البلاغات الواقعة في حي "${cleanDistrict}" مباشرة من مشاريع إدارة المشاريع واعتبارها تابعة للتشغيل والصيانة دون الحاجة لربطها بأي مشروع.`
    
    if (!window.confirm(confirmMsg)) return

    try {
      setSaving(true)
      setActionAlert(null)
      const res = await fetch('/api/districts/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: cleanDistrict,
          notes: reportId 
            ? `استبعاد مباشر من صفحة مراجعة الربط (بلاغ #${reportId})` 
            : 'استبعاد مباشر من صفحة مراجعة الربط',
          city: 'مدينة الرياض'
        })
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في إضافة الحي للصيانة')
      }

      setActionAlert({
        type: 'success',
        text: `✅ ${data.message || `تم إضافة حي "${cleanDistrict}" إلى قائمة الصيانة واستبعاد بلاغاته مباشرة!`}`
      })

      // إغلاق النافذة المنبثقة إن كانت مفتوحة
      setShowModal(false)
      setSelectedReport(null)

      // إعادة تحميل البيانات
      await loadData()
    } catch (err) {
      setActionAlert({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // إضافة حي يدوي من الشريط العلوي
  const handleManualAddSubmit = async (e) => {
    e.preventDefault()
    if (!manualDistrictName.trim()) return

    try {
      setSaving(true)
      const res = await fetch('/api/districts/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: manualDistrictName.trim(),
          notes: manualDistrictNotes.trim() || 'إضافة يدوية من صفحة مراجعة الربط',
          city: 'مدينة الرياض'
        })
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في إضافة الحي')
      }

      setActionAlert({
        type: 'success',
        text: `✅ ${data.message}`
      })
      setManualDistrictName('')
      setManualDistrictNotes('')
      setShowManualAddModal(false)
      await loadData()
    } catch (err) {
      setActionAlert({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  // تصحيح الربط اليدوي لمشروع ومدير برنامج
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
        setActionAlert({ type: 'success', text: `✅ تم تصحيح ربط البلاغ #${selectedReport.id} بنجاح` })
        setShowModal(false)
        setSelectedReport(null)
        setSelectedManager('')
        setSelectedProject('')
        await loadData()
      } else {
        const errData = await res.json()
        throw new Error(errData.error || 'فشل التصحيح')
      }
    } catch (error) {
      setActionAlert({ type: 'error', text: '❌ خطأ: ' + error.message })
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
      {/* إشعار التنبيه والنتائج */}
      {actionAlert && (
        <div className={`p-4 rounded-2xl flex items-center justify-between shadow-sm transition ${
          actionAlert.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200' 
            : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
        }`}>
          <span className="font-bold text-xs">{actionAlert.text}</span>
          <button 
            onClick={() => setActionAlert(null)}
            className="text-xs font-black px-2 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header مع زر الإضافة السريعة للصيانة */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>🔍</span>
            <span>مراجعة الربط التلقائي واستبعاد أحياء الصيانة</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            تدقيق البلاغات غير المؤكدة وربطها بالمشاريع، أو إضافة الأحياء مباشرة لقائمة الصيانة لاستبعادها فوراً دون ربط بمشروع.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowManualAddModal(true)}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow transition flex items-center gap-1.5"
          >
            <span>➕</span>
            <span>إضافة حي لقائمة الصيانة</span>
          </button>

          <span className="px-3 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 rounded-xl text-xs font-bold">
            🔧 أحياء الصيانة المعتمدة: <strong>{stats.maintenanceCount}</strong>
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">إجمالي يحتاج مراجعة</div>
          <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">{stats.total}</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-950/30 p-4 rounded-xl border border-yellow-200 dark:border-yellow-800">
          <div className="text-xs text-yellow-700 dark:text-yellow-300 font-medium">ثقة متوسطة</div>
          <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.medium}</div>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-xl border border-red-200 dark:border-red-800">
          <div className="text-xs text-red-700 dark:text-red-300 font-medium">ثقة منخفضة / غير مطابق</div>
          <div className="text-2xl font-bold text-red-900 dark:text-red-100">{stats.low}</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="text-xs text-blue-700 dark:text-blue-300 font-medium">أحياء مستبعدة للصيانة</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.maintenanceCount}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/70 text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">رقم البلاغ</th>
                <th className="px-4 py-3 whitespace-nowrap">الحي</th>
                <th className="px-4 py-3 whitespace-nowrap">المقاول</th>
                <th className="px-4 py-3 whitespace-nowrap">مدير البرنامج المسند</th>
                <th className="px-4 py-3 whitespace-nowrap">درجة الثقة</th>
                <th className="px-4 py-3 whitespace-nowrap">سبب الربط التلقائي</th>
                <th className="px-4 py-3 whitespace-nowrap text-center">إجراءات المراجعة والاستبعاد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {reportsNeedingReview.map(r => {
                const hasDistrict = r.district && r.district !== '-' && r.district !== 'غير محدد'
                return (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                    <td className="px-4 py-3 font-mono font-bold whitespace-nowrap">#{r.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {r.district || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {r.contractorName || '-'}
                    </td>
                    <td className="px-4 py-3 text-blue-700 dark:text-blue-300 font-bold whitespace-nowrap">
                      {r.programManager || 'غير مسند'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        r.confidence === 'medium' || (r.confidenceScore >= 50 && r.confidenceScore < 80)
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                      }`}>
                        {r.confidenceScore !== undefined ? `${r.confidenceScore}%` : (r.confidence || 'منخفض')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate" title={r.matchReason || r.reason || '-'}>
                      {r.matchReason || r.reason || '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        {/* زر تصحيح الربط */}
                        <button
                          onClick={() => {
                            setSelectedReport(r)
                            setSelectedManager(r.programManager || '')
                            setSelectedProject(r.projectId || (r.project?.id ? String(r.project.id) : ''))
                            setShowModal(true)
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm"
                        >
                          <span>✏️</span>
                          <span>تصحيح</span>
                        </button>

                        {/* زر استبعاد الحي وإضافته للصيانة مباشرة */}
                        {hasDistrict && (
                          <button
                            onClick={() => handleAddDistrictToMaintenance(r.district, r.id)}
                            disabled={saving}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-black transition flex items-center gap-1 shadow-sm disabled:opacity-50"
                            title={`إضافة حي "${r.district}" إلى تصنيف الصيانة واستبعاد كافة بلاغاته مباشرة`}
                          >
                            <span>🔧</span>
                            <span>إضافة الحي للصيانة</span>
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
        {reportsNeedingReview.length === 0 && (
          <div className="p-12 text-center text-gray-500 font-bold space-y-1">
            <span className="text-3xl block">✅</span>
            <p>كافة البلاغات مرتبطة ومطابقة بدقة عالية أو مستبعدة للصيانة</p>
          </div>
        )}
      </div>

      {/* Modal التصحيح أو استبعاد الحي للصيانة */}
      {showModal && selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>مراجعة وتصحيح البلاغ #{selectedReport.id}</span>
              </h3>
              <button 
                onClick={() => { setShowModal(false); setSelectedReport(null) }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-black text-sm"
              >
                ✕
              </button>
            </div>

            {/* معلومات البلاغ الأساسية */}
            <div className="p-3.5 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs space-y-1.5 border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">الحي:</span>
                <strong className="text-gray-900 dark:text-white">{selectedReport.district || '-'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">المقاول:</span>
                <strong className="text-gray-900 dark:text-white">{selectedReport.contractorName || '-'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">المدير المسند حالياً:</span>
                <strong className="text-blue-600 dark:text-blue-400">{selectedReport.programManager || 'غير مسند'}</strong>
              </div>
            </div>

            {/* الخيار الأسرع والمباشر: استبعاد الحي للصيانة */}
            {selectedReport.district && selectedReport.district !== '-' && selectedReport.district !== 'غير محدد' && (
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <span>🔧</span>
                    <span>هل هذا الحي يتبع التشغيل والصيانة؟</span>
                  </span>
                  <span className="text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full font-bold">
                    لا يتطلب ربط بمشروع
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  إذا كان حي <strong>"{selectedReport.district}"</strong> لا يتبع لمشاريع رأسمالية، أضفه مباشرة لقائمة الصيانة لاستبعاد هذا البلاغ وكافة بلاغات الحي فوراً.
                </p>
                <button
                  type="button"
                  onClick={() => handleAddDistrictToMaintenance(selectedReport.district, selectedReport.id)}
                  disabled={saving}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>➕ إضافة حي "{selectedReport.district}" لقائمة الصيانة واستبعاده فوراً</span>
                </button>
              </div>
            )}

            {/* الخيار البديل: تصحيح الربط إلى مدير مشروع آخر */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 block">
                أو تصحيح الربط يدوياً لمدير برنامج ومشروع:
              </span>

              {/* اختيار مدير البرنامج */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  مدير البرنامج المشرف:
                </label>
                <select
                  value={selectedManager}
                  onChange={e => {
                    setSelectedManager(e.target.value)
                    setSelectedProject('')
                  }}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">— اختر مدير البرنامج —</option>
                  {[...new Set(projects.map(p => p.programManager).filter(Boolean))].sort().map(mgr => (
                    <option key={mgr} value={mgr}>{mgr}</option>
                  ))}
                </select>
              </div>

              {/* اختيار المشروع */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  المشروع الرأسمالي المعني:
                </label>
                <select
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  disabled={!selectedManager}
                >
                  <option value="">— اختر المشروع —</option>
                  {projects
                    .filter(p => p.programManager === selectedManager)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        #{p.id} - {p.name} ({p.scope || '-'})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* أزرار الإجراءات */}
            <div className="flex gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setShowModal(false)
                  setSelectedReport(null)
                }}
                className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs hover:bg-gray-300 transition"
              >
                إلغاء
              </button>
              <button
                onClick={handleCorrectMapping}
                disabled={saving || !selectedManager || !selectedProject}
                className="flex-1 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ التصحيح اليدوي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal إضافة حي يدوي للصيانة من الشريط العلوي */}
      {showManualAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>➕ إضافة حي لقائمة الصيانة (استبعاد مباشر)</span>
              </h3>
              <button 
                onClick={() => setShowManualAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-black text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualAddSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  اسم الحي المراد استبعاده للصيانة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualDistrictName}
                  onChange={(e) => setManualDistrictName(e.target.value)}
                  placeholder="مثال: الرمال، الشفا، العارض، بدر..."
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  ملاحظات أو سبب الاستبعاد (اختياري)
                </label>
                <input
                  type="text"
                  value={manualDistrictNotes}
                  onChange={(e) => setManualDistrictNotes(e.target.value)}
                  placeholder="مثال: يتبع لعقود الصيانة الدورية"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualAddModal(false)}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs hover:bg-gray-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving || !manualDistrictName.trim()}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs shadow transition disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ واستبعاد بلاغات الحي'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
