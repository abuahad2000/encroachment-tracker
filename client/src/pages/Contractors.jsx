import { useEffect, useState, useMemo } from 'react'

export default function Contractors() {
  const [contractors, setContractors] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContractor, setSelectedContractor] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'with_active' | 'custom' | 'aswad'

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    programManagers: [],
    sectors: ['مياه'],
    districts: '',
    isAswadException: false,
    aliases: ''
  })
  const [saving, setSaving] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [cRes, pRes] = await Promise.all([
        fetch('/api/contractors').then(r => r.json()),
        fetch('/api/projects').then(r => r.json())
      ])
      setContractors(cRes.contractors || [])
      setProjects(pRes || [])
    } catch (e) {
      console.error('Error fetching contractors:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // All unique program managers from projects
  const allManagers = useMemo(() => {
    const set = new Set()
    projects.forEach(p => {
      if (p.programManager && p.programManager !== '-' && p.programManager !== 'غير محدد') {
        set.add(p.programManager.trim())
      }
    })
    return Array.from(set).sort()
  }, [projects])

  const filteredContractors = useMemo(() => {
    return contractors.filter(c => {
      // Filter by type
      if (filterType === 'with_active' && (!c.activeReportsCount || c.activeReportsCount === 0)) return false
      if (filterType === 'custom' && c.source !== 'custom_added') return false
      if (filterType === 'aswad' && !c.isAswadException) return false

      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()
      return (
        c.name.toLowerCase().includes(q) ||
        (c.programManagers || []).some(m => m.toLowerCase().includes(q)) ||
        (c.districts || []).some(d => d.toLowerCase().includes(q))
      )
    })
  }, [contractors, filterType, searchQuery])

  const handleOpenAdd = () => {
    setFormData({
      name: '',
      programManagers: [],
      sectors: ['مياه'],
      districts: '',
      isAswadException: false,
      aliases: ''
    })
    setShowAddModal(true)
  }

  const handleOpenEdit = (contractor) => {
    setSelectedContractor(contractor)
    setFormData({
      name: contractor.name,
      programManagers: contractor.programManagers || [],
      sectors: contractor.sectors && contractor.sectors.length > 0 ? contractor.sectors : ['مياه'],
      districts: (contractor.districts || []).join('، '),
      isAswadException: !!contractor.isAswadException,
      aliases: (contractor.aliases || []).join('، ')
    })
    setShowEditModal(true)
  }

  const handleSave = async (isNew = false) => {
    if (!formData.name.trim()) {
      alert('يرجى إدخال اسم المقاول')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: formData.name.trim(),
        programManagers: formData.programManagers,
        sectors: formData.sectors,
        districts: formData.districts.split(/[،,]/).map(s => s.trim()).filter(Boolean),
        isAswadException: formData.isAswadException,
        aliases: formData.aliases.split(/[،,]/).map(s => s.trim()).filter(Boolean)
      }

      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        setShowAddModal(false)
        setShowEditModal(false)
        alert('تم حفظ المقاول بنجاح وإعادة تحليل البلاغات وتحديث الإسناد فورياً')
        fetchData()
      } else {
        const d = await res.json()
        alert(`خطأ: ${d.error || 'فشل في حفظ المقاول'}`)
      }
    } catch (e) {
      console.error('Error saving contractor:', e)
      alert('حدث خطأ أثناء الاتصال بالخادم')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name) => {
    if (!confirm(`هل أنت متأكد من حذف المقاول المضاف "${name}"؟`)) return
    try {
      const res = await fetch(`/api/contractors/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        alert('تم حذف المقاول وإعادة تحليل البلاغات')
        fetchData()
      }
    } catch (e) {
      console.error('Error deleting:', e)
    }
  }

  const toggleSector = (sector) => {
    if (formData.sectors.includes(sector)) {
      if (formData.sectors.length > 1) {
        setFormData({ ...formData, sectors: formData.sectors.filter(s => s !== sector) })
      }
    } else {
      setFormData({ ...formData, sectors: [...formData.sectors, sector] })
    }
  }

  const toggleManager = (mgr) => {
    if (formData.programManagers.includes(mgr)) {
      setFormData({ ...formData, programManagers: formData.programManagers.filter(m => m !== mgr) })
    } else {
      setFormData({ ...formData, programManagers: [...formData.programManagers, mgr] })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-l from-blue-50 via-white to-blue-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 p-6 rounded-2xl border border-blue-100 dark:border-gray-700 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 mb-2">
            <span>🏗️</span>
            <span>حوكمة مقاولي التعديات والمشاريع</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white">
            قاعدة بيانات وإدارة المقاولين
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            إدارة المقاولين المعتمدين وتعيين قواعد المطابقة الآلية (المحافظات، الأحياء، استثناءات التغطية الشاملة)، مع إمكانية التعديل الفوري عند الخطأ وتحديث نتائج تحليل ملف الإكسيل تلقائياً.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-sm whitespace-nowrap"
          >
            <span>➕</span>
            <span>إضافة مقاول جديد</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">إجمالي المقاولين</span>
          <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block">{contractors.length}</span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">من ملفات الإكسيل وقواعد النظام</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-amber-600 dark:text-amber-400 block font-medium">مقاولين لديهم بلاغات نشطة</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">
            {contractors.filter(c => c.activeReportsCount > 0).length}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">معلقة بانتظار المعالجة</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 block font-medium">إجمالي البلاغات المسندة لهم</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {contractors.reduce((acc, c) => acc + (c.reportsCount || 0), 0)}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">تمت مطابقتها برمجياً</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-blue-600 dark:text-blue-400 block font-medium">مقاولين معدلين يدوياً</span>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">
            {contractors.filter(c => c.source === 'custom_added' || c.isAswadException).length}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">مع قواعد استثناء وتصحيح</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            الكل ({contractors.length})
          </button>
          <button
            onClick={() => setFilterType('with_active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'with_active'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            لديهم بلاغات معلقة ({contractors.filter(c => c.activeReportsCount > 0).length})
          </button>
          <button
            onClick={() => setFilterType('aswad')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'aswad'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            استثناء م. عبدالله الأسود (شامل الرياض)
          </button>
          <button
            onClick={() => setFilterType('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              filterType === 'custom'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            المضافين والمعدلين يدوياً
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="🔍 ابحث عن اسم المقاول، مدير البرنامج، أو الحي..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Contractors Table */}
      <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-xs text-gray-500">جاري تحميل قائمة وتحليل المقاولين...</p>
          </div>
        ) : filteredContractors.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            لا توجد نتائج مطابقة لبحثك
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/60 font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">اسم المقاول</th>
                  <th className="px-4 py-3 whitespace-nowrap">القطاع</th>
                  <th className="px-4 py-3 whitespace-nowrap">مدراء البرامج المرتبطين</th>
                  <th className="px-4 py-3 whitespace-nowrap">عدد المشاريع</th>
                  <th className="px-4 py-3 whitespace-nowrap">البلاغات المعلقة</th>
                  <th className="px-4 py-3 whitespace-nowrap">تمت المعالجة</th>
                  <th className="px-4 py-3 whitespace-nowrap">قاعدة المطابقة</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredContractors.map((c, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{c.name}</span>
                          {c.source === 'custom_added' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                              مضاف يدوياً
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex gap-1">
                          {c.sectors.map(sec => (
                            <span
                              key={sec}
                              className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                sec === 'مياه'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                              }`}
                            >
                              {sec === 'مياه' ? '💧 مياه' : '🚰 صرف'}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 max-w-xs truncate">
                        {c.programManagers && c.programManagers.length > 0 ? (
                          <span className="text-gray-700 dark:text-gray-300" title={c.programManagers.join('، ')}>
                            {c.programManagers.join('، ')}
                          </span>
                        ) : (
                          <span className="text-gray-400">غير محدد</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {c.projectsCount || 0} مشروع
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          c.activeReportsCount > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {c.activeReportsCount || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          {c.processedReportsCount || 0}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {c.isAswadException ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            ⭐ استثناء شامل (م. عبدالله الأسود)
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-500 dark:text-gray-400">
                            تطابق صارم مع الحي والمشروع
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition"
                          >
                            ✏️ تعديل
                          </button>
                          {c.source === 'custom_added' && (
                            <button
                              onClick={() => handleDelete(c.name)}
                              className="px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition"
                            >
                              🗑️ حذف
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
        )}
      </div>

      {/* Modal إضافة أو تعديل مقاول */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {showAddModal ? 'إضافة مقاول جديد إلى قاعدة المطابقة' : `تعديل بيانات المقاول: ${formData.name}`}
              </h3>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  اسم المقاول المعتمد <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: شركة سيسرا للمقاولات..."
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  أسماء بديلة أو مختصرة للمقاول (Aliases)
                </label>
                <input
                  type="text"
                  placeholder="افصل بين الأسماء بفاصلة، مثال: سيسرا، مؤسسة سيسرا"
                  value={formData.aliases}
                  onChange={e => setFormData({ ...formData, aliases: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  تساعد خوارزمية المطابقة في التعرف على المقاول عند ورود اسمه بصيغ مختلفة في تقرير البلاغات.
                </span>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  القطاع المسند له
                </label>
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => toggleSector('مياه')}
                    className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                      formData.sectors.includes('مياه')
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300'
                    }`}
                  >
                    💧 مشاريع المياه
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSector('صرف')}
                    className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                      formData.sectors.includes('صرف')
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300'
                    }`}
                  >
                    🚰 مشاريع الصرف الصحي
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  مدراء البرامج المرتبطين
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  {allManagers.map(mgr => (
                    <label key={mgr} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.programManagers.includes(mgr)}
                        onChange={() => toggleManager(mgr)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-800 dark:text-gray-200">{mgr}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  الأحياء أو المحافظات التابعة له
                </label>
                <input
                  type="text"
                  placeholder="مثال: حي النرجس، حي العارض، محافظة شقراء"
                  value={formData.districts}
                  onChange={e => setFormData({ ...formData, districts: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800">
                <label className="flex items-center gap-2 font-bold text-purple-900 dark:text-purple-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isAswadException}
                    onChange={e => setFormData({ ...formData, isAswadException: e.target.checked })}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span>تطبيق استثناء م. عبدالله الأسود (تغطية كامل مدينة الرياض)</span>
                </label>
                <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-1 mr-6">
                  عند التفعيل، يُسمح بإسناد بلاغات مدينة الرياض لهذا المقاول في مشاريع المتفرقات دون اشتراط تطابق اسم الحي الحرفي.
                </p>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(showAddModal)}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50"
                >
                  {saving ? 'جاري الحفظ وإعادة التحليل...' : 'حفظ وتحديث التحليل فورياً'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
