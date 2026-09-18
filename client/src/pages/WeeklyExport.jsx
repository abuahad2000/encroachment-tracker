import { useRef } from 'react'
import html2canvas from 'html-to-image'
import jsPDF from 'jspdf'

export default function WeeklyExport() {
  const contentRef = useRef()

  const exportPNG = async () => {
    if (!contentRef.current) return
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        allowTaint: true,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = `تقرير-التعديات-${new Date().toISOString().split('T')[0]}.png`
      link.click()
    } catch (e) {
      console.error('Error exporting PNG:', e)
      alert('خطأ في التصدير')
    }
  }

  const exportPDF = async () => {
    if (!contentRef.current) return
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        allowTaint: true,
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      })
      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`تقرير-التعديات-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (e) {
      console.error('Error exporting PDF:', e)
      alert('خطأ في التصدير')
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">التقرير الأسبوعي</h1>

      <div className="flex gap-4 mb-6">
        <button className="btn-primary" onClick={exportPNG}>
          📥 تصدير PNG
        </button>
        <button className="btn-primary" onClick={exportPDF}>
          📥 تصدير PDF
        </button>
      </div>

      <div
        ref={contentRef}
        className="bg-white dark:bg-slate-900 p-12 rounded-xl shadow-lg space-y-8"
      >
        {/* Header */}
        <div className="text-center border-b pb-6">
          <h1 className="text-4xl font-bold text-blue-600 mb-2">
            📊 التقرير الأسبوعي
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            إدارة وتدقيق بلاغات التعديات على مشاريع المياه والصرف الصحي
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {new Date().toLocaleDateString('ar-SA', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'إجمالي البلاغات', value: '2,424', color: 'bg-blue-500' },
            { label: 'المعالجة', value: '1,654', color: 'bg-green-500' },
            { label: 'قيد المعالجة', value: '667', color: 'bg-yellow-500' },
            { label: 'المعادة', value: '103', color: 'bg-red-500' },
          ].map((stat, i) => (
            <div key={i} className="text-center p-4 bg-gray-100 dark:bg-slate-800 rounded-lg">
              <div className={`${stat.color} text-white text-3xl font-bold mb-2 p-2 rounded`}>
                {stat.value}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Message */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border-r-4 border-blue-500 p-4 rounded">
          <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">ملخص الوضع</p>
          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
            تم معالجة 68% من البلاغات المرفوعة. وجود 667 بلاغاً قيد المعالجة يتطلب متابعة مشددة مع المقاولين والمدراء.
            103 بلاغات معادة تحتاج تدقيق إداري عاجل.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-600 dark:text-gray-400 pt-6 border-t">
          <p>نظام إدارة التعديات • شركة المياه الوطنية</p>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-6 text-center">
        💡 معاينة التقرير أعلاه. استخدم الأزرار للتصدير.
      </p>
    </div>
  )
}
