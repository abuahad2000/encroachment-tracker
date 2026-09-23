import { useRef, useEffect, useState, useMemo } from 'react'
import { toPng, toCanvas } from 'html-to-image'
import jsPDF from 'jspdf'

export default function WeeklyExport() {
  const contentRef = useRef()
  const page1Ref = useRef()
  const page2Ref = useRef()
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

  // 1. حسابات البطاقات الإحصائية:
  const stats = useMemo(() => {
    const assignedReports = reports.filter(r => r.matched && r.project && r.project.programManager && !r.excluded)
    const totalAssigned = assignedReports.length
    const pending = assignedReports.filter(r => r.status === 'تحت معالجة المقاول').length
    const inProgress = assignedReports.filter(r => r.status !== 'تحت معالجة المقاول' && r.status !== 'تمت المعالجة').length
    const processed = assignedReports.filter(r => r.status === 'تمت المعالجة').length
    const excluded = reports.filter(r => r.excluded).length

    return { totalAssigned, pending, inProgress, processed, excluded }
  }, [reports])

  // 2. تجميع المقاولين المرتبطين بمدراء البرامج مع إحصائيات بلاغاتهم:
  const contractorsList = useMemo(() => {
    const map = {}

    reports.forEach(r => {
      if (r.excluded || !r.project || !r.project.programManager) return
      const cName = r.contractorName || r.project.contractor
      if (!cName || cName === '-' || cName === 'غير محدد') return
      const mgr = r.project.programManager

      if (!map[cName]) {
        map[cName] = {
          name: cName,
          total: 0,
          pending: 0,
          inProgress: 0,
          processed: 0,
          managers: new Set()
        }
      }

      map[cName].total++
      if (r.status === 'تحت معالجة المقاول') {
        map[cName].pending++
      } else if (r.status === 'تمت المعالجة') {
        map[cName].processed++
      } else {
        map[cName].inProgress++
      }
      if (mgr) map[cName].managers.add(mgr)
    })

    return Object.values(map)
      .map(c => ({
        ...c,
        managersList: Array.from(c.managers).join('، ')
      }))
      .sort((a, b) => b.pending - a.pending || b.inProgress - a.inProgress || b.total - a.total)
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

  // تصدير PDF متعدد الصفحات مع فصل الجدول في صفحة مستقلة دون أي انقطاع
  const exportPDF = async () => {
    if (!page1Ref.current || !page2Ref.current) return
    setExporting(true)
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      // 1. تصدير الصفحة الأولى (الملخص التنفيذي ورسم بياني المدراء)
      const canvas1 = await toCanvas(page1Ref.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })
      const imgData1 = canvas1.toDataURL('image/png')
      const imgHeight1 = (canvas1.height * pageWidth) / canvas1.width
      const finalHeight1 = Math.min(imgHeight1, pageHeight)
      pdf.addImage(imgData1, 'PNG', 0, 0, pageWidth, finalHeight1)

      // 2. تصدير الصفحة الثانية (جدول المقاولين بالكامل دون انقسام)
      pdf.addPage()
      const canvas2 = await toCanvas(page2Ref.current, {
        quality: 0.98,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })
      const imgData2 = canvas2.toDataURL('image/png')
      const imgHeight2 = (canvas2.height * pageWidth) / canvas2.width

      // إذا تجاوز جدول المقاولين صفحة واحدة في المستقبل يتم تقطيعه بدقة
      if (imgHeight2 <= pageHeight) {
        pdf.addImage(imgData2, 'PNG', 0, 0, pageWidth, imgHeight2)
      } else {
        const pageCanvasHeight = Math.floor(canvas2.width * (pageHeight / pageWidth))
        let renderedHeight = 0
        let pIndex = 0

        while (renderedHeight < canvas2.height) {
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas2.width
          const currentSliceHeight = Math.min(pageCanvasHeight, canvas2.height - renderedHeight)
          sliceCanvas.height = currentSliceHeight

          const ctx = sliceCanvas.getContext('2d')
          ctx.drawImage(
            canvas2,
            0, renderedHeight, canvas2.width, currentSliceHeight,
            0, 0, canvas2.width, currentSliceHeight
          )

          const sliceData = sliceCanvas.toDataURL('image/png')
          const slicePdfHeight = (currentSliceHeight * pageWidth) / canvas2.width

          if (pIndex > 0) {
            pdf.addPage()
          }
          pdf.addImage(sliceData, 'PNG', 0, 0, pageWidth, slicePdfHeight)

          renderedHeight += currentSliceHeight
          pIndex++
        }
      }

      pdf.save(`تقرير-تعديات-مدراء-البرامج-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (e) {
      console.error('Error exporting PDF:', e)
      alert('حدث خطأ أثناء تصدير PDF: ' + (e.message || 'يرجى المحاولة مجدداً'))
    } finally {
      setExporting(false)
    }
  }

  const printDocument = () => {
    window.print()
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">التقرير التنفيذي الشامل</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            لوحة التصدير المباشر لبلاغات مدراء البرامج والمقاولين المعتمدين مع الإحصائيات الرسمية
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/api/export/pending-excel"
            download="تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx"
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-sm"
            title="تحميل ملف إكسيل الشامل للبلاغات المعلقة المنسق للمدراء"
          >
            <span>📊</span>
            <span>تصدير Excel التنفيذي</span>
          </a>
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
            <span>{exporting ? 'جاري إنشاء PDF منظم...' : 'تصدير PDF'}</span>
          </button>
          <button
            onClick={printDocument}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-sm"
            title="طباعة مباشرة أو حفظ بصيغة PDF عبر المتصفح"
          >
            <span>🖨️</span>
            <span>طباعة مباشرة</span>
          </button>
        </div>
      </div>

      {/* Printable / Exportable Container */}
      <div
        ref={contentRef}
        className="space-y-8"
        style={{ direction: 'rtl', fontFamily: "'Sakkal Majalla', Arial, sans-serif" }}
      >
        {/* ======================================================== */}
        {/* الصفحة الأولى: الملخص التنفيذي وتوزيع مدراء البرامج */}
        {/* ======================================================== */}
        <div
          ref={page1Ref}
          className="bg-white text-gray-900 p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-200 space-y-6 print:shadow-none print:border-none print:p-0 print:m-0"
          style={{ minHeight: '1050px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
        >
          <div className="space-y-6">
            {/* Header */}
            <div className="text-center border-b pb-5 border-gray-200">
              <div className="inline-block px-4 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 mb-2">
                شركة المياه الوطنية • قطاع المشاريع الرأسمالية بالقطاع الأوسط
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-blue-700 mb-1">
                📊 تقرير حوكمة وإسناد بلاغات التعدي
              </h1>
              <p className="text-base text-gray-600 font-bold">
                متابعة إسناد البلاغات لمدراء البرامج والمقاولين بالمشاريع الرأسمالية (مياه وصرف صحي)
              </p>
              <p className="text-xs text-gray-500 mt-1 font-medium">
                تاريخ التقرير: {new Date().toLocaleDateString('ar-SA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* 1. البطاقات الإحصائية الرئيسية */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* إجمالي البلاغات */}
              <div className="text-center p-3.5 bg-blue-50 rounded-2xl border border-blue-200 shadow-sm">
                <span className="text-xs font-extrabold text-blue-700 block mb-0.5">إجمالي المسندة</span>
                <div className="text-3xl font-black text-blue-800 my-0.5">
                  {stats.totalAssigned.toLocaleString('ar-SA')}
                </div>
                <p className="text-[10px] text-blue-600 font-medium">مشاريع جارية معتمدة</p>
              </div>

              {/* المعلقة (تحت المقاول) */}
              <div className="text-center p-3.5 bg-amber-50 rounded-2xl border border-amber-200 shadow-sm">
                <span className="text-xs font-extrabold text-amber-700 block mb-0.5">المعلقة (المقاول)</span>
                <div className="text-3xl font-black text-amber-800 my-0.5">
                  {stats.pending.toLocaleString('ar-SA')}
                </div>
                <p className="text-[10px] text-amber-600 font-medium">تحت معالجة المقاول ⏳</p>
              </div>

              {/* تحت الإجراء */}
              <div className="text-center p-3.5 bg-sky-50 rounded-2xl border border-sky-200 shadow-sm">
                <span className="text-xs font-extrabold text-sky-700 block mb-0.5">تحت الإجراء</span>
                <div className="text-3xl font-black text-sky-800 my-0.5">
                  {stats.inProgress.toLocaleString('ar-SA')}
                </div>
                <p className="text-[10px] text-sky-600 font-medium">متابعات واعتماد الجهات 🔄</p>
              </div>

              {/* المعالجة */}
              <div className="text-center p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm">
                <span className="text-xs font-extrabold text-emerald-700 block mb-0.5">تمت المعالجة</span>
                <div className="text-3xl font-black text-emerald-800 my-0.5">
                  {stats.processed.toLocaleString('ar-SA')}
                </div>
                <p className="text-[10px] text-emerald-600 font-medium">معالجة ومغلقة بالمشاريع ✅</p>
              </div>

              {/* المستبعدة */}
              <div className="text-center p-3.5 bg-red-50 rounded-2xl border border-red-200 shadow-sm col-span-2 sm:col-span-1">
                <span className="text-xs font-extrabold text-red-700 block mb-0.5">المستبعدة من المشاريع</span>
                <div className="text-3xl font-black text-red-800 my-0.5">
                  {stats.excluded.toLocaleString('ar-SA')}
                </div>
                <p className="text-[10px] text-red-600 font-medium">خارج النطاق / تشغيل وصيانة</p>
              </div>
            </div>

            {/* 2. قسم مدراء البرامج والرسم البياني للبلاغات المعلقة */}
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 border-b border-gray-200 pb-2.5">
                <div>
                  <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <span>👤</span>
                    <span>توزيع البلاغات المعلقة على جميع مدراء البرامج ({managers.length} مدراء)</span>
                  </h2>
                  <p className="text-xs text-gray-500 font-semibold">
                    بيان حجم البلاغات المعلقة لكل مدير برنامج ونسبتها من الإجمالي
                  </p>
                </div>
                <div className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full w-fit">
                  إجمالي المعلق: {stats.pending} بلاغ
                </div>
              </div>

              {/* Chart & Bars List */}
              <div className="space-y-2 pt-1">
                {managers.map(mgr => {
                  const pendingCount = mgr.pendingReportsCount || mgr.activeReports || 0
                  const processedCount = mgr.processedReportsCount || 0
                  const totalCount = pendingCount + processedCount
                  const percentage = Math.round((pendingCount / maxManagerPending) * 100)

                  return (
                    <div key={mgr.id || mgr.name} className="p-2.5 bg-white rounded-xl border border-gray-200 shadow-2xs space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-gray-900 text-sm">{mgr.name}</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
                            {mgr.scope || mgr.subProgram || 'متعدد'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 font-medium text-[11px]">
                            المعالج: <strong className="text-emerald-700">{processedCount}</strong>
                          </span>
                          <span className="text-gray-500 font-medium text-[11px]">
                            الإجمالي: <strong className="text-blue-700">{totalCount}</strong>
                          </span>
                          <span className={`px-2 py-0.5 rounded-full font-black text-xs ${
                            pendingCount > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {pendingCount} معلق
                          </span>
                        </div>
                      </div>

                      {/* Visual Bar Chart */}
                      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex">
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
          </div>

          {/* Page 1 Footer */}
          <div className="text-center text-xs text-gray-500 pt-3 border-t border-gray-200 flex justify-between items-center font-semibold">
            <span>نظام إدارة وتتبع التعديات الجغرافية • شركة المياه الوطنية</span>
            <span className="text-blue-700 font-bold">الصفحة 1 من 2</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* الصفحة الثانية: جدول المقاولين بالكامل دون أي انقطاع */}
        {/* ======================================================== */}
        <div
          ref={page2Ref}
          className="bg-white text-gray-900 p-8 sm:p-10 rounded-2xl shadow-xl border border-gray-200 space-y-6 print:shadow-none print:border-none print:p-0 print:m-0 print:break-before-page"
          style={{ minHeight: '1050px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pageBreakBefore: 'always' }}
        >
          <div className="space-y-4">
            {/* Page 2 Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200 pb-3">
              <div>
                <div className="inline-block px-3 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200 mb-1">
                  شركة المياه الوطنية • قطاع المشاريع الرأسمالية بالقطاع الأوسط
                </div>
                <h2 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                  <span>🏗️</span>
                  <span>سجل حصر المقاولين وبلاغات التعدي المسندة ({contractorsList.length} مقاول)</span>
                </h2>
                <p className="text-xs text-gray-500 font-semibold">
                  حصر شامل لكافة المقاولين الذين تم إسناد بلاغات لهم مع بيان المدير المسؤول وحالة المعالجة
                </p>
              </div>
              <div className="text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-xl w-fit">
                مرتب حسب أعلى البلاغات المعلقة
              </div>
            </div>

            {/* Complete Contractors Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-right text-xs bg-white">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                  <tr>
                    <th className="px-3.5 py-3 whitespace-nowrap">#</th>
                    <th className="px-3.5 py-3 whitespace-nowrap">اسم المقاول</th>
                    <th className="px-3.5 py-3 whitespace-nowrap">مدير البرنامج المرتبط</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">معلقة (المقاول)</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">تحت الإجراء</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">تمت المعالجة</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">إجمالي النشط</th>
                    <th className="px-3.5 py-3 whitespace-nowrap">مؤشر الإنجاز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {contractorsList.map((c, i) => {
                    const rate = c.total > 0 ? Math.round((c.processed / c.total) * 100) : 0
                    return (
                      <tr key={i} className="hover:bg-gray-50 transition">
                        <td className="px-3.5 py-2.5 font-bold text-gray-400 text-center">
                          {i + 1}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-gray-900 whitespace-nowrap">
                          {c.name}
                        </td>
                        <td className="px-3.5 py-2.5 text-gray-700 font-medium">
                          {c.managersList || 'غير محدد'}
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                            c.pending > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {c.pending}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-black text-xs ${
                            c.inProgress > 0
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {c.inProgress}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap font-bold text-emerald-700">
                          {c.processed}
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap font-black text-blue-700">
                          {c.pending + c.inProgress}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
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

          {/* Page 2 Footer */}
          <div className="text-center text-xs text-gray-500 pt-3 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-2 font-semibold">
            <span>نظام إدارة وتتبع التعديات الجغرافية • شركة المياه الوطنية</span>
            <span className="font-bold text-gray-700">إعداد: عبدالله بن عمر الزغيبي</span>
            <span className="text-blue-700 font-bold">الصفحة 2 من 2</span>
          </div>
        </div>
      </div>
    </div>
  )
}
