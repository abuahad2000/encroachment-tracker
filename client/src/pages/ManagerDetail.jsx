import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useMemo } from 'react'

export default function ManagerDetail() {
  const { managerId } = useParams()
  const navigate = useNavigate()
  const [manager, setManager] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending') // 'pending' | 'processed' | 'all'
  const [selectedReport, setSelectedReport] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [editContractorReport, setEditContractorReport] = useState(null)
  const [contractorInput, setContractorInput] = useState('')
  const [projectInput, setProjectInput] = useState('')
  const [sectorInput, setSectorInput] = useState('مياه')
  const [allProjects, setAllProjects] = useState([])
  const [savingContractor, setSavingContractor] = useState(false)
  const [projectContractors, setProjectContractors] = useState([])

  useEffect(() => {
    Promise.all([
      fetch('/api/managers').then(r => r.json()),
      fetch('/api/reports').then(r => r.json()),
      fetch('/api/projects').then(r => r.json()).catch(() => [])
    ])
      .then(([managers, allReports, projectsData]) => {
        if (projectsData && Array.isArray(projectsData)) {
          setAllProjects(projectsData)
          const contractors = Array.from(new Set(
            projectsData
              .map(p => (p.contractor || '').trim())
              .filter(c => c && c.length > 2 && c !== 'غير محدد')
          )).sort((a, b) => a.localeCompare(b, 'ar'))
          setProjectContractors(contractors)
        }

        const decodedId = decodeURIComponent(managerId).toLowerCase()
        const mgr = managers.find(m => 
          m.id === managerId || 
          m.slug === managerId || 
          m.id === decodedId ||
          m.name.toLowerCase() === decodedId ||
          m.name.replace(/\s+/g, '-').toLowerCase() === decodedId
        )
        setManager(mgr)

        if (!mgr) {
          setLoading(false)
          return
        }

        const managerProjectIds = (mgr.projects || []).map(p => String(p.id))
        const matchedReports = allReports.filter(r =>
          !r.excluded &&
          r.matched &&
          r.project &&
          (r.project.programManager === mgr.name || managerProjectIds.includes(String(r.project.id)))
        )

        setReports(matchedReports)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [managerId])

  const pendingReports = useMemo(() => {
    return reports.filter(r => r.status === 'تحت معالجة المقاول')
  }, [reports])

  const inProgressReports = useMemo(() => {
    return reports.filter(r => r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة')
  }, [reports])

  const processedReports = useMemo(() => {
    return reports.filter(r => r.status === 'تمت المعالجة')
  }, [reports])

  const displayedReports = useMemo(() => {
    if (activeTab === 'pending') return pendingReports
    if (activeTab === 'in-progress') return inProgressReports
    if (activeTab === 'processed') return processedReports
    return reports
  }, [activeTab, pendingReports, inProgressReports, processedReports, reports])

  const handleExclude = async (reportId) => {
    if (!confirm('هل أنت متأكد من استبعاد هذا البلاغ من نطاق مشاريع مدير البرنامج؟')) return
    try {
      const rep = reports.find(r => r.id === reportId)
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reportId, 
          excluded: true, 
          reason: 'مستبعد من نطاق مشاريع مدير البرنامج',
          licenseNumber: rep?.licenseNumber || undefined
        })
      })
      if (res.ok) {
        setReports(reports.filter(r => r.id !== reportId))
        setShowDetails(false)
        alert('✅ تم استبعاد البلاغ من مدير البرنامج بنجاح، وتحديث التقرير التنفيذي وملف الإكسيل فورياً')
      }
    } catch (e) {
      console.error('Error:', e)
      alert('حدث خطأ أثناء استبعاد البلاغ')
    }
  }

  const openEditModal = (report) => {
    setEditContractorReport(report)
    const effectiveContractor = report.contractorName || report.project?.contractor || ''
    setContractorInput(effectiveContractor === 'NULL' ? '' : effectiveContractor)
    setProjectInput(report.project?.id || '')
    const detectedSector = report.sector || 
      ((report.project?.name?.includes('صرف') || report.project?.subProgram?.includes('صرف')) ? 'صرف' : 'مياه')
    setSectorInput(detectedSector)
  }

  const handleSaveContractor = async () => {
    if (!editContractorReport) return
    setSavingContractor(true)
    try {
      const chosenProj = allProjects.find(p => String(p.id) === String(projectInput))
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: editContractorReport.id,
          licenseNumber: editContractorReport.licenseNumber || undefined,
          customContractor: contractorInput.trim(),
          customProgramManager: manager?.name || undefined,
          projectId: projectInput || undefined,
          customSector: sectorInput,
          reason: 'تعديل وتثبيت المقاول والمشروع والقطاع'
        })
      })
      if (res.ok) {
        setReports(reports.map(r => {
          if (r.id === editContractorReport.id) {
            return {
              ...r,
              contractorName: contractorInput.trim(),
              customContractor: contractorInput.trim(),
              isLocked: true,
              lockedContractor: true,
              sector: sectorInput,
              project: chosenProj ? {
                ...chosenProj,
                programManager: manager?.name || chosenProj.programManager
              } : r.project
            }
          }
          return r
        }))
        if (selectedReport && selectedReport.id === editContractorReport.id) {
          setSelectedReport({
            ...selectedReport,
            contractorName: contractorInput.trim(),
            customContractor: contractorInput.trim(),
            isLocked: true,
            lockedContractor: true,
            sector: sectorInput,
            project: chosenProj ? {
              ...chosenProj,
              programManager: manager?.name || chosenProj.programManager
            } : selectedReport.project
          })
        }
        setEditContractorReport(null)
        alert('تم حفظ وتثبيت المقاول والمشروع وتحديث القطاع بنجاح')
      }
    } catch (e) {
      console.error('Error saving contractor:', e)
      alert('حدث خطأ أثناء الحفظ')
    } finally {
      setSavingContractor(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300 font-medium">جاري تحميل لوحة مدير البرنامج...</p>
      </div>
    )
  }

  if (!manager) {
    return (
      <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
        <p className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-2">لم يتم العثور على مدير البرنامج</p>
        <button
          onClick={() => navigate('/managers')}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition"
        >
          ← عودة إلى قائمة المدراء
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <button
          onClick={() => navigate('/managers')}
          className="text-primary-600 dark:text-primary-400 text-sm font-semibold hover:underline inline-flex items-center gap-1"
        >
          <span>←</span>
          <span>العودة إلى بطاقات مدراء البرامج</span>
        </button>
      </div>

      {/* Manager Header Card */}
      <div className="bg-gradient-to-l from-blue-50 via-white to-blue-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-800/90 border border-blue-100 dark:border-gray-700 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 mb-2">
              {manager.scope}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <span>👤</span>
              <span>{manager.name}</span>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              لوحة المتابعة الشاملة لبلاغات التعدي والمشاريع الرأسمالية المسندة
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl text-center min-w-[90px]">
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400 block">معلقة (المقاول)</span>
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-300">{pendingReports.length}</span>
            </div>
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 rounded-xl text-center min-w-[90px]">
              <span className="text-xs font-medium text-sky-600 dark:text-sky-400 block">تحت الإجراء</span>
              <span className="text-2xl font-bold text-sky-700 dark:text-sky-300">{inProgressReports.length}</span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-center min-w-[90px]">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 block">تمت المعالجة</span>
              <span className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{processedReports.length}</span>
            </div>
          </div>
        </div>

        {/* Contact info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700/80 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">📱 الهاتف:</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">{manager.phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">📧 البريد:</span>
            <span className="font-semibold text-gray-800 dark:text-gray-200">{manager.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">🏗️ المشاريع الجارية:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">{manager.activeProjects || 0} مشروعاً</span>
          </div>
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
          <span>⏳ معلقة (المقاول)</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
            {pendingReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('in-progress')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'in-progress'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>🔄 تحت الإجراء</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'in-progress' ? 'bg-sky-800 text-white' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>
            {inProgressReports.length}
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
            {processedReports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
            activeTab === 'all'
              ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>📋 كافة البلاغات المسندة</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900' : 'bg-gray-200 dark:bg-gray-600'}`}>
            {reports.length}
          </span>
        </button>
      </div>

      {/* Reports Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {displayedReports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/60 font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap">رقم البلاغ</th>
                  <th className="px-3 py-3 whitespace-nowrap">القطاع</th>
                  <th className="px-3 py-3 whitespace-nowrap">تاريخ البلاغ</th>
                  <th className="px-3 py-3 whitespace-nowrap">الحي / المدينة</th>
                  <th className="px-3 py-3">المشروع المسند</th>
                  <th className="px-3 py-3 whitespace-nowrap">المقاول</th>
                  <th className="px-3 py-3 whitespace-nowrap">حالة البلاغ</th>
                  <th className="px-3 py-3 whitespace-nowrap">التأخير</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {displayedReports.map(r => {
                  const isProcessed = r.status === 'تمت المعالجة'
                  const effectiveContractor = r.contractorName || r.project?.contractor || 'غير محدد'
                  const sector = r.sector || ((r.project?.name || '').includes('صرف') ? 'صرف' : 'مياه')

                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                      <td className="px-3 py-2.5 font-bold text-gray-900 dark:text-white whitespace-nowrap font-mono">
                        {r.id}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          sector === 'مياه'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                        }`}>
                          {sector === 'مياه' ? '💧 مياه' : '🚰 صرف'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                        {r.dateReport || r.dateIncident || '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-gray-900 dark:text-white">{r.district || r.city}</span>
                        {r.street && <span className="text-[11px] text-gray-400 mr-1.5">({r.street})</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[280px]">
                        <span className="font-medium text-gray-900 dark:text-gray-200 block truncate" title={r.project?.name}>
                          {r.project?.name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                            {effectiveContractor}
                          </span>
                          {(r.customContractor || r.isLocked || r.lockedContractor) && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800" title="تم تثبيت المقاول يدوياً">
                              🔒 مثبت
                            </span>
                          )}
                          <button
                            onClick={() => openEditModal(r)}
                            title="تعديل المقاول والمشروع والقطاع"
                            className="text-gray-400 hover:text-blue-600 text-xs p-1"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          isProcessed
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.ageDays > 60 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' :
                          r.ageDays > 30 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                          'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                        }`}>
                          {r.ageDays} يوم
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          {r.latitude && r.longitude && (
                            <a
                              href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition"
                              title="فتح الموقع في خرائط Google"
                            >
                              📍
                            </a>
                          )}
                          <button
                            onClick={() => { setSelectedReport(r); setShowDetails(true); }}
                            className="px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/50 rounded-lg transition"
                          >
                            التفاصيل
                          </button>
                          {!isProcessed && (
                            <button
                              onClick={() => handleExclude(r.id)}
                              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition mr-1"
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
        ) : (
          <div className="p-12 text-center text-gray-500">
            <span className="text-3xl block mb-2">🎉</span>
            <p className="font-semibold">لا توجد بلاغات في هذا التبويب حالياً</p>
          </div>
        )}
      </div>

      {/* Modal تفاصيل البلاغ */}
      {showDetails && selectedReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-start mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-xs text-primary-600 dark:text-primary-400 font-semibold block">تفاصيل بلاغ التعدي</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">الحي والشارع</label>
                  <p className="font-bold text-gray-800 dark:text-gray-200">{selectedReport.district || selectedReport.city} - {selectedReport.street || 'غير محدد'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">القطاع</label>
                  <p className={`font-bold ${selectedReport.sector === 'مياه' ? 'text-blue-600' : 'text-teal-600'}`}>
                    {selectedReport.sector === 'مياه' ? '💧 مياه' : '🚰 صرف'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">رقم الرخصة</label>
                  <p className="font-bold font-mono text-gray-900 dark:text-white">
                    {selectedReport.licenseNumber || 'لا يوجد'}
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">المقاول في البلاغ</label>
                  <p className="font-bold text-gray-900 dark:text-white truncate" title={selectedReport.contractorName || 'غير مسجل'}>
                    {selectedReport.contractorName || 'غير مسجل'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">وصف التعدي الميداني</label>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                  {selectedReport.description}
                </div>
              </div>

              {selectedReport.centerComment && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">إفادة مركز مشاريع البنية التحتية (RIPC)</label>
                  <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                    {selectedReport.centerComment}
                  </div>
                </div>
              )}

              {/* Project Card */}
              {selectedReport.project && (
                <div className="p-4 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                  <div className="text-xs font-bold text-gray-500">المشروع الرأسمالي المسند:</div>
                  <div className="font-bold text-gray-900 dark:text-white">{selectedReport.project.name}</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><strong>رقم العملية:</strong> {selectedReport.project.operationNumber || '-'}</div>
                    <div><strong>مدير البرنامج:</strong> {selectedReport.project.programManager || '-'}</div>
                    <div>
                      <strong>المقاول:</strong> {selectedReport.contractorName || selectedReport.project.contractor || 'غير محدد'}
                    </div>
                    <div><strong>حالة المشروع:</strong> {selectedReport.project.status}</div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2.5">
                <button
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-semibold hover:bg-gray-300 transition text-sm"
                  onClick={() => setShowDetails(false)}
                >
                  إغلاق
                </button>
                {selectedReport.latitude && selectedReport.longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedReport.latitude},${selectedReport.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold flex items-center justify-center gap-1.5 transition shadow text-sm"
                  >
                    <span>📍</span>
                    <span>خرائط Google</span>
                  </a>
                )}
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition text-sm"
                  onClick={() => {
                    openEditModal(selectedReport)
                    setShowDetails(false)
                  }}
                >
                  ✏️ تعديل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal تعديل المقاول والمشروع والقطاع */}
      {editContractorReport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>✏️</span>
                  <span>تعديل المقاول والمشروع والقطاع</span>
                </h3>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5 block">
                  بلاغ رقم {editContractorReport.id} • مدير البرنامج: {manager?.name}
                </span>
              </div>
              <button
                onClick={() => setEditContractorReport(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. اختيار المشروع التابع لمدير البرنامج */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  المشروع التابع لمدير البرنامج ({manager?.name})
                </label>
                <select
                  value={projectInput}
                  onChange={e => {
                    const pId = e.target.value
                    setProjectInput(pId)
                    const chosen = allProjects.find(p => String(p.id) === String(pId))
                    if (chosen) {
                      if (chosen.contractor && chosen.contractor !== '-') setContractorInput(chosen.contractor)
                      const isSewer = (chosen.name?.includes('صرف') || chosen.subProgram?.includes('صرف'))
                      setSectorInput(isSewer ? 'صرف' : 'مياه')
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="">— اختر من مشاريع {manager?.name} —</option>
                  {allProjects
                    .filter(p => p.programManager === manager?.name)
                    .map(p => {
                      const sec = (p.name?.includes('صرف') || p.subProgram?.includes('صرف')) ? 'صرف' : 'مياه'
                      return (
                        <option key={p.id} value={p.id}>
                          {sec === 'مياه' ? '💧 مياه' : '🚰 صرف'} | {p.name} ({p.scope}) - المقاول: {p.contractor}
                        </option>
                      )
                    })}
                  <optgroup label="كافة مشاريع شركة المياه الوطنية الأخرى:">
                    {allProjects
                      .filter(p => p.programManager !== manager?.name)
                      .map(p => {
                        const sec = (p.name?.includes('صرف') || p.subProgram?.includes('صرف')) ? 'صرف' : 'مياه'
                        return (
                          <option key={p.id} value={p.id}>
                            {sec === 'مياه' ? '💧 مياه' : '🚰 صرف'} | {p.name} ({p.scope}) - {p.programManager}
                          </option>
                        )
                      })}
                  </optgroup>
                </select>
              </div>

              {/* 2. بطاقة تحديث القطاع تلقائياً بناء على المشروع مع إمكانية التبديل الفوري */}
              <div className="p-3 bg-gradient-to-l from-blue-50 to-emerald-50 dark:from-blue-950/40 dark:to-emerald-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[11px] text-gray-600 dark:text-gray-400 font-bold block">
                      تصنيف القطاع المحدث للبلاغ:
                    </span>
                    <span className="text-sm font-black flex items-center gap-1.5 mt-0.5">
                      {sectorInput === 'مياه' ? (
                        <span className="text-blue-700 dark:text-blue-300 flex items-center gap-1">
                          <span>💧</span>
                          <span>مشاريع المياه</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <span>🚰</span>
                          <span>مشاريع الصرف الصحي</span>
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSectorInput('مياه')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        sectorInput === 'مياه'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>💧</span>
                      <span>مياه</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectorInput('صرف')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                        sectorInput === 'صرف'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span>🚰</span>
                      <span>صرف</span>
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block mt-1.5">
                  ⚡ يتم تحديث القطاع تلقائياً حسب المشروع المختار لمدير البرنامج، ويمكنك التبديل بينهما يدوياً.
                </span>
              </div>

              {/* 3. اسم المقاول */}
              <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  اسم المقاول المعتمد للبلاغ
                </label>
                <input
                  type="text"
                  placeholder="اكتب اسم المقاول أو عدّله..."
                  value={contractorInput}
                  onChange={e => setContractorInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
                />

                <select
                  value={projectContractors.includes(contractorInput) ? contractorInput : ''}
                  onChange={e => {
                    if (e.target.value) setContractorInput(e.target.value)
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- أو اختر من قائمة مقاولي المشاريع ({projectContractors.length} مقاول) --</option>
                  {projectContractors.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <div className="flex gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setContractorInput('')}
                    className="px-2.5 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 transition"
                  >
                    تفريغ
                  </button>
                  {editContractorReport.contractorName && editContractorReport.contractorName !== 'NULL' && (
                    <button
                      type="button"
                      onClick={() => setContractorInput(editContractorReport.contractorName)}
                      className="px-2.5 py-1 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-100 border border-amber-200 dark:border-amber-800 font-semibold transition"
                    >
                      مقاول البلاغ الأصلي
                    </button>
                  )}
                  {editContractorReport.project?.contractor && (
                    <button
                      type="button"
                      onClick={() => setContractorInput(editContractorReport.project.contractor)}
                      className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 font-semibold transition"
                    >
                      مقاول المشروع الحالي
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditContractorReport(null)}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-300 transition text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveContractor}
                  disabled={savingContractor}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition text-xs disabled:opacity-50"
                >
                  {savingContractor ? 'جاري الحفظ...' : 'حفظ وتثبيت التعديل'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
