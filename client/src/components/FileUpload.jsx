import { useState } from 'react'

export default function FileUpload({ onSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

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
    setProgress(0)

    try {
      const formData = new FormData()
      formData.append('file', file)

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) return prev + Math.random() * 30
          clearInterval(progressInterval)
          return prev
        })
      }, 500)

      const response = await fetch('/api/upload-reports', {
        method: 'POST',
        body: formData
      })

      clearInterval(progressInterval)
      setProgress(100)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'خطأ في رفع الملف')
      }

      const data = await response.json()
      setSuccess(`✅ تم رفع الملف بنجاح! تم معالجة البيانات تلقائياً.`)

      // Reset form
      e.target.value = ''

      // Call callback after 2 seconds
      setTimeout(() => {
        setUploading(false)
        setProgress(0)
        onSuccess?.()
      }, 2000)

    } catch (err) {
      setError(`❌ خطأ: ${err.message}`)
      setUploading(false)
      setProgress(0)
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
            <span className="text-sm font-medium">جاري المعالجة...</span>
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
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg text-green-700 dark:text-green-200 text-sm">
          {success}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg text-blue-700 dark:text-blue-200 text-xs">
        <strong>💡 ملاحظة:</strong> سيتم معالجة البلاغات تلقائياً وربطها بالمشاريع، وسيتم تحديث جميع البيانات والخرائط فوراً.
      </div>
    </div>
  )
}
