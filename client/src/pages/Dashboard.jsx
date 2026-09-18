import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

  if (loading) return <div className="text-center py-8">جاري التحميل...</div>

  if (!stats) return <div className="text-center py-8 text-red-600">خطأ في تحميل البيانات</div>

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">لوحة المراقبة</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="text-gray-600 dark:text-gray-400 text-sm">إجمالي البلاغات النشطة</div>
          <div className="text-3xl font-bold mt-2">{stats.totalActive || 0}</div>
        </div>

        <div className="card">
          <div className="text-gray-600 dark:text-gray-400 text-sm">المسندة بنجاح</div>
          <div className="text-3xl font-bold mt-2 text-green-600">{stats.assignedCount || 0}</div>
        </div>

        <div className="card">
          <div className="text-gray-600 dark:text-gray-400 text-sm">المستبعدة تلقائياً</div>
          <div className="text-3xl font-bold mt-2 text-yellow-600">{stats.excludedCount || 0}</div>
        </div>

        <div className="card">
          <div className="text-gray-600 dark:text-gray-400 text-sm">متوسط التأخير (أيام)</div>
          <div className="text-3xl font-bold mt-2 text-red-600">{stats.avgDelay || 0}</div>
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
        <button className="btn-primary" onClick={() => {
          fetch('/api/refresh-data', { method: 'POST' })
            .then(() => window.location.reload())
            .catch(e => console.error('Error refreshing:', e))
        }}>
          تحديث البيانات
        </button>
      </div>
    </div>
  )
}
