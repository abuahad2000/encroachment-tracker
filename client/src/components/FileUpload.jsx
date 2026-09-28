import { useState } from 'react'
import { ExcelImportPipeline } from '../utils/ExcelImportPipeline'

export default function FileUpload({ onSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stageMsg, setStageMsg] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [rollingBack, setRollingBack] = useState(false)

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('❌ يجب أن يكون الملف بصيغة Excel (.xlsx أو .xls)')
      return
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError('❌ حجم الملف كبير جداً (الحد الأقصى 50 MB)')
      return
    }

    setError(null)
    setSuccess(null)
    setUploading(true)
    setProgress(15)
    setStageMsg('المرحلة 1/6: جاري تنظيف وتدقيق البيانات...')

    try {
      const result = await ExcelImportPipeline.processUploadedFile(file)

      if (result && result.success) {
        setProgress(100)
        setStageMsg('اكتملت جميع المراحل بنجاح!')
        const audit = result.audit || {}
        setSuccess(
          `✅ تم الاستيراد بنجاح!\n` +
          `📊 إجمالي البلاغات المعالجة: ${audit.processed || 0}\n` +
          `🎯 مرتبط بدقة: ${audit.matched || 0} | ⚠️ يحتاج مراجعة: ${audit.unmatched || 0}\n` +
          `📈 نسبة الدقة: ${audit.accuracy || '100'}%`
        )

        // Reset file input
        e.target.value = ''

        setTimeout(() => {
          setUploading(false)
          setProgress(0)
          setStageMsg('')
          onSuccess?.()
        }, 2000)
      } else {
        throw new Error(result?.error || 'فشلت معالجة ملف الإكسل')
      }
    } catch (err) {
      setError(`❌ خطأ: ${err.message}`)
      setUploading(false)
      setProgress(0)
      setStageMsg('')
    }
  }

  const handleRollback = async () => {
    setRollingBack(true)
    try {
      const res = await ExcelImportPipeline.rollbackLastImport()
      if (res && res.success) {
        setSuccess('✅ تم التراجع عن آخر استيراد واستعادة النسخة الاحتياطية بنجاح.')
        onSuccess?.()
      }
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="card">
      <h3 className="text-lg font-bold mb-4">📤 رفع ملف البلاغات الجديد</h3>

      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-blue-500 transition cursor-pointer bg-gray-50 dark:bg-slate-800/50">
        <label className="cursor-pointer block">
          <div className="space-y-2">
            <div className="text-3xl">📁</div>
            <div className="font-medium text-gray-700 dark:text-gray-300">
              اسحب ملف Excel هنا أو اضغط للاختيار
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              (.xlsx أو .xls - الحد الأقصى 50 MB)
            </div>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="mt-4">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {stageMsg || 'جاري المعالجة...'}
            </span>
            <span className="text-sm font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-200 text-sm whitespace-pre-line">
          {success}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-blue-700 dark:text-blue-200 text-xs">
        <div>
          <strong>💡 ملاحظة:</strong> يمر الاستيراد بـ 6 مراحل ذكية (تنظيف، تصنيف، توحيد، ربط، استبعاد مع حماية العرين، وتحديث البيانات).
        </div>
        <button
          type="button"
          onClick={handleRollback}
          disabled={rollingBack || uploading}
          className="shrink-0 px-2.5 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition disabled:opacity-50"
          title="التراجع عن آخر استيراد واستعادة النسخة السابقة"
        >
          {rollingBack ? 'جاري التراجع...' : '↺ تراجع عن آخر استيراد'}
        </button>
      </div>
    </div>
  )
}
