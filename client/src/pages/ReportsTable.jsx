import { useEffect, useState } from 'react'

export default function ReportsTable() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')
  const [selectedReport, setSelectedReport] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

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

  const handleExclude = async (reportId) => {
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, excluded: true, reason: 'user_excluded' })
      })
      if (res.ok) {
        setReports(reports.map(r =>
          r.id === reportId ? { ...r, excluded: true } : r
        ))
        setShowDetails(false)
      }
    } catch (e) {
      console.error('Error:', e)
    }
  }

  const filtered = reports.filter(r => {
    if (activeTab === 'active') return r.status === 'تحت معالجة المقاول' && r.matched && r.project
    if (activeTab === 'excluded') return r.excluded
    if (activeTab === 'no-kmz') {
      // البلاغات تحت معالجة المقاول والمطابقة بدون KMZ
      return r.status === 'تحت معالجة المقاول' && r.matched && r.project && !r.reason?.includes('spatial')
    }
    return r.status === 'تمت المعالجة' && r.matched && r.project
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
                <th className="px-4 py-2 text-right">المشروع</th>
                <th className="px-4 py-2 text-right">المقاول</th>
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
                    <td className="px-4 py-2 font-semibold text-blue-600">{r.id}</td>
                    <td className="px-4 py-2 text-sm">{r.district}</td>
                    <td className="px-4 py-2 text-sm font-semibold">{r.project?.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{r.project?.contractor}</td>
                    <td className="px-4 py-2 text-sm">{reasonLabel}</td>
                    <td className="px-4 py-2 font-semibold">
                      <span className={`px-2 py-1 rounded text-xs ${
                        r.ageDays > 60 ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100' :
                        r.ageDays > 30 ? 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-100' :
                        r.ageDays > 15 ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-100' :
                        'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-100'
                      }`}>
                        {r.ageDays}
                      </span>
                    </td>
                    <td className="px-4 py-2 flex gap-2">
                      <button
                        className="text-blue-600 hover:underline text-xs"
                        onClick={() => { setSelectedReport(r); setShowDetails(true); }}
                      >
                        عرض
                      </button>
                      {!r.excluded && r.status !== 'تمت المعالجة' && (
                        <button
                          className="text-red-600 hover:underline text-xs"
                          onClick={() => { if (confirm('هل تريد استبعاد هذا البلاغ؟')) handleExclude(r.id); }}
                        >
                          حذف
                        </button>
                      )}
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

      {/* Modal تفاصيل البلاغ */}
      {showDetails && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">تفاصيل البلاغ {selectedReport.id}</h2>
              <button
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
                onClick={() => setShowDetails(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">الوصف</label>
                  <p className="text-sm">{selectedReport.description}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">تأثير التعدي</label>
                  <p className="text-sm">{selectedReport.impact}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">حالة البلاغ</label>
                  <p>{selectedReport.status}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">الحي</label>
                  <p>{selectedReport.district}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">المقاول</label>
                  <p className="text-blue-600">{selectedReport.project?.contractor || 'غير محدد'}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">التأخير</label>
                  <p className="font-bold text-orange-600">{selectedReport.ageDays} يوم</p>
                </div>
              </div>

              {selectedReport.project && (
                <div className="border-t dark:border-slate-700 pt-4">
                  <h3 className="font-semibold mb-2">المشروع المسند</h3>
                  <p className="text-sm"><strong>الاسم:</strong> {selectedReport.project.name}</p>
                  <p className="text-sm"><strong>المقاول:</strong> {selectedReport.project.contractor}</p>
                  <p className="text-sm"><strong>الحالة:</strong> {selectedReport.project.status}</p>
                  <p className="text-sm"><strong>مصدر المطابقة:</strong> {selectedReport.reason}</p>
                </div>
              )}

              <div className="border-t dark:border-slate-700 pt-4 flex gap-2">
                <button
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => setShowDetails(false)}
                >
                  إغلاق
                </button>
                {!selectedReport.excluded && selectedReport.status !== 'تمت المعالجة' && (
                  <button
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    onClick={() => {
                      handleExclude(selectedReport.id);
                      alert('تم استبعاد البلاغ بنجاح');
                    }}
                  >
                    استبعاد البلاغ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
