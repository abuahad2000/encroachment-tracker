import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FileUpload from '../components/FileUpload'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState(null)
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        setStats(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error loading stats:', e)
        setLoading(false)
      })
  }, [refreshKey])

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1)
    setShowUpload(false)
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      setRefreshMessage(null)
      const res = await fetch('/api/refresh-data', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setRefreshMessage('✅ تم تحديث البيانات ومعالجة التقرير التنفيذي بنجاح')
        setRefreshKey(prev => prev + 1)
      } else {
        setRefreshMessage('⚠️ ' + (data.error || 'فشل التحديث'))
      }
    } catch (e) {
      console.error('Error refreshing:', e)
      setRefreshMessage('❌ خطأ أثناء تحديث البيانات')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-28 space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 animate-spin"></div>
          <span className="absolute inset-0 flex items-center justify-center text-xl">💧</span>
        </div>
        <div className="text-gray-600 dark:text-gray-300 font-bold text-lg animate-pulse">
          جاري تحميل منصة التعديات ومؤشرات الأداء...
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-8 bg-red-50 dark:bg-red-950/40 rounded-3xl border border-red-200 dark:border-red-800 text-center max-w-xl mx-auto my-12">
        <span className="text-4xl block mb-2">⚠️</span>
        <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">تعذر قراءة مؤشرات النظام</h3>
        <p className="text-sm text-red-600 dark:text-red-400 mb-4">يرجى التأكد من تشغيل الخادم وتوليد البيانات الأولية.</p>
        <button
          onClick={() => setRefreshKey(prev => prev + 1)}
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow transition"
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }

  // Calculated Metrics
  const pendingCount = stats.pendingCount ?? stats.totalActive ?? 0
  const inProgressCount = stats.inProgressCount ?? 0
  const processedCount = stats.processedCount ?? 0
  const excludedCount = stats.excludedCount ?? 0
  const totalAssigned = stats.assignedCount ?? (pendingCount + inProgressCount + processedCount)
  const resolutionRate = totalAssigned > 0 ? Math.round((processedCount / totalAssigned) * 100) : 0
  const pendingRate = totalAssigned > 0 ? Math.round((pendingCount / totalAssigned) * 100) : 0
  const inProgressRate = totalAssigned > 0 ? Math.round((inProgressCount / totalAssigned) * 100) : 0

  const lastUpdateFormatted = stats.lastUpdate
    ? new Date(stats.lastUpdate).toLocaleString('ar-SA', {
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    : 'غير متوفر'

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Executive Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-slate-900 via-blue-950 to-indigo-950 text-white p-6 sm:p-8 shadow-2xl border border-blue-900/50">
        {/* Subtle Decorative Ambient Background Glows */}
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 left-10 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>شركة المياه الوطنية (NWC) • الإدارة العامة لبرامج ومشاريع الرياض والمحافظات</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              المنصة الذكية لحوكمة وتتبع تعديات البنية التحتية
            </h1>
            <p className="text-blue-200/90 text-sm sm:text-base max-w-2xl leading-relaxed">
              المعالجة المكانية الدقيقة وتوجيه البلاغات تلقائياً لمدراء البرامج والمقاولين المعتمدين لمشاريع المياه والصرف الصحي.
            </p>
          </div>

          {/* Quick Hero Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg backdrop-blur border border-blue-400/30 transition disabled:opacity-50"
              title="إعادة بناء وتحديث التقرير التنفيذي"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>{refreshing ? 'جاري المعالجة...' : 'تحديث التقرير التنفيذي'}</span>
            </button>

            <a
              href="/api/export-excel"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg backdrop-blur border border-emerald-400/30 transition"
              title="تحميل ملف الإكسيل التنفيذي الشامل"
            >
              <span>📊</span>
              <span>تصدير Excel</span>
            </a>

            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 border border-white/20 transition backdrop-blur"
              title="رفع ملف بلاغات تعديات جديد"
            >
              <span>📤</span>
              <span>{showUpload ? 'إغلاق الرفع' : 'رفع ملف بلاغات'}</span>
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="relative z-10 mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-blue-200/80">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>المطابقة المكانية KMZ: <strong>نشطة ومحدثة</strong></span>
            </span>
            <span className="hidden sm:inline text-white/30">•</span>
            <span>آخر معالجة للبيانات: <strong>{lastUpdateFormatted}</strong></span>
          </div>
          {refreshMessage && (
            <div className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-bold animate-fade-in">
              {refreshMessage}
            </div>
          )}
        </div>
      </div>

      {/* Upload Dropdown Container (if toggled) */}
      {showUpload && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-3xl border border-blue-200 dark:border-blue-900 shadow-xl transition-all">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <span>📤</span>
                <span>استيراد ملف بلاغات التعديات الميدانية (Excel)</span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                يقوم المحرك تلقائياً بمطابقة الإحداثيات مع حدود مشاريع المياه والصرف والمحافظات.
              </p>
            </div>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
            >
              ✕ إغلاق
            </button>
          </div>
          <FileUpload onSuccess={handleUploadSuccess} />
        </div>
      )}

      {/* 2. Quick Portals Bar (بوابات الوصول السريع) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Link
          to="/map"
          className="group p-4 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent hover:from-amber-500/20 border border-amber-500/30 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🗺️</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500 text-white font-extrabold shadow-sm">
              {pendingCount} معلق
            </span>
          </div>
          <div className="mt-3">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-amber-600 dark:group-hover:text-amber-400 transition">
              الخريطة الجغرافية
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">توزيع البلاغات والحدود المكانية</p>
          </div>
        </Link>

        <Link
          to="/reports"
          className="group p-4 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent hover:from-blue-500/20 border border-blue-500/30 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">📑</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-600 text-white font-extrabold shadow-sm">
              {totalAssigned} مسند
            </span>
          </div>
          <div className="mt-3">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
              جدول البلاغات
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">إدارة البلاغات والبحث والتعديل</p>
          </div>
        </Link>

        <Link
          to="/contractors"
          className="group p-4 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent hover:from-indigo-500/20 border border-indigo-500/30 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🏢</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white font-extrabold shadow-sm">
              سجل المقاولين
            </span>
          </div>
          <div className="mt-3">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
              سجل بيانات المقاولين
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">حفظ وتثبيت المقاولين المعتمدين</p>
          </div>
        </Link>

        <Link
          to="/managers"
          className="group p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent hover:from-emerald-500/20 border border-emerald-500/30 rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">👥</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold shadow-sm">
              {stats.topManagers?.length || 0} مدير
            </span>
          </div>
          <div className="mt-3">
            <h4 className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">
              مدراء البرامج
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">بطاقات المتابعة والمسؤوليات</p>
          </div>
        </Link>
      </div>

      {/* 3. Executive KPI Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>📈</span>
            <span>مؤشرات الأداء والحوكمة الميدانية</span>
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            إجمالي المسند لمشاريع الشركة: <strong className="text-gray-900 dark:text-white">{totalAssigned}</strong> بلاغاً
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: تحت معالجة المقاول */}
          <div
            onClick={() => navigate('/reports?tab=pending')}
            className="cursor-pointer bg-white dark:bg-gray-800 p-5 rounded-2xl border-2 border-amber-400/80 dark:border-amber-600/80 shadow-sm hover:shadow-lg transition-all relative overflow-hidden group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                تحت معالجة المقاول
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">تتطلب إجراءً ميدانياً عاجلاً</div>
            <div className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400 mt-3 group-hover:scale-105 transition-transform">
              {pendingCount}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-semibold">
              <span>{pendingRate}% من البلاغات</span>
              <span>عرض البلاغات ←</span>
            </div>
          </div>

          {/* Card 2: تحت الإجراء */}
          <div
            onClick={() => navigate('/reports?tab=in_progress')}
            className="cursor-pointer bg-white dark:bg-gray-800 p-5 rounded-2xl border border-sky-200 dark:border-sky-800 shadow-sm hover:shadow-lg transition-all group"
          >
            <div className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wide">
              تحت الإجراء
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">متابعات واعتماد الجهات</div>
            <div className="text-3xl sm:text-4xl font-black text-sky-600 dark:text-sky-400 mt-3 group-hover:scale-105 transition-transform">
              {inProgressCount}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-sky-700 dark:text-sky-300 font-semibold">
              <span>{inProgressRate}% من البلاغات</span>
              <span>عرض البلاغات ←</span>
            </div>
          </div>

          {/* Card 3: تمت المعالجة */}
          <div
            onClick={() => navigate('/reports?tab=processed')}
            className="cursor-pointer bg-white dark:bg-gray-800 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm hover:shadow-lg transition-all group"
          >
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">
              تمت المعالجة والإغلاق
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">معالجة ومغلقة بالمشاريع</div>
            <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-3 group-hover:scale-105 transition-transform">
              {processedCount}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
              <span>نسبة الإنجاز {resolutionRate}%</span>
              <span>عرض المغلقة ←</span>
            </div>
          </div>

          {/* Card 4: المستبعدة من المشاريع */}
          <div
            onClick={() => navigate('/reports?tab=excluded')}
            className="cursor-pointer bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all group"
          >
            <div className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
              المستبعدة من المشاريع
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">تتبع التشغيل أو خارج النطاق</div>
            <div className="text-3xl sm:text-4xl font-black text-gray-700 dark:text-gray-300 mt-3 group-hover:scale-105 transition-transform">
              {excludedCount.toLocaleString('ar-SA')}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 font-semibold">
              <span>خارج مسؤولية المشاريع</span>
              <span>استعراض ←</span>
            </div>
          </div>

          {/* Card 5: متوسط التأخير الميداني */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm hover:shadow-lg transition-all">
            <div className="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide">
              متوسط التأخير الميداني
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">أيام منذ تسجيل البلاغ</div>
            <div className="text-3xl sm:text-4xl font-black text-purple-600 dark:text-purple-400 mt-3 flex items-baseline gap-1">
              <span>{stats.avgDelay || 0}</span>
              <span className="text-base font-normal text-gray-500">يوم</span>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-medium">
              <span>الوسيط: <strong>{stats.medianDelay || 0}</strong> يوم</span>
              <span>الأقصى: <strong>{stats.maxDelay || 0}</strong> يوم</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Resolution Rate Bar (شريط تدرج الإنجاز العام) */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <span>🎯</span>
              <span>معدل معالجة وإغلاق بلاغات المشاريع</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              توزيع {totalAssigned} بلاغاً تم إسنادها لمشاريع ومقاولي شركة المياه الوطنية
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span>تمت المعالجة ({resolutionRate}%)</span>
            </span>
            <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
              <span className="w-3 h-3 rounded-full bg-sky-500"></span>
              <span>تحت الإجراء ({inProgressRate}%)</span>
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span>
              <span>معلقة المقاول ({pendingRate}%)</span>
            </span>
          </div>
        </div>

        {/* Stacked Progress Bar */}
        <div className="w-full h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex shadow-inner">
          <div
            style={{ width: `${resolutionRate}%` }}
            className="bg-emerald-500 transition-all duration-700"
            title={`تمت المعالجة: ${processedCount} (${resolutionRate}%)`}
          ></div>
          <div
            style={{ width: `${inProgressRate}%` }}
            className="bg-sky-500 transition-all duration-700"
            title={`تحت الإجراء: ${inProgressCount} (${inProgressRate}%)`}
          ></div>
          <div
            style={{ width: `${pendingRate}%` }}
            className="bg-amber-500 transition-all duration-700"
            title={`معلقة المقاول: ${pendingCount} (${pendingRate}%)`}
          ></div>
        </div>
      </div>

      {/* 5. Deep Analytics: Top Managers & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Managers Leaderboard */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                  <span>👤</span>
                  <span>أعلى مدراء البرامج بلاغات معلقة (تحت معالجة المقاول)</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  تصنيف المدراء حسب عدد البلاغات المفتوحة حالياً لدى المقاولين
                </p>
              </div>
              <Link
                to="/managers"
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
              >
                عرض الجميع ←
              </Link>
            </div>

            <div className="space-y-3">
              {(stats.topManagers || []).slice(0, 6).map((mgr, i) => {
                const mgrPercent = pendingCount > 0 ? Math.round((mgr.count / pendingCount) * 100) : 0
                return (
                  <Link
                    key={i}
                    to={`/managers/${encodeURIComponent(mgr.name)}`}
                    className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-4 transition group"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black ${
                        i === 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' :
                        i === 1 ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200' :
                        'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        #{i + 1}
                      </span>
                      <div>
                        <div className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {mgr.name}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                          يمثل {mgrPercent}% من البلاغات المعلقة
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-amber-600 dark:text-amber-400">
                        {mgr.count}
                      </span>
                      <span className="text-xs text-gray-400">بلاغ</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-center">
            <Link
              to="/managers"
              className="text-xs font-semibold text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              استعراض كافة بطاقات مدراء البرامج والمشاريع التابعة لهم ←
            </Link>
          </div>
        </div>

        {/* Status Distribution Breakdown */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                  <span>📑</span>
                  <span>توزيع البلاغات المسجلة بالنظام حسب الحالة</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  إجمالي ملف البلاغات الميدانية المستورد ({stats.totalReports?.toLocaleString('ar-SA') || 0} بلاغاً)
                </p>
              </div>
              <Link
                to="/reports"
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
              >
                الجدول الشامل ←
              </Link>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {Object.entries(stats.statusDistribution || {}).map(([status, count]) => {
                const total = stats.totalReports || 1
                const pct = Math.round((count / total) * 100)
                const isPending = status === 'تحت معالجة المقاول'
                const isProcessedStatus = status === 'تمت المعالجة'
                return (
                  <div
                    key={status}
                    className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/40 border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        isPending ? 'bg-amber-500' :
                        isProcessedStatus ? 'bg-emerald-500' :
                        'bg-sky-500'
                      }`}></span>
                      <span className="font-bold text-gray-800 dark:text-gray-200">{status}</span>
                    </div>

                    <div className="flex items-center gap-3 font-semibold">
                      <span className="text-gray-400 text-[11px]">({pct}%)</span>
                      <span className="font-bold text-gray-900 dark:text-white">{count.toLocaleString('ar-SA')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Project Portfolio Mini Bar */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>إجمالي المشاريع الرأسمالية: <strong>{stats.totalProjects || 0}</strong></span>
            <span>الجارية: <strong className="text-blue-600 dark:text-blue-400">{stats.activeProjects || 0}</strong></span>
            <span>المسلمة ابتدائياً: <strong className="text-emerald-600 dark:text-emerald-400">{stats.deliveredProjects || 0}</strong></span>
          </div>
        </div>
      </div>
    </div>
  )
}
