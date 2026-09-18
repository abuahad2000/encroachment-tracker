import { useEffect, useState } from 'react'

export default function ReportsTable() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')

  useEffect(() => {
    fetch('/api/reports')
      .then(r => r.json())
      .then(d => {
        setReports(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [])

  const filtered = reports.filter(r => {
    if (activeTab === 'active') return r.status !== 'تمت المعالجة' && !r.excluded
    if (activeTab === 'excluded') return r.excluded
    if (activeTab === 'no-kmz') {
      // البلاغات تحت معالجة المقاول والمطابقة بدون KMZ
      return r.status === 'تحت معالجة المقاول' && r.matched && r.project && !r.reason?.includes('spatial')
    }
    return r.status === 'تمت المعالجة'
  })

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">جدول البلاغات</h1>

      <div className="flex gap-4 mb-6 border-b dark:border-slate-700 flex-wrap">
        {['active', 'no-kmz', 'excluded', 'archived'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 font-medium transition text-sm ${
              activeTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {tab === 'active' && 'النشطة'}
            {tab === 'no-kmz' && 'تحت معالجة (بدون KMZ)'}
            {tab === 'excluded' && 'المستبعدة'}
            {tab === 'archived' && 'الأرشيف'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8">جاري التحميل...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-right">رقم البلاغ</th>
                <th className="px-4 py-2 text-right">الحي</th>
                <th className="px-4 py-2 text-right">حالة البلاغ</th>
                <th className="px-4 py-2 text-right">المشروع</th>
                <th className="px-4 py-2 text-right">مصدر المطابقة</th>
                <th className="px-4 py-2 text-right">أيام التأخير</th>
                <th className="px-4 py-2 text-right">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const reasonLabel = r.reason?.includes('spatial') ? '📍 خريطة KMZ' :
                                    r.reason?.includes('contractor,district') ? '👤 مقاول + حي' :
                                    r.reason?.includes('contractor') ? '👤 مقاول فقط' :
                                    r.reason?.includes('district_only') ? '🏘️ حي فقط' :
                                    r.reason === 'manual_override' ? '✏️ تعديل يدوي' : '❓'

                return (
                  <tr key={r.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2 font-mono">{r.id}</td>
                    <td className="px-4 py-2">{r.district}</td>
                    <td className="px-4 py-2">
                      <span className="status-badge bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-xs">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{r.project?.name.substring(0, 30)}</td>
                    <td className="px-4 py-2 text-sm">{reasonLabel}</td>
                    <td className="px-4 py-2 font-semibold">{r.ageDays}</td>
                    <td className="px-4 py-2">
                      <button className="text-blue-600 hover:underline text-xs">عرض</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">لا توجد بلاغات</div>
          )}
        </div>
      )}
    </div>
  )
}
