import { useState, useEffect, useMemo } from 'react'

export default function DistrictProjectsCatalog() {
  const [classification, setClassification] = useState([])
  const [maintenanceDistricts, setMaintenanceDistricts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'riyadh' | 'governorate' | 'maintenance'
  const [selectedManager, setSelectedManager] = useState('all')
  const [activeTab, setActiveTab] = useState('projects') // 'projects' | 'maintenance'
  const [expandedDistrict, setExpandedDistrict] = useState(null)

  // حالة إضافة حي صيانة جديد
  const [newDistrictName, setNewDistrictName] = useState('')
  const [newDistrictNotes, setNewDistrictNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionAlert, setActionAlert] = useState(null) // { type: 'success' | 'error', text: '' }

  const fetchData = async () => {
    try {
      setLoading(true)
      const [classRes, maintRes] = await Promise.all([
        fetch('/api/projects/by-district'),
        fetch('/api/districts/maintenance')
      ])
      const classData = await classRes.json()
      const maintData = await maintRes.json()

      setClassification(Array.isArray(classData) ? classData : [])
      setMaintenanceDistricts(Array.isArray(maintData) ? maintData : [])
    } catch (err) {
      console.error('Error fetching districts:', err)
      setActionAlert({ type: 'error', text: 'فشل في تحميل بيانات الأحياء' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // إضافة حي صيانة جديد
  const handleAddMaintenanceDistrict = async (e) => {
    e.preventDefault()
    if (!newDistrictName.trim()) {
      setActionAlert({ type: 'error', text: 'يرجى كتابة اسم الحي أولاً' })
      return
    }

    try {
      setIsSubmitting(true)
      setActionAlert(null)
      const res = await fetch('/api/districts/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: newDistrictName.trim(),
          notes: newDistrictNotes.trim() || 'حي صيانة (مستبعد مباشرة من المشاريع)',
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
      setNewDistrictName('')
      setNewDistrictNotes('')
      // إعادة تحميل البيانات
      await fetchData()
    } catch (err) {
      setActionAlert({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setIsSubmitting(false)
    }
  }

  // حذف حي من تصنيف الصيانة
  const handleDeleteMaintenanceDistrict = async (districtName) => {
    if (!window.confirm(`هل أنت متأكد من حذف حي "${districtName}" من تصنيف الصيانة؟ سيتم إعادة مطابقة البلاغات وفق قواعد المشاريع.`)) {
      return
    }

    try {
      setIsSubmitting(true)
      setActionAlert(null)
      const res = await fetch(`/api/districts/maintenance/${encodeURIComponent(districtName)}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'فشل في حذف الحي')
      }

      setActionAlert({
        type: 'success',
        text: `✅ ${data.message}`
      })
      await fetchData()
    } catch (err) {
      setActionAlert({ type: 'error', text: `❌ ${err.message}` })
    } finally {
      setIsSubmitting(false)
    }
  }

  // أحياء المشاريع فقط
  const projectDistricts = useMemo(() => {
    return classification.filter(d => !d.isMaintenance)
  }, [classification])

  // قائمة المدراء الفريدين
  const allManagers = useMemo(() => {
    const mgrs = new Set()
    projectDistricts.forEach(d => {
      d.programManagers.forEach(m => mgrs.add(m))
    })
    return Array.from(mgrs).sort()
  }, [projectDistricts])

  // التصفية للمشاريع
  const filteredProjectData = useMemo(() => {
    return projectDistricts.filter(d => {
      if (typeFilter === 'riyadh' && !d.type.includes('الرياض')) return false
      if (typeFilter === 'governorate' && !d.type.includes('محافظة')) return false
      if (typeFilter === 'maintenance') return false

      if (selectedManager !== 'all' && !d.programManagers.includes(selectedManager)) return false

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const text = [
          d.district,
          d.type,
          ...d.programManagers,
          ...d.contractors,
          ...d.projects.map(p => p.name + ' ' + p.operationNumber)
        ].join(' ').toLowerCase()
        if (!text.includes(q)) return false
      }

      return true
    })
  }, [projectDistricts, typeFilter, selectedManager, searchQuery])

  // التصفية لأحياء الصيانة
  const filteredMaintenanceData = useMemo(() => {
    return maintenanceDistricts.filter(d => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const text = [d.district, d.notes, d.city].join(' ').toLowerCase()
        return text.includes(q)
      }
      return true
    })
  }, [maintenanceDistricts, searchQuery])

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const totalDistricts = projectDistricts.length
    const riyadhDistricts = projectDistricts.filter(d => d.type.includes('الرياض')).length
    const govDistricts = projectDistricts.filter(d => d.type.includes('محافظة')).length
    const totalProjects = projectDistricts.reduce((acc, d) => acc + d.projectsCount, 0)
    const maintenanceCount = maintenanceDistricts.length
    return { totalDistricts, riyadhDistricts, govDistricts, totalProjects, maintenanceCount }
  }, [projectDistricts, maintenanceDistricts])

  if (loading && classification.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300 font-bold text-sm">جاري تحميل دليل تصنيف الأحياء والمشاريع...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* إشعار الرسائل والتنبيهات */}
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

      {/* بطاقة التنبيه الإرشادية للحوكمة والتدقيق */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-2 border-amber-300 dark:border-amber-700/60 p-5 rounded-2xl shadow-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">⚖️</span>
          <div className="space-y-1">
            <h3 className="font-black text-sm">قاعدة الحوكمة المعتمدة لمقاولي وتصنيفات الصيانة والمشاريع</h3>
            <p className="text-xs leading-relaxed">
              <strong>1. أحياء المشاريع الرأسمالية:</strong> الأحياء المدرجة ضمن نطاق مشاريع إدارة المشاريع يُسند بلاغها تلقائياً لمدير البرنامج والمقاول المعتمد.
              <br />
              <strong>2. تصنيف الصيانة المستقل (استبعاد مباشر دون ربط بمشروع):</strong> الأحياء المضافة في تصنيف <strong className="underline decoration-amber-500 font-black">الصيانة</strong> تُستبعد كافة بلاغاتها مباشرة من نطاق مشاريع الإدارة وتُصنف فوراً كـ <span className="bg-amber-200 dark:bg-amber-800 px-1.5 py-0.2 rounded font-black">تشغيل وصيانة</span> ولا تتطلب ربطاً بأي مشروع رأسمالي أو مدير برنامج.
            </p>
          </div>
        </div>
      </div>

      {/* لوحة المؤشرات السريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">أحياء مشاريع الإدارة</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.totalDistricts}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">المشاريع المربوطة بالأحياء</p>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.totalProjects}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">أحياء الرياض والمحافظات</p>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.riyadhDistricts + stats.govDistricts}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/60 dark:to-orange-950/60 p-4 rounded-2xl border-2 border-amber-300 dark:border-amber-700 text-center shadow-sm">
          <p className="text-xs text-amber-900 dark:text-amber-300 font-black">🔧 أحياء الصيانة (مستبعدة مباشرة)</p>
          <p className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{stats.maintenanceCount}</p>
        </div>
      </div>

      {/* تبويبات الانتقال بين أحياء المشاريع وأحياء الصيانة */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => { setActiveTab('projects'); setTypeFilter('all') }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition ${
            activeTab === 'projects'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <span>🏢 أحياء مشاريع الإدارة المعتمدة</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
            {stats.totalDistricts}
          </span>
        </button>

        <button
          onClick={() => { setActiveTab('maintenance'); setTypeFilter('maintenance') }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition ${
            activeTab === 'maintenance'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <span>🔧 تصنيف أحياء الصيانة (استبعاد مباشر)</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px]">
            {stats.maintenanceCount}
          </span>
        </button>
      </div>

      {/* محتوى تبويب تصنيف الصيانة المستقل */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          {/* نموذج إضافة حي صيانة جديد */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border-2 border-amber-200 dark:border-amber-800/60 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-2">
                  <span>➕ إضافة حي إلى تصنيف الصيانة (استبعاد مباشر دون ربط بمشروع)</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  أدخل اسم الحي لاستبعاده فوراً من نطاق مشاريع إدارة المشاريع. عند ورود أي بلاغ في هذا الحي لن يتم ربطه بأي مشروع وسيُصنف تلقائياً كتشغيل وصيانة.
                </p>
              </div>
              <span className="text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-1 rounded-xl">
                لا يحتاج ربط بمشروع
              </span>
            </div>

            <form onSubmit={handleAddMaintenanceDistrict} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-5 space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  📍 اسم الحي المراد استبعاده للصيانة <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDistrictName}
                  onChange={(e) => setNewDistrictName(e.target.value)}
                  placeholder="مثال: الرمال، أو حي الشفا، أو حي الدار البيضاء"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="md:col-span-5 space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  📝 ملاحظات أو سبب الاستبعاد (اختياري)
                </label>
                <input
                  type="text"
                  value={newDistrictNotes}
                  onChange={(e) => setNewDistrictNotes(e.target.value)}
                  placeholder="مثال: حي تابع لعقود الصيانة الدورية ولا توجد به مشاريع رأسمالية"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-[42px] bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <>
                      <span>حفظ كحي صيانة</span>
                      <span>💾</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* شريط البحث في أحياء الصيانة */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 بحث في أحياء الصيانة المستبعدة..."
                className="w-full text-xs font-bold px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none dark:text-white"
              />
            </div>
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 whitespace-nowrap">
              إجمالي أحياء الصيانة: <strong className="text-amber-600 dark:text-amber-400">{filteredMaintenanceData.length}</strong>
            </span>
          </div>

          {/* قائمة كروت أحياء الصيانة */}
          {filteredMaintenanceData.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaintenanceData.map(item => (
                <div
                  key={item.id || item.district}
                  className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-200 dark:border-amber-900/50 p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg">🔧</span>
                          <h4 className="font-black text-base text-gray-900 dark:text-white">حي {item.district}</h4>
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-md mt-1 inline-block">
                          تشغيل وصيانة (مستبعد مباشرة)
                        </span>
                      </div>
                      <span className="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 font-bold px-2 py-0.5 rounded">
                        {item.city || 'الرياض'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-gray-400 block">الملاحظات وحالة الاستبعاد:</span>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed bg-amber-50/50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-amber-100 dark:border-slate-800">
                        {item.notes || 'حي صيانة (مستبعد مباشرة من المشاريع الرأسمالية)'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                      <span>الارتباط بالمشاريع: <strong className="text-emerald-600 dark:text-emerald-400">لا يتطلب ربط</strong></span>
                      {item.createdAt && (
                        <span>تاريخ الإضافة: {new Date(item.createdAt).toLocaleDateString('ar-SA')}</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-slate-800 mt-4 flex justify-end">
                    <button
                      onClick={() => handleDeleteMaintenanceDistrict(item.district)}
                      disabled={isSubmitting}
                      className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    >
                      <span>🗑️ إلغاء من الصيانة</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 space-y-2">
              <span className="text-4xl block">🔧</span>
              <p className="text-gray-800 dark:text-gray-200 font-black text-sm">لا توجد أحياء مضافة في تصنيف الصيانة حالياً</p>
              <p className="text-gray-400 text-xs">يمكنك إضافة أي حي من النموذج أعلاه لاستبعاده مباشرة دون ربطه بأي مشروع</p>
            </div>
          )}
        </div>
      )}

      {/* محتوى تبويب أحياء مشاريع الإدارة المعتمدة */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          {/* أدوات البحث والتصفية */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* البحث بالاسم */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">🔍 بحث بالحي أو المقاول أو المشروع</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="اكتب اسم الحي (مثل: العوالي، بدر، النرجس...)"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                />
              </div>

              {/* نوع النطاق */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">📍 نوع النطاق الجغرافي</label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                >
                  <option value="all">كافة النطاقات (أحياء الرياض والمحافظات)</option>
                  <option value="riyadh">أحياء مدينة الرياض فقط ({stats.riyadhDistricts})</option>
                  <option value="governorate">المحافظات والمراكز فقط ({stats.govDistricts})</option>
                </select>
              </div>

              {/* تصفية بمدير البرنامج */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">👤 مدير البرنامج المشرف</label>
                <select
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                >
                  <option value="all">جميع مدراء البرامج ({allManagers.length})</option>
                  {allManagers.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-slate-800">
              <span>عدد الأحياء المطابقة للبحث: <strong className="text-blue-600 dark:text-blue-400 font-bold">{filteredProjectData.length}</strong></span>
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setTypeFilter('all'); setSelectedManager('all') }}
                  className="text-red-500 hover:underline font-bold"
                >
                  إلغاء التصفية ✖
                </button>
              )}
            </div>
          </div>

          {/* قائمة بطاقات تصنيف أحياء المشاريع */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjectData.map(item => {
              const isExpanded = expandedDistrict === item.district
              const isRiyadh = item.type.includes('الرياض')

              return (
                <div
                  key={item.district}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm hover:shadow-md transition flex flex-col justify-between overflow-hidden"
                >
                  <div className="p-5 space-y-3">
                    {/* رأس البطاقة */}
                    <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{isRiyadh ? '🏡' : '🏛️'}</span>
                        <div>
                          <h4 className="font-black text-base text-gray-900 dark:text-white">حي {item.district}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isRiyadh 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}>
                            {item.type}
                          </span>
                        </div>
                      </div>

                      <span className="bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 text-xs font-black px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800">
                        {item.projectsCount} {item.projectsCount === 1 ? 'مشروع' : 'مشاريع'}
                      </span>
                    </div>

                    {/* مدراء البرامج */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-gray-400 block">مدير البرنامج المسؤول:</span>
                      <div className="flex flex-wrap gap-1">
                        {item.programManagers.map(pm => (
                          <span key={pm} className="text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1 rounded-lg">
                            👤 م. {pm}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* المقاولون المعتمدون للمشاريع */}
                    <div className="space-y-1">
                      <span className="text-[11px] font-bold text-gray-400 block">المقاولون المعتمدون للمشاريع:</span>
                      <div className="flex flex-wrap gap-1">
                        {item.contractors.map(c => {
                          const isCivil = c.includes('المدنية') || c.includes('المدنيه')
                          return (
                            <span 
                              key={c} 
                              className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                                isCivil
                                  ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700'
                                  : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700'
                              }`}
                            >
                              🏗️ {c}
                            </span>
                          )
                        })}
                      </div>
                    </div>

                    {/* القطاعات */}
                    <div className="flex items-center gap-2 pt-1 text-[11px] font-bold text-gray-500 dark:text-gray-400">
                      <span>القطاع:</span>
                      {item.sectors.map(s => (
                        <span key={s} className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 px-2 py-0.5 rounded">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* قائمة المشاريع التابعة للحي (قابلة للطي) */}
                  <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 p-3">
                    <button
                      onClick={() => setExpandedDistrict(isExpanded ? null : item.district)}
                      className="w-full flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <span>{isExpanded ? 'إخفاء تفاصيل المشاريع ▲' : 'عرض تفاصيل المشاريع التابعة ▼'}</span>
                      <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">
                        #{item.projects.map(p => p.id).join(', #')}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                        {item.projects.map(p => (
                          <div key={p.id} className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-black text-gray-800 dark:text-white">مشروع #{p.id}</span>
                              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 rounded font-bold">
                                {p.status}
                              </span>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 font-bold">{p.name}</p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400 pt-1">
                              <span>العملية: <code className="bg-gray-100 dark:bg-slate-700 px-1 rounded">{p.operationNumber || '-'}</code></span>
                              <span>المقاول: {p.contractor}</span>
                              <span>مدير المشروع: {p.projectManager || '-'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {filteredProjectData.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800">
              <span className="text-4xl block mb-2">🔍</span>
              <p className="text-gray-700 dark:text-gray-300 font-black text-base">لا توجد أحياء تطابق معايير البحث</p>
              <p className="text-gray-400 text-xs mt-1">تأكد من كتابة اسم الحي بشكل صحيح أو اختر نطاقاً آخر</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
