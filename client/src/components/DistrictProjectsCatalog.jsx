import { useState, useEffect, useMemo } from 'react'

export default function DistrictProjectsCatalog() {
  const [classification, setClassification] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'riyadh' | 'governorate'
  const [selectedManager, setSelectedManager] = useState('all')
  const [expandedDistrict, setExpandedDistrict] = useState(null)

  useEffect(() => {
    fetch('/api/projects/by-district')
      .then(res => res.json())
      .then(data => {
        setClassification(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching districts classification:', err)
        setLoading(false)
      })
  }, [])

  // قائمة المدراء الفريدين
  const allManagers = useMemo(() => {
    const mgrs = new Set()
    classification.forEach(d => {
      d.programManagers.forEach(m => mgrs.add(m))
    })
    return Array.from(mgrs).sort()
  }, [classification])

  // التصفية
  const filteredData = useMemo(() => {
    return classification.filter(d => {
      // فلتر النوع
      if (typeFilter === 'riyadh' && !d.type.includes('الرياض')) return false
      if (typeFilter === 'governorate' && !d.type.includes('محافظة')) return false

      // فلتر المدير
      if (selectedManager !== 'all' && !d.programManagers.includes(selectedManager)) return false

      // فلتر البحث النصي
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
  }, [classification, typeFilter, selectedManager, searchQuery])

  // إحصائيات سريعة
  const stats = useMemo(() => {
    const totalDistricts = classification.length
    const riyadhDistricts = classification.filter(d => d.type.includes('الرياض')).length
    const govDistricts = classification.filter(d => d.type.includes('محافظة')).length
    const totalProjects = classification.reduce((acc, d) => acc + d.projectsCount, 0)
    return { totalDistricts, riyadhDistricts, govDistricts, totalProjects }
  }, [classification])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600 dark:text-gray-300 font-bold text-sm">جاري تحميل دليل تصنيف مشاريع الأحياء...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* بطاقة التنبيه الإرشادية للحوكمة والتدقيق */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 p-5 rounded-2xl shadow-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">⚖️</span>
          <div className="space-y-1">
            <h3 className="font-black text-sm">قاعدة الحوكمة المعتمدة لمقاولي الصيانة المشتركين بالمشاريع</h3>
            <p className="text-xs leading-relaxed">
              المقاولون الذين ينفذون مشاريع رأسمالية ولديهم عقود صيانة أخرى (مثل <strong className="underline">شركة الأعمال المدنية المحدودة</strong>):
              إذا ورد بلاغ يقع داخل الحي المعتمد للمشروع (مثل <strong>حي العوالي</strong> لمشروع م. أمجد الفالح رقم #57) يُسند تلقائياً لمدير البرنامج ويُحسب ضمن مشاريع الإدارة.
              أما إذا كان البلاغ في أي حي آخر، فيُصنف ويُستبعد فوراً بصفته <strong className="bg-amber-200 dark:bg-amber-800 px-1.5 py-0.5 rounded">تابع لإدارة التشغيل والصيانة</strong> ولا يُسند لأي مدير برنامج حتى لا تتأثر مؤشرات الأداء.
            </p>
          </div>
        </div>
      </div>

      {/* لوحة المؤشرات السريعة */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">إجمالي الأحياء والمحافظات</p>
          <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">{stats.totalDistricts}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">أحياء مدينة الرياض المعتمدة</p>
          <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{stats.riyadhDistricts}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">المحافظات والمراكز التابعة</p>
          <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{stats.govDistricts}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 text-center shadow-sm">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-bold">المشاريع المربوطة بالأحياء</p>
          <p className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">{stats.totalProjects}</p>
        </div>
      </div>

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
          <span>عدد الأحياء المطابقة للبحث: <strong className="text-blue-600 dark:text-blue-400 font-bold">{filteredData.length}</strong></span>
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

      {/* قائمة بطاقات تصنيف الأحياء */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredData.map(item => {
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

      {filteredData.length === 0 && (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800">
          <span className="text-4xl block mb-2">🔍</span>
          <p className="text-gray-700 dark:text-gray-300 font-black text-base">لا توجد أحياء تطابق معايير البحث</p>
          <p className="text-gray-400 text-xs mt-1">تأكد من كتابة اسم الحي بشكل صحيح أو اختر نطاقاً آخر</p>
        </div>
      )}
    </div>
  )
}
