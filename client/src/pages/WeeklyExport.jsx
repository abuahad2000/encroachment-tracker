import { useRef, useEffect, useState, useMemo } from 'react'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'

export default function WeeklyExport() {
  const contentRef = useRef()
  const [managers, setManagers] = useState([])
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/managers').then(r => r.json()),
      fetch('/api/reports').then(r => r.json())
    ])
      .then(([managersData, reportsData]) => {
        setManagers(managersData || [])
        setReports(reportsData || [])
        setLoading(false)
      })
      .catch(e => {
        console.error('Error fetching export data:', e)
        setLoading(false)
      })
  }, [])

  // 1. حسابات البطاقات الأربع المطلوبة:
  const stats = useMemo(() => {
    // جميع البلاغات المرتبطة باسم مدير برنامج بكل حالاتها
    const assignedReports = reports.filter(r => r.matched && r.project && r.project.programManager && !r.excluded)
    // إجمالي البلاغات
    const totalAssigned = assignedReports.length
    // البلاغات التي تم معالجتها من جميع مدراء البرنامج
    const processed = assignedReports.filter(r => r.status === 'تمت المعالجة').length
    // قيد المعالجة (عدد البلاغات المعلقة على مدراء البرنامج)
    const pending = assignedReports.filter(r => r.status !== 'تمت المعالجة').length
    // المستبعدة في ملف البلاغات
    const excluded = reports.filter(r => r.excluded).length

    return { totalAssigned, processed, pending, excluded }
  }, [reports])

  // 2. تجميع المقاولين وعدد البلاغات المعلقة عليهم والمرتبطة بمدراء البرامج:
  const contractorsList = useMemo(() => {
    const assignedReports = reports.filter(r => r.matched && r.project && r.project.programManager && !r.excluded)
    const map = {}

    assignedReports.forEach(r => {
      let cName = (r.contractorName || r.project.contractor || '').trim()
      if (!cName || cName.toUpperCase() === 'NULL') {
        cName = 'غير محدد (بانتظار تحديد المقاول)'
      }
      const mgr = r.project.programManager

      if (!map[cName]) {
        map[cName] = {
          name: cName,
          total: 0,
          pending: 0,
          processed: 0,
          managers: new Set()
        }
      }

      map[cName].total++
      if (r.status === 'تمت المعالجة') {
        map[cName].processed++
      } else {
        map[cName].pending++
      }
      if (mgr) map[cName].managers.add(mgr)
    })

    return Object.values(map)
      .map(c => ({
        ...c,
        managersList: Array.from(c.managers).join('، ')
      }))
      .sort((a, b) => b.pending - a.pending || b.total - a.total)
  }, [reports])

  // أعلى قيمة بلاغات معلقة على المدراء لحساب نسبة الرسم البياني
  const maxManagerPending = useMemo(() => {
    if (managers.length === 0) return 1
    const maxVal = Math.max(...managers.map(m => m.pendingReportsCount || m.activeReports || 0))
    return maxVal > 0 ? maxVal : 1
  }, [managers])

  const exportPNG = async () => {
    if (!contentRef.current) return
    setExporting(true)
    try {
      const imgData = await toPng(contentRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })
      const link = document.createElement('a')
      link.href = imgData
      link.download = `تقرير-تعديات-مدراء-البرامج-${new Date().toISOString().split('T')[0]}.png`
      link.click()
    } catch (e) {
      console.error('Error exporting PNG:', e)
      alert('حدث خطأ أثناء تصدير الصورة')
    } finally {
      setExporting(false)
    }
  }

  const exportPDF = async () => {
    if (!contentRef.current) return
    setExporting(true)
    try {
      const imgData = await toPng(contentRef.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })

      const element = contentRef.current
      const width = element.offsetWidth
      const height = element.offsetHeight

      const pdf = new jsPDF({
        orientation: height > width ? 'portrait' : 'landscape',
        unit: 'mm',
        format: 'a4',
      })

      const imgWidth = pdf.internal.pageSize.getWidth()
      const imgHeight = (height * imgWidth) / width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`تقرير-تعديات-مدراء-البرامج-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (e) {
      console.error('Error exporting PDF:', e)
      alert('حدث خطأ أثناء تصدير PDF')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300 font-bold">جاري تحميل بيانات التقرير التنفيذي...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">التقرير التنفيذي الشامل</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            لوحة التصدير المباشر لبلاغات مدراء البرامج والمقاولين المعتمدين مع الإحصائيات الرسمية
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportPNG}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-sm disabled:opacity-50"
          >
            <span>📥</span>
            <span>{exporting ? 'جاري التصدير...' : 'تصدير PNG'}</span>
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-sm disabled:opacity-50"
          >
            <span>📄</span>
            <span>{exporting ? 'جاري التصدير...' : 'تصدير PDF'}</span>
          </button>
        </div>
      </div>

      {/* Printable / Exportable Container */}
      <div
        ref={contentRef}
        className="bg-white text-gray-900 p-8 sm:p-12 rounded-2xl shadow-xl border border-gray-200 space-y-8"
        style={{ direction: 'rtl', fontFamily: "'Sakkal Majalla', Arial, sans-serif" }}
      >
        {/* Header */}
        <div className="text-center border-b pb-6 border-gray-200">
          <div className="inline-block px-4 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 mb-2">
            شركة المياه الوطنية • قطاع المشاريع والخدمات الفنية
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-blue-700 mb-2">
            📊 تقرير حوكمة وإسناد بلاغات التعدي
          </h1>
          <p className="text-base text-gray-600 font-bold">
            متابعة إسناد البلاغات لمدراء البرامج والمقاولين بالمشاريع الرأسمالية (مياه وصرف صحي)
          </p>
          <p className="text-xs text-gray-500 mt-2 font-medium">
            تاريخ التقرير: {new Date().toLocaleDateString('ar-SA', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* 1. البطاقات الإحصائية الأربع الرئيسية */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* إجمالي البلاغات */}
          <div className="text-center p-5 bg-blue-50 rounded-2xl border border-blue-200 shadow-sm">
            <span className="text-xs font-extrabold text-blue-700 block mb-1">إجمالي البلاغات المسندة</span>
            <div className="text-4xl font-black text-blue-800 my-1">
              {stats.totalAssigned.toLocaleString('ar-SA')}
            </div>
            <p className="text-[11px] text-blue-600 font-medium">لجميع مدراء البرامج بكافة الحالات</p>
          </div>

          {/* المعالجة */}
          <div className="text-center p-5 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm">
            <span className="text-xs font-extrabold text-emerald-700 block mb-1">البلاغات المعالجة</span>
            <div className="text-4xl font-black text-emerald-800 my-1">
              {stats.processed.toLocaleString('ar-SA')}
            </div>
            <p className="text-[11px] text-emerald-600 font-medium">التي تم إغلاقها ومعالجتها بنجاح</p>
          </div>

          {/* قيد المعالجة (المعلقة) */}
          <div className="text-center p-5 bg-amber-50 rounded-2xl border border-amber-200 shadow-sm">
            <span className="text-xs font-extrabold text-amber-700 block mb-1">قيد المعالجة (المعلقة)</span>
            <div className="text-4xl font-black text-amber-800 my-1">
              {stats.pending.toLocaleString('ar-SA')}
            </div>
            <p className="text-[11px] text-amber-600 font-medium">المعلقة حالياً على مدراء البرامج</p>
          </div>

          {/* المستبعدة */}
          <div className="text-center p-5 bg-red-50 rounded-2xl border border-red-200 shadow-sm">
            <span className="text-xs font-extrabold text-red-700 block mb-1">المستبعدة من ملف البلاغات</span>
            <div className="text-4xl font-black text-red-800 my-1">
              {stats.excluded.toLocaleString('ar-SA')}
            </div>
            <p className="text-[11px] text-red-600 font-medium">خارج النطاق أو تتبع التشغيل والصيانة</p>
          </div>
        </div>

        {/* 2. قسم مدراء البرامج والرسم البياني للبلاغات المعلقة */}
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-3">
            <div>
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <span>👤</span>
                <span>توزيع البلاغات المعلقة على جميع مدراء البرامج ({managers.length} مدراء)</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 font-semibold">
                رسم بياني يوضح حجم البلاغات المعلقة لكل مدير برنامج ونسبتها من الإجمالي
              </p>
            </div>
            <div className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full w-fit">
              إجمالي المعلق: {stats.pending} بلاغ
            </div>
          </div>

          {/* Chart & Bars List */}
          <div className="space-y-3 pt-2">
            {managers.map(mgr => {
              const pendingCount = mgr.pendingReportsCount || mgr.activeReports || 0
              const processedCount = mgr.processedReportsCount || 0
              const totalCount = pendingCount + processedCount
              const percentage = Math.round((pendingCount / maxManagerPending) * 100)

              return (
                <div key={mgr.id || mgr.name} className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-gray-900 text-sm">{mgr.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
                        {mgr.scope || mgr.subProgram || 'متعدد'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 font-medium">
                        المعالج: <strong className="text-emerald-700">{processedCount}</strong>
                      </span>
                      <span className="text-gray-500 font-medium">
                        الإجمالي: <strong className="text-blue-700">{totalCount}</strong>
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full font-black text-xs ${
                        pendingCount > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {pendingCount} معلق
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar Chart */}
                  <div className="w-full bg-gray-100 rounded-full h-3.5 overflow-hidden flex">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        pendingCount > 10 ? 'bg-red-500' :
                        pendingCount > 5 ? 'bg-amber-500' :
                        pendingCount > 0 ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                      style={{ width: `${Math.max(percentage, pendingCount > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 3. قسم المقاولين وعدد البلاغات المعلقة عليهم المرتبطة بمدير برنامج */}
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-3">
            <div>
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <span>🏗️</span>
                <span>المقاولون والبلاغات المعلقة المرتبطة بمدراء البرامج ({contractorsList.length} مقاول)</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 font-semibold">
                حصر كافة المقاولين الذين تم إسناد بلاغات لهم مع بيان المدير المسؤول وحالة المعالجة
              </p>
            </div>
            <div className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full w-fit">
              مرتب حسب البلاغات المعلقة
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs bg-white rounded-xl overflow-hidden border border-gray-200">
              <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">اسم المقاول</th>
                  <th className="px-4 py-3 whitespace-nowrap">مدير البرنامج المرتبط</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">البلاغات المعلقة</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">تمت المعالجة</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">إجمالي البلاغات</th>
                  <th className="px-4 py-3 whitespace-nowrap">مؤشر الإنجاز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {contractorsList.map((c, i) => {
                  const rate = c.total > 0 ? Math.round((c.processed / c.total) * 100) : 0
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">
                        {c.name}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">
                        {c.managersList || 'غير محدد'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                          c.pending > 0
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {c.pending}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-bold text-emerald-700">
                        {c.processed}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap font-black text-blue-700">
                        {c.total}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-gray-600">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-2 font-semibold">
          <span>نظام إدارة وتتبع التعديات الجغرافية • شركة المياه الوطنية</span>
          <span className="font-bold text-gray-700">إعداد: عبدالله بن عمر الزغيبي</span>
        </div>
      </div>
    </div>
  )
}
