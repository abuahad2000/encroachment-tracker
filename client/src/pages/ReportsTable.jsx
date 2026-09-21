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
  const [sectorInput, setSectorInput] = useState('مياه')
  const [savingEdit, setSavingEdit] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState(null)

  const reloadData = async () => {
    try {
      const [reportsData, projectsData] = await Promise.all([
        fetch('/api/reports').then(r => r.json()),
        fetch('/api/projects').then(r => r.json())
      ])
      setReports(reportsData || [])
      setProjects(projectsData || [])
    } catch (e) {
      console.error('Error reloading reports data:', e)
    }
  }

  const handleRefreshData = async () => {
    setRefreshing(true)
    setRefreshMessage(null)
    try {
      const res = await fetch('/api/refresh-data', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        await reloadData()
        setRefreshMessage('✅ تم تحديث البيانات والتقرير التنفيذي بنجاح')
        setTimeout(() => setRefreshMessage(null), 4500)
      } else {
        setRefreshMessage('⚠️ ' + (data.error || 'فشل التحديث'))
      }
    } catch (e) {
      console.error('Error in handleRefreshData:', e)
      setRefreshMessage('❌ خطأ في الاتصال بالسيرفر')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    reloadData().finally(() => setLoading(false))
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
    if (!confirm('هل تريد استبعاد هذا البلاغ من نطاق مشاريع مدير البرنامج؟')) return
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
        setReports(reports.map(r => r.id === reportId ? { 
          ...r, 
          excluded: true, 
          matched: false, 
          project: null, 
          excludedReason: 'مستبعد من نطاق مشاريع مدير البرنامج' 
        } : r))
        setShowDetails(false)
        alert('تم استبعاد البلاغ وتحديث التقرير فورياً')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const openEditModal = (report) => {
    setEditReport(report)
    const initialContractor = (report.contractorName && report.contractorName !== 'NULL')
      ? report.contractorName
      : (report.project?.contractor || '')
    setContractorInput(initialContractor)
    setManagerInput(report.project?.programManager || '')
    setProjectInput(report.project?.id || '')
    
    // Auto-detect sector: check report.sector or project
    const detectedSector = report.sector || 
      ((report.project?.name?.includes('صرف') || report.project?.subProgram?.includes('صرف')) ? 'صرف' : 'مياه')
    setSectorInput(detectedSector)
  }

  const handleSaveEdit = async () => {
    if (!editReport) return
    setSavingEdit(true)
    try {
      const payload = {
        reportId: editReport.id,
        licenseNumber: editReport.licenseNumber || '',
        customContractor: contractorInput.trim(),
        customProgramManager: managerInput.trim(),
        projectId: projectInput ? projectInput : undefined,
        customSector: sectorInput,
        reason: 'تعديل وتثبيت المقاول ومدير البرنامج والمشروع والقطاع'
      }

      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        const selectedProj = projectInput ? projects.find(p => String(p.id) === String(projectInput)) : editReport.project

        setReports(reports.map(r => {
          if (r.id === editReport.id) {
            return {
              ...r,
              contractorName: contractorInput.trim(),
              customContractor: contractorInput.trim(),
              isLocked: true,
              lockedContractor: true,
              sector: sectorInput,
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
            isLocked: true,
            lockedContractor: true,
            sector: sectorInput,
            project: selectedProj ? {
              ...selectedProj,
              programManager: managerInput.trim() || selectedProj.programManager
            } : selectedReport.project
          })
        }

        setEditReport(null)
        alert('تم حفظ وتثبيت التعديلات بنجاح وتحديث القطاع فورياً')
      }
    } catch (e) {
      console.error('Error saving edits:', e)
      alert('حدث خطأ أثناء الحفظ')
    } finally {
      setSavingEdit(false)
    }
  }

  const tabCounts = useMemo(() => {
    const pending = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تحت معالجة المقاول').length
    const inProgress = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة').length
    const processed = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تمت المعالجة').length
    const noKmz = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تحت معالجة المقاول' && !r.reason?.includes('spatial')).length
    const excluded = reports.filter(r => r.excluded).length
    return { pending, inProgress, processed, noKmz, excluded }
  }, [reports])

  const filtered = useMemo(() => {
    let list = []
    if (activeTab === 'pending') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تحت معالجة المقاول')
    } else if (activeTab === 'in-progress') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة')
    } else if (activeTab === 'processed') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تمت المعالجة')
    } else if (activeTab === 'no-kmz') {
      list = reports.filter(r => !r.excluded && r.matched && r.project && r.status === 'تحت معالجة المقاول' && !r.reason?.includes('spatial'))
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
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📑</span>
            <span>سجل بلاغات التعدي المعتمدة</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            عرض بيانات البلاغات في صف كامل مع تصنيف قطاع المياه والصرف وقوائم المقاولين ومدراء البرامج
          </p>
        </div>

        {/* Actions & Search */}
        <div className="flex flex-wrap items-center gap-3">
          {refreshMessage && (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 px-3 py-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 shadow-sm animate-pulse">
              {refreshMessage}
            </span>
          )}
          <button
            onClick={handleRefreshData}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="إعادة مطابقة البلاغات وتحديث التقرير التنفيذي مع حفظ التعديلات السابقة"
          >
            <span className={refreshing ? 'inline-block animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'جاري المعالجة والتحديث...' : 'تحديث البيانات والتقرير التنفيذي'}</span>
          </button>
          <a
            href="/api/export/pending-excel"
            download="تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            title="تحميل ملف الإكسيل التنفيذي الشامل المنسق وفق مدراء البرامج والمقاولين"
          >
            <span>📊</span>
            <span>تصدير Excel التنفيذي</span>
          </a>

          {/* Search */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="بحث برقم البلاغ، الحي، المقاول..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>
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
            <span>⏳ المعلقة (المقاول)</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'pending' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
              {tabCounts.pending}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('in-progress')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'in-progress'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🔄 تحت الإجراء</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === 'in-progress' ? 'bg-sky-800 text-white' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>
              {tabCounts.inProgress}
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
                        {r.excluded ? (
                          <span className="text-gray-400 text-[11px]">-</span>
                        ) : (
                          r.project?.programManager || '-'
                        )}
                      </td>

                      {/* المقاول مع زر التعديل في سطر واحد: للبلاغات المستبعدة يظهر مقاول المشروع الأصلي بالملف مع إمكانية التعديل */}
                      <td className="px-3 py-3">
                        {r.excluded ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-semibold ${(!r.contractorName || r.contractorName === 'NULL') ? 'text-gray-400 italic' : 'text-gray-900 dark:text-gray-100'}`}>
                              {r.contractorName && r.contractorName !== 'NULL' ? r.contractorName : 'غير محدد بالملف'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold whitespace-nowrap">
                              (مقاول المشروع الأصلي)
                            </span>
                            <button
                              onClick={() => openEditModal(r)}
                              title="تعديل مقاول المشروع الأصلي أو إسناده"
                              className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition text-xs"
                            >
                              ✏️
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`font-semibold ${effectiveContractor === 'غير محدد' ? 'text-gray-400 italic' : 'text-gray-900 dark:text-gray-100'}`}>
                              {effectiveContractor}
                            </span>
                            {(r.customContractor || r.isLocked || r.lockedContractor) && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800" title="تم تثبيت المقاول يدوياً لهذا البلاغ ومحمي عند رفع ملفات جديدة">
                                🔒 مثبت
                              </span>
                            )}
                            <button
                              onClick={() => openEditModal(r)}
                              title="تعديل المقاول ومدير البرنامج"
                              className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition"
                            >
                              ✏️
                            </button>
                          </div>
                        )}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">الحي والمدينة</label>
                  <p className="font-bold text-gray-800 dark:text-gray-200">{selectedReport.district || selectedReport.city}</p>
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
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {selectedReport.excluded ? 'مقاول المشروع الأصلي بالملف' : 'المقاول في البلاغ'}
                  </label>
                  <p className="font-bold text-gray-900 dark:text-white truncate" title={selectedReport.contractorName || 'غير مسجل'}>
                    {selectedReport.contractorName && selectedReport.contractorName !== 'NULL' ? selectedReport.contractorName : 'غير مسجل'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">وصف التعدي</label>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                  {selectedReport.description}
                </div>
              </div>

              {/* بطاقة تفاصيل المشروع والمقاول */}
              {selectedReport.excluded ? (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 space-y-2">
                  <div className="text-xs font-bold text-red-600 dark:text-red-400">حالة البلاغ: مستبعد من مشاريع البرامج الرأسمالية</div>
                  <div className="text-xs text-gray-700 dark:text-gray-300">
                    <strong>سبب الاستبعاد:</strong> {selectedReport.excludedReason || 'خارج نطاق المشاريع الجارية أو يتبع التشغيل والصيانة'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-red-200/60 dark:border-red-800/60 text-gray-600 dark:text-gray-400">
                    <div>
                      <strong>مقاول المشروع الأصلي بالملف:</strong> {selectedReport.contractorName && selectedReport.contractorName !== 'NULL' ? selectedReport.contractorName : 'غير مسجل'}
                    </div>
                    <div>
                      <strong>حالة الإسناد:</strong> <span className="text-red-600 font-bold">غير مرتبط بمشروع رأسمالي</span>
                    </div>
                  </div>
                </div>
              ) : selectedReport.project ? (
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
              ) : null}

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
              {/* 1. اسم المقاول مع إمكانية التعديل المباشر أو الاختيار من القائمة */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                    اسم المقاول (مقاول المشروع)
                  </label>
                  {editReport.excluded && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold">
                      مقاول المشروع الأصلي بالملف
                    </span>
                  )}
                </div>

                <div className="space-y-2 mb-2">
                  <input
                    type="text"
                    value={contractorInput}
                    onChange={e => setContractorInput(e.target.value)}
                    placeholder="اكتب اسم المقاول أو عدّله مباشرة هنا..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                  />
                  <select
                    value={contractorInput}
                    onChange={e => setContractorInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">— أو اختر من قائمة مقاولي المشاريع بالإكسيل —</option>
                    {editReport.contractorName && editReport.contractorName !== 'NULL' && (
                      <option value={editReport.contractorName}>
                        ⭐ مقاول المشروع الأصلي بالملف: {editReport.contractorName}
                      </option>
                    )}
                    {editReport.project?.contractor && editReport.project.contractor !== editReport.contractorName && (
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
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setContractorInput('')}
                    className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 transition"
                  >
                    تفريغ المقاول
                  </button>
                  {editReport.contractorName && editReport.contractorName !== 'NULL' && (
                    <button
                      type="button"
                      onClick={() => setContractorInput(editReport.contractorName)}
                      className="px-2.5 py-1 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-100 border border-amber-200 dark:border-amber-800 font-semibold transition"
                    >
                      مقاول المشروع الأصلي بالملف
                    </button>
                  )}
                  {editReport.project?.contractor && editReport.project.contractor !== editReport.contractorName && (
                    <button
                      type="button"
                      onClick={() => setContractorInput(editReport.project.contractor)}
                      className="px-2.5 py-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 transition"
                    >
                      مقاول المشروع المسند
                    </button>
                  )}
                </div>
              </div>

              {/* 1. اختيار مدير البرنامج */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  مدير البرنامج المسند له البلاغ
                </label>
                <select
                  value={managerInput}
                  onChange={e => {
                    const newMgr = e.target.value
                    setManagerInput(newMgr)
                    // Auto-select first project of this manager if current project doesn't belong to him
                    const mgrProjects = projects.filter(p => p.programManager === newMgr)
                    if (mgrProjects.length > 0) {
                      const firstP = mgrProjects[0]
                      setProjectInput(firstP.id)
                      if (firstP.contractor && firstP.contractor !== '-') setContractorInput(firstP.contractor)
                      const sec = (firstP.name?.includes('صرف') || firstP.subProgram?.includes('صرف')) ? 'صرف' : 'مياه'
                      setSectorInput(sec)
                    } else {
                      setProjectInput('')
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold"
                >
                  <option value="">— اختر مدير البرنامج —</option>
                  {programManagers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* 2. اختيار المشروع التابع لمدير البرنامج مع كشف وتحديث القطاع تلقائياً */}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  المشروع التابع لمدير البرنامج {managerInput ? `(${managerInput})` : ''}
                </label>
                <select
                  value={projectInput}
                  onChange={e => {
                    const pId = e.target.value
                    setProjectInput(pId)
                    const p = projects.find(x => String(x.id) === String(pId))
                    if (p) {
                      if (p.contractor && p.contractor !== '-') setContractorInput(p.contractor)
                      if (p.programManager && p.programManager !== '-') setManagerInput(p.programManager)
                      const isSewer = (p.name?.includes('صرف') || p.subProgram?.includes('صرف'))
                      setSectorInput(isSewer ? 'صرف' : 'مياه')
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="">— اختر المشروع المسند —</option>
                  {projects
                    .filter(p => !managerInput || p.programManager === managerInput)
                    .map(p => {
                      const sec = (p.name?.includes('صرف') || p.subProgram?.includes('صرف')) ? 'صرف' : 'مياه'
                      return (
                        <option key={p.id} value={p.id}>
                          {sec === 'مياه' ? '💧 مياه' : '🚰 صرف'} | {p.name} ({p.scope}) - المقاول: {p.contractor}
                        </option>
                      )
                    })}
                </select>
              </div>

              {/* 3. بطاقة تحديث القطاع تلقائياً (مياه أو صرف) مع إمكانية التبديل الفوري */}
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
                  ⚡ يتم تحديد القطاع تلقائياً حسب المشروع المختار لمدير البرنامج، ويمكنك التبديل بينهما مباشرة.
                </span>
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
