import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function ManagerCards() {
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/managers')
      .then(r => r.json())
      .then(d => {
        setManagers(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="text-center py-8">جاري التحميل...</div>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">بطاقات مدراء البرامج</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {managers.map(mgr => (
          <Link key={mgr.id} to={`/managers/${mgr.id}`}>
            <div className="card hover:shadow-apple-lg cursor-pointer transition">
              <h2 className="text-xl font-bold text-blue-600 mb-2">{mgr.name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{mgr.scope}</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">المشاريع الجارية</span>
                  <span className="font-semibold">{mgr.activeProjects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">البلاغات النشطة</span>
                  <span className="font-semibold text-orange-600">{mgr.activeReports}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t dark:border-slate-700">
                <p className="text-xs text-gray-600 dark:text-gray-400">📱 {mgr.phone}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">📧 {mgr.email}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {managers.length === 0 && (
        <div className="text-center py-8 text-gray-600 dark:text-gray-400">
          لا توجد بيانات مدراء
        </div>
      )}
    </div>
  )
}
