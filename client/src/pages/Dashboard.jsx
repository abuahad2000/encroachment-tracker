import { useEffect, useState } from 'react'
import FileUpload from '../components/FileUpload'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState(null)

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

  if (loading) return <div className="text-center py-8">جاري التحميل...</div>

  if (!stats) return <div className="text-center py-8 text-red-600">خطأ في تحميل البيانات</div>

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">لوحة المراقبة</h1>

      {/* File Upload Section */}
      <FileUpload onSuccess={handleUploadSuccess} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card border-r-4 border-r-amber-500 hover:shadow-md transition">
          <div className="text-gray-600 dark:text-gray-400 text-sm font-semibold">إجمالي البلاغات النشطة</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">المعلقة لجميع مدراء البرامج</div>
          <div className="text-3xl font-extrabold mt-2 text-amber-600 dark:text-amber-400">{stats.totalActive || 0}</div>
        </div>

        <div className="card border-r-4 border-r-green-500 hover:shadow-md transition">
          <div className="text-gray-600 dark:text-gray-400 text-sm font-semibold">المسندة بنجاح</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">التي تم ربطها بمدير برنامج ومقاول</div>
          <div className="text-3xl font-extrabold mt-2 text-green-600 dark:text-green-400">{stats.assignedCount || 0}</div>
        </div>

        <div className="card border-r-4 border-r-red-500 hover:shadow-md transition">
          <div className="text-gray-600 dark:text-gray-400 text-sm font-semibold">المستبعدة من ملف البلاغات</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">خارج نطاق المشاريع الجارية أو تتبع التشغيل</div>
          <div className="text-3xl font-extrabold mt-2 text-red-600 dark:text-red-400">{stats.excludedCount || 0}</div>
        </div>

        <div className="card border-r-4 border-r-blue-500 hover:shadow-md transition">
          <div className="text-gray-600 dark:text-gray-400 text-sm font-semibold">متوسط التأخير</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">أيام منذ تسجيل البلاغ الميداني</div>
          <div className="text-3xl font-extrabold mt-2 text-blue-600 dark:text-blue-400">{stats.avgDelay || 0} <span className="text-base font-normal">يوم</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-bold mb-4">توزيع الحالات</h2>
          <div className="space-y-3">
            {Object.entries(stats.statusDistribution || {}).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300">{status}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-4">أعلى مدراء بـ البلاغات</h2>
          <div className="space-y-3">
            {(stats.topManagers || []).slice(0, 5).map((mgr, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-700 dark:text-gray-300">{mgr.name}</span>
                <span className="font-semibold">{mgr.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold mb-4">آخر تحديث</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleString('ar-SA') : 'لم يتم التحديث'}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <span className="inline-block animate-spin">⏳</span>
                <span>جاري معالجة البيانات وتحديث ملف الإكسيل التنفيذي...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>تحديث البيانات والتقرير التنفيذي</span>
              </>
            )}
          </button>
          {refreshMessage && (
            <span className="text-sm font-semibold animate-pulse">
              {refreshMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
