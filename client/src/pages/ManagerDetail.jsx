import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function ManagerDetail() {
  const { managerId } = useParams()
  const navigate = useNavigate()
  const [manager, setManager] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/managers').then(r => r.json()),
      fetch('/api/reports').then(r => r.json())
    ])
      .then(([managers, allReports]) => {
        const mgr = managers.find(m => m.id === parseInt(managerId))
        setManager(mgr)

        // فلتر البلاغات التي تحت معالجة المقاول وترتبط بمشاريع هذا المدير
        const managerProjectIds = mgr?.projects?.map(p => p.id) || []
        const managerReports = allReports.filter(r =>
          r.status === 'تحت معالجة المقاول' &&
          r.matched &&
          r.project &&
          managerProjectIds.includes(r.project.id)
        )
        setReports(managerReports)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [managerId])

  const handleExclude = async (reportId) => {
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, excluded: true, reason: 'user_excluded' })
      })
      if (res.ok) {
        setReports(reports.filter(r => r.id !== reportId))
        setShowDetails(false)
        alert('تم استبعاد البلاغ بنجاح')
      }
    } catch (e) {
      console.error('Error:', e)
    }
  }

  if (loading) return <div className="text-center py-8">جاري التحميل...</div>
  if (!manager) return <div className="text-center py-8">لم يتم العثور على المدير</div>

  return (
    <div>
      <button
        onClick={() => navigate('/managers')}
        className="text-blue-600 hover:underline mb-6"
      >
        ← عودة إلى المدراء
      </button>

      <div className="card mb-8 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
        <h1 className="text-3xl font-bold mb-4">{manager.name}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400">الحي/الحيز</label>
            <p>{manager.scope}</p>
          </div>
          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400">المشاريع الجارية</label>
            <p className="text-lg font-bold text-blue-600">{manager.activeProjects}</p>
          </div>
          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400">البلاغات المسندة</label>
            <p className="text-lg font-bold text-orange-600">{reports.length}</p>
          </div>
          <div>
            <label className="font-semibold text-gray-600 dark:text-gray-400">الحالة</label>
            <p className="text-green-600">نشط</p>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t dark:border-blue-700 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <label className="font-semibold block mb-1">📱 الهاتف</label>
            <p className="text-gray-700 dark:text-gray-300">{manager.phone}</p>
          </div>
          <div>
            <label className="font-semibold block mb-1">📧 البريد الإلكتروني</label>
            <p className="text-gray-700 dark:text-gray-300">{manager.email}</p>
          </div>
          <div>
            <label className="font-semibold block mb-1">🏢 الفرع</label>
            <p className="text-gray-700 dark:text-gray-300">{manager.subProgram || 'غير محدد'}</p>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-6">البلاغات تحت معالجة المقاول ({reports.length})</h2>

      {reports.length === 0 ? (
        <div className="card text-center py-8 text-gray-600 dark:text-gray-400">
          لا توجد بلاغات تحت معالجة حالياً
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm card">
            <thead className="bg-gray-100 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-right">رقم البلاغ</th>
                <th className="px-4 py-2 text-right">المشروع</th>
                <th className="px-4 py-2 text-right">الحي</th>
                <th className="px-4 py-2 text-right">أيام التأخير</th>
                <th className="px-4 py-2 text-right">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-2 font-mono">#{r.id}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                    {r.project?.name.substring(0, 40)}...
                  </td>
                  <td className="px-4 py-2">{r.district}</td>
                  <td className="px-4 py-2">
                    <span className={`font-bold px-2 py-1 rounded ${
                      r.ageDays > 60 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                      r.ageDays > 30 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                      r.ageDays > 15 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
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
                    <button
                      className="text-red-600 hover:underline text-xs"
                      onClick={() => {
                        if (confirm('هل تريد استبعاد هذا البلاغ؟')) {
                          handleExclude(r.id);
                        }
                      }}
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal تفاصيل البلاغ */}
      {showDetails && selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">تفاصيل البلاغ #{selectedReport.id}</h2>
              <button
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
                onClick={() => setShowDetails(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">الوصف</label>
                <p className="text-sm mt-1">{selectedReport.description}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">تأثير التعدي</label>
                <p className="text-sm mt-1">{selectedReport.impact}</p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">الحي</label>
                  <p>{selectedReport.district}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">الشارع</label>
                  <p>{selectedReport.street}</p>
                </div>
                <div>
                  <label className="font-semibold text-gray-600 dark:text-gray-400">أيام التأخير</label>
                  <p className="font-bold text-orange-600">{selectedReport.ageDays}</p>
                </div>
              </div>

              <div className="border-t dark:border-slate-700 pt-4">
                <h3 className="font-semibold mb-2">ملخص سجل المحادثات</h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  {selectedReport.conversationLog?.slice(0, 3).map((log, i) => (
                    <p key={i} className="line-clamp-2">• {log}</p>
                  ))}
                </div>
              </div>

              <div className="border-t dark:border-slate-700 pt-4 flex gap-2">
                <button
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => setShowDetails(false)}
                >
                  إغلاق
                </button>
                <button
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  onClick={() => {
                    handleExclude(selectedReport.id);
                  }}
                >
                  استبعاد البلاغ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
