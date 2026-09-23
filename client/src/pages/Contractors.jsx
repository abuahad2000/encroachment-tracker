import { useEffect, useState, useMemo, useRef } from 'react'

const PROFILES_STORAGE_KEY = 'NWC_CONTRACTOR_PROFILES_V1'
const MANUAL_ITEMS_STORAGE_KEY = 'NWC_CONTRACTOR_MANUAL_ITEMS_V1'

function getStoredProfiles() {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (e) {
    return {}
  }
}

function saveStoredProfiles(profiles) {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  } catch (e) {
    console.error('Failed to save contractor profiles to localStorage:', e)
  }
}

function getStoredManualItems() {
  try {
    const raw = localStorage.getItem(MANUAL_ITEMS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (e) {
    return []
  }
}

function saveStoredManualItems(items) {
  try {
    localStorage.setItem(MANUAL_ITEMS_STORAGE_KEY, JSON.stringify(items))
  } catch (e) {
    console.error('Failed to save contractor manual items to localStorage:', e)
  }
}

export default function Contractors() {
  const [directory, setDirectory] = useState([])
  const [stats, setStats] = useState({ totalEntries: 0, uniqueContractors: 0, completedCount: 0, pendingCount: 0 })
  const [programManagers, setProgramManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedManager, setSelectedManager] = useState('all')
  const [completionFilter, setCompletionFilter] = useState('all') // 'all' | 'completed' | 'pending'
  
  // Storage & Sync State
  const [syncing, setSyncing] = useState(false)
  const [restorableCount, setRestorableCount] = useState(0)
  const [toast, setToast] = useState(null)
  const fileInputRef = useRef(null)

  // Edit / Fill Modal State
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [formData, setFormData] = useState({
    id: '',
    contractorName: '',
    projectNumber: '',
    projectName: '',
    projectLocation: '',
    programManager: '',
    projectManager: '',
    crNumber: '',
    unifiedNumber: '',
    managerName: '',
    managerPhone: '',
    managerEmail: '',
    applyToAllContractorProjects: true
  })

  const fetchDirectory = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/contractor-directory')
      if (res.ok) {
        const data = await res.json()
        const dir = data.directory || []
        setDirectory(dir)
        setStats(data.stats || {})
        setProgramManagers(data.programManagers || [])

        // Auto-cache any filled data from server into localStorage
        const storedProfiles = getStoredProfiles()
        let cacheUpdated = false
        dir.forEach(item => {
          const cName = (item.contractorName || '').trim()
          if (!cName || cName === 'غير محدد' || cName === '-') return
          const p = storedProfiles[cName] || {}
          const hasServerData = Boolean(
            (item.crNumber && item.crNumber.trim()) ||
            (item.unifiedNumber && item.unifiedNumber.trim()) ||
            (item.managerName && item.managerName.trim()) ||
            (item.managerPhone && item.managerPhone.trim()) ||
            (item.managerEmail && item.managerEmail.trim())
          )
          if (hasServerData) {
            storedProfiles[cName] = {
              crNumber: item.crNumber || p.crNumber || '',
              unifiedNumber: item.unifiedNumber || p.unifiedNumber || '',
              managerName: item.managerName || p.managerName || '',
              managerPhone: item.managerPhone || p.managerPhone || '',
              managerEmail: item.managerEmail || p.managerEmail || '',
              updatedAt: p.updatedAt || new Date().toISOString()
            }
            cacheUpdated = true
          }
        })
        if (cacheUpdated) {
          saveStoredProfiles(storedProfiles)
        }

        // Calculate how many records can be restored/enriched from localStorage
        let canRestore = 0
        dir.forEach(item => {
          const cName = (item.contractorName || '').trim()
          const p = storedProfiles[cName]
          if (p) {
            const hasDiff = (!item.crNumber && p.crNumber) ||
                            (!item.unifiedNumber && p.unifiedNumber) ||
                            (!item.managerName && p.managerName) ||
                            (!item.managerPhone && p.managerPhone) ||
                            (!item.managerEmail && p.managerEmail)
            if (hasDiff) canRestore++
          }
        })
        const storedManuals = getStoredManualItems()
        storedManuals.forEach(m => {
          if (!dir.some(d => String(d.id) === String(m.id))) {
            canRestore++
          }
        })
        setRestorableCount(canRestore)
      }
    } catch (err) {
      console.error('Error fetching contractor directory:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDirectory()
  }, [])

  // Filtered Directory
  const filteredDirectory = useMemo(() => {
    return directory.filter(item => {
      // Manager filter
      if (selectedManager !== 'all' && item.programManager !== selectedManager) {
        return false
      }

      // Completion filter
      const isComplete = Boolean(item.crNumber && item.crNumber.trim()) || 
                         Boolean(item.managerPhone && item.managerPhone.trim()) || 
                         Boolean(item.managerEmail && item.managerEmail.trim())
      if (completionFilter === 'completed' && !isComplete) return false
      if (completionFilter === 'pending' && isComplete) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const match =
          (item.contractorName || '').toLowerCase().includes(q) ||
          (item.projectNumber || '').toLowerCase().includes(q) ||
          (item.projectName || '').toLowerCase().includes(q) ||
          (item.projectLocation || '').toLowerCase().includes(q) ||
          (item.programManager || '').toLowerCase().includes(q) ||
          (item.projectManager || '').toLowerCase().includes(q) ||
          (item.crNumber || '').toLowerCase().includes(q) ||
          (item.unifiedNumber || '').toLowerCase().includes(q) ||
          (item.managerName || '').toLowerCase().includes(q) ||
          (item.managerPhone || '').toLowerCase().includes(q) ||
          (item.managerEmail || '').toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [directory, selectedManager, completionFilter, searchQuery])

  // Open Edit/Fill modal
  const handleOpenEdit = (item) => {
    setFormData({
      id: item.id,
      contractorName: item.contractorName || '',
      projectNumber: item.projectNumber || '',
      projectName: item.projectName || '',
      projectLocation: item.projectLocation || '',
      programManager: item.programManager || '',
      projectManager: item.projectManager || '',
      crNumber: item.crNumber || '',
      unifiedNumber: item.unifiedNumber || '',
      managerName: item.managerName || '',
      managerPhone: item.managerPhone || '',
      managerEmail: item.managerEmail || '',
      applyToAllContractorProjects: true
    })
    setShowEditModal(true)
  }

  // Open Add modal
  const handleOpenAdd = () => {
    setFormData({
      id: '',
      contractorName: '',
      projectNumber: '',
      projectName: '',
      projectLocation: '',
      programManager: programManagers[0] || '',
      projectManager: '',
      crNumber: '',
      unifiedNumber: '',
      managerName: '',
      managerPhone: '',
      managerEmail: '',
      applyToAllContractorProjects: true
    })
    setShowAddModal(true)
  }

  // Save changes
  const handleSaveEdit = async () => {
    if (!formData.contractorName.trim()) {
      alert('يرجى كتابة اسم المقاول')
      return
    }

    setSaving(true)
    try {
      // 1. Instantly record in browser localStorage
      const cName = (formData.contractorName || '').trim()
      if (cName) {
        const currentProfiles = getStoredProfiles()
        const prev = currentProfiles[cName] || {}
        currentProfiles[cName] = {
          crNumber: (formData.crNumber && String(formData.crNumber).trim()) || prev.crNumber || '',
          unifiedNumber: (formData.unifiedNumber && String(formData.unifiedNumber).trim()) || prev.unifiedNumber || '',
          managerName: (formData.managerName && String(formData.managerName).trim()) || prev.managerName || '',
          managerPhone: (formData.managerPhone && String(formData.managerPhone).trim()) || prev.managerPhone || '',
          managerEmail: (formData.managerEmail && String(formData.managerEmail).trim()) || prev.managerEmail || '',
          updatedAt: new Date().toISOString()
        }
        saveStoredProfiles(currentProfiles)
      }

      // 2. Send to server
      const res = await fetch('/api/contractor-directory/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        setShowEditModal(false)
        await fetchDirectory()
        setToast({ message: 'تم حفظ وتثبيت بيانات المقاول بنجاح في المتصفح والسيرفر', type: 'success' })
        setTimeout(() => setToast(null), 4000)
      } else {
        const err = await res.json()
        alert(`خطأ: ${err.error || 'فشل في الحفظ'}`)
      }
    } catch (e) {
      console.error(e)
      alert('حدث خطأ أثناء حفظ التعديلات')
    } finally {
      setSaving(false)
    }
  }

  // Save new contractor
  const handleSaveAdd = async () => {
    if (!formData.contractorName.trim()) {
      alert('يرجى إدخال اسم المقاول')
      return
    }

    setSaving(true)
    try {
      // 1. Instantly record in browser localStorage
      const cName = (formData.contractorName || '').trim()
      if (cName) {
        const currentProfiles = getStoredProfiles()
        const prev = currentProfiles[cName] || {}
        currentProfiles[cName] = {
          crNumber: (formData.crNumber && String(formData.crNumber).trim()) || prev.crNumber || '',
          unifiedNumber: (formData.unifiedNumber && String(formData.unifiedNumber).trim()) || prev.unifiedNumber || '',
          managerName: (formData.managerName && String(formData.managerName).trim()) || prev.managerName || '',
          managerPhone: (formData.managerPhone && String(formData.managerPhone).trim()) || prev.managerPhone || '',
          managerEmail: (formData.managerEmail && String(formData.managerEmail).trim()) || prev.managerEmail || '',
          updatedAt: new Date().toISOString()
        }
        saveStoredProfiles(currentProfiles)
      }

      // 2. Send to server
      const res = await fetch('/api/contractor-directory/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (res.ok) {
        const data = await res.json()
        if (data.item) {
          const manuals = getStoredManualItems()
          if (!manuals.some(m => String(m.id) === String(data.item.id))) {
            manuals.unshift(data.item)
            saveStoredManualItems(manuals)
          }
        }
        setShowAddModal(false)
        await fetchDirectory()
        setToast({ message: 'تمت إضافة وتثبيت بيانات المقاول والمشروع بنجاح', type: 'success' })
        setTimeout(() => setToast(null), 4000)
      } else {
        const err = await res.json()
        alert(`خطأ: ${err.error || 'فشل في الإضافة'}`)
      }
    } catch (e) {
      console.error(e)
      alert('حدث خطأ أثناء إضافة السجل')
    } finally {
      setSaving(false)
    }
  }

  // Delete manual entry
  const handleDelete = async (item) => {
    if (!confirm(`هل أنت متأكد من حذف السجل الخاص بالمقاول "${item.contractorName}"؟`)) return
    try {
      const res = await fetch(`/api/contractor-directory/${item.id}`, { method: 'DELETE' })
      if (res.ok) {
        // Also remove from stored manual items if exists
        const manuals = getStoredManualItems().filter(m => String(m.id) !== String(item.id))
        saveStoredManualItems(manuals)
        await fetchDirectory()
      } else {
        const err = await res.json()
        alert(err.error || 'تعذر حذف السجل')
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Bulk restore from localStorage to server
  const handleRestoreFromStorage = async (silent = false) => {
    setSyncing(true)
    try {
      const profiles = getStoredProfiles()
      const directoryItems = getStoredManualItems()
      const profilesCount = Object.keys(profiles).length

      if (profilesCount === 0 && directoryItems.length === 0) {
        if (!silent) alert('لا توجد بيانات مقاولين محفوظة محلياً في هذا المتصفح')
        return
      }

      const res = await fetch('/api/contractor-directory/bulk-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles, directoryItems })
      })

      if (res.ok) {
        const data = await res.json()
        await fetchDirectory()
        setToast({
          message: data.message || `تمت استعادة وتحديث البيانات من المحفوظات بنجاح (${data.updatedCount || 0} سجل)!`,
          type: 'success'
        })
        setTimeout(() => setToast(null), 5000)
      } else {
        const err = await res.json()
        alert(`خطأ أثناء المزامنة: ${err.error || 'فشلت المزامنة'}`)
      }
    } catch (err) {
      console.error('Error in handleRestoreFromStorage:', err)
      alert('حدث خطأ في الاتصال أثناء استعادة المحفوظات')
    } finally {
      setSyncing(false)
    }
  }

  // Export local data to downloadable JSON backup
  const handleExportBackupJSON = () => {
    try {
      const profiles = getStoredProfiles()
      const manualItems = getStoredManualItems()
      const payload = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        profilesCount: Object.keys(profiles).length,
        manualItemsCount: manualItems.length,
        profiles,
        manualItems
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `NWC_Contractor_Profiles_Backup_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to export JSON backup:', e)
      alert('تعذر تصدير النسخة الاحتياطية')
    }
  }

  // Import JSON backup file and sync
  const handleImportBackupJSON = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result)
        const importedProfiles = parsed.profiles || (parsed.contractorName ? { [parsed.contractorName]: parsed } : {})
        const importedManuals = parsed.manualItems || []

        const curProfiles = getStoredProfiles()
        const merged = { ...curProfiles, ...importedProfiles }
        saveStoredProfiles(merged)

        if (importedManuals.length > 0) {
          const curManuals = getStoredManualItems()
          const mergedManuals = [...curManuals]
          importedManuals.forEach(im => {
            if (!mergedManuals.some(m => String(m.id) === String(im.id))) {
              mergedManuals.unshift(im)
            }
          })
          saveStoredManualItems(mergedManuals)
        }

        await handleRestoreFromStorage(true)
        setToast({
          message: `تم استيراد ملف النسخة الاحتياطية وتحديث المحفوظات بنجاح!`,
          type: 'success'
        })
        setTimeout(() => setToast(null), 5000)
      } catch (err) {
        console.error('Import error:', err)
        alert('الملف غير صالح أو بتنسيق JSON غير مدعوم')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Export to Excel
  const handleExportExcel = () => {
    setExporting(true)
    window.location.href = '/api/export/contractor-directory-excel'
    setTimeout(() => setExporting(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-l from-blue-50 via-white to-blue-50 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 p-6 rounded-2xl border border-blue-100 dark:border-gray-700 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 mb-2">
            <span>🏢</span>
            <span>حوكمة وبيانات مقاولي المشاريع</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white">
            سجل وبيانات المقاولين
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            جدول توثيق بيانات المقاولين والمشاريع: أرقام السجلات التجارية، الرقم الموحد (700)، ومسؤولي الاتصال مع مدراء البرامج والمشاريع بشركة المياه الوطنية. يتم حفظ بياناتك تلقائياً ويمكن استعادتها بضغطة زر.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Hidden File Input for JSON Backup Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportBackupJSON}
            accept=".json"
            className="hidden"
          />

          <button
            onClick={() => handleRestoreFromStorage(false)}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-xs whitespace-nowrap disabled:opacity-50 relative"
            title="جلب وتحديث بيانات المقاولين من المحفوظات المحلية وتثبيتها بالسيرفر"
          >
            <span>🔄</span>
            <span>{syncing ? 'جاري الاستعادة...' : 'استعادة المحفوظات'}</span>
            {restorableCount > 0 && (
              <span className="bg-amber-400 text-gray-900 text-[10px] font-black px-1.5 py-0.5 rounded-full mr-1 animate-pulse">
                {restorableCount}
              </span>
            )}
          </button>

          <button
            onClick={handleExportBackupJSON}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition text-xs whitespace-nowrap border border-gray-200 dark:border-gray-600"
            title="تحميل نسخة احتياطية من جميع بيانات المقاولين المسجلة لديك كملف JSON"
          >
            <span>💾</span>
            <span>حفظ نسخة JSON</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition text-xs whitespace-nowrap border border-gray-200 dark:border-gray-600"
            title="استيراد وتثبيت بيانات المقاولين من ملف نسخة احتياطية JSON"
          >
            <span>📥</span>
            <span>استيراد نسخة</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-xs whitespace-nowrap disabled:opacity-50"
            title="تصدير جدول بيانات المقاولين بتنسيق Excel"
          >
            <span>📊</span>
            <span>{exporting ? 'جاري التصدير...' : 'تصدير Excel'}</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition text-xs whitespace-nowrap"
          >
            <span>➕</span>
            <span>إضافة مقاول / مشروع</span>
          </button>
        </div>
      </div>

      {/* Alert Banner if local saved data has differences from server */}
      {restorableCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-900 dark:text-amber-200 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <p className="font-bold text-sm">
                تنبيه: تم العثور على {restorableCount} سجل لديه بيانات محفوظة محلياً في جهازك ولم تُثبت بالسيرفر بعد!
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                يمكنك الضغط على زر الاستعادة لجلب وتثبيت جميع السجلات التجارية وأرقام التواصل فوراً لتفادي ضياعها بعد إعادة تشغيل الموقع.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleRestoreFromStorage(false)}
            disabled={syncing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow transition whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>{syncing ? 'جاري الاستعادة...' : 'استعادة وتثبيت المحفوظات الآن'}</span>
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">إجمالي سجلات المشاريع</span>
          <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block">{stats.totalEntries || directory.length}</span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">عقد ومشروع معتمد</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-blue-600 dark:text-blue-400 block font-medium">إجمالي المقاولين المستقلين</span>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">{stats.uniqueContractors || 0}</span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">شركة ومؤسسة مقاولات</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 block font-medium">مكتمل بيانات السجل والتواصل</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">{stats.completedCount || 0}</span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">تم توثيق السجل أو أرقام التواصل</span>
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <span className="text-xs text-amber-600 dark:text-amber-400 block font-medium">بانتظار استكمال البيانات</span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 block">{stats.pendingCount || 0}</span>
          <span className="text-[11px] text-gray-400 mt-0.5 block">يمكن تعبئتها مباشرة من الجدول</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto items-center">
          <button
            onClick={() => setCompletionFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              completionFilter === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            الكل ({directory.length})
          </button>
          <button
            onClick={() => setCompletionFilter('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              completionFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            مكتمل البيانات ({stats.completedCount || 0})
          </button>
          <button
            onClick={() => setCompletionFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
              completionFilter === 'pending'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/60'
            }`}
          >
            ناقص البيانات ({stats.pendingCount || 0})
          </button>

          {/* Program Manager Selector */}
          <div className="mr-2">
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="all">جميع مدراء البرامج ({programManagers.length})</option>
              {programManagers.map(mgr => (
                <option key={mgr} value={mgr}>{mgr}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="w-full sm:w-80">
          <input
            type="text"
            placeholder="🔍 ابحث عن مقاول، رقم المشروع، الحي، الجوال، السجل..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Main Contractors Table */}
      <div className="bg-white dark:bg-gray-850 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-xs text-gray-500">جاري تحميل سجل بيانات المقاولين...</p>
          </div>
        ) : filteredDirectory.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-sm">
            لا توجد نتائج مطابقة لمعايير البحث
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-gray-50 dark:bg-gray-900/70 font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-3 text-center w-10">م</th>
                  <th className="px-4 py-3 whitespace-nowrap">اسم المقاول</th>
                  <th className="px-3 py-3 whitespace-nowrap">رقم المشروع</th>
                  <th className="px-4 py-3 whitespace-nowrap">موقع المشروع / النطاق</th>
                  <th className="px-3 py-3 whitespace-nowrap">مدير البرنامج</th>
                  <th className="px-3 py-3 whitespace-nowrap">مدير المشروع</th>
                  <th className="px-3 py-3 whitespace-nowrap">رقم السجل التجاري</th>
                  <th className="px-3 py-3 whitespace-nowrap">الرقم الموحد (700)</th>
                  <th className="px-3 py-3 whitespace-nowrap">اسم / رقم المسؤول</th>
                  <th className="px-3 py-3 whitespace-nowrap">جوال المسؤول</th>
                  <th className="px-3 py-3 whitespace-nowrap">البريد الإلكتروني</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredDirectory.map((item, idx) => {
                  const hasInfo = Boolean(item.crNumber || item.managerPhone || item.managerEmail)
                  return (
                    <tr
                      key={item.id || idx}
                      className="hover:bg-blue-50/40 dark:hover:bg-gray-800/60 transition group cursor-pointer"
                      onClick={() => handleOpenEdit(item)}
                      title="انقر لتعبئة أو تعديل بيانات المقاول والمشروع"
                    >
                      <td className="px-3 py-3 text-center text-gray-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{item.contractorName}</span>
                          {item.source === 'manual_added' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                              مضاف
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap text-[11px]">
                        {item.projectNumber || '-'}
                      </td>

                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={item.projectLocation}>
                        {item.projectLocation || '-'}
                      </td>

                      <td className="px-3 py-3 font-semibold text-blue-700 dark:text-blue-300 whitespace-nowrap">
                        {item.programManager || '-'}
                      </td>

                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {item.projectManager || '-'}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px]">
                        {item.crNumber ? (
                          <span className="font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                            {item.crNumber}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">غير مدخل</span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px]">
                        {item.unifiedNumber ? (
                          <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded">
                            {item.unifiedNumber}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">غير مدخل</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {item.managerName ? (
                          <span>{item.managerName}</span>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">غير مدخل</span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px]" dir="ltr">
                        {item.managerPhone ? (
                          <a
                            href={`tel:${item.managerPhone}`}
                            onClick={e => e.stopPropagation()}
                            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            {item.managerPhone}
                          </a>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">غير مدخل</span>
                        )}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap font-mono text-[11px]" dir="ltr">
                        {item.managerEmail ? (
                          <a
                            href={`mailto:${item.managerEmail}`}
                            onClick={e => e.stopPropagation()}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {item.managerEmail}
                          </a>
                        ) : (
                          <span className="text-gray-400 text-[10px] italic">غير مدخل</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900 transition flex items-center gap-1"
                          >
                            <span>✏️</span>
                            <span>{hasInfo ? 'تعديل' : 'تعبئة'}</span>
                          </button>
                          {item.source === 'manual_added' && (
                            <button
                              onClick={() => handleDelete(item)}
                              className="px-2 py-1 text-xs font-bold rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 transition"
                              title="حذف السجل"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal تعبئة وتعديل بيانات المقاول والمشروع */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>✏️</span>
                  <span>تعبئة وتعديل بيانات المقاول والمشروع</span>
                </h3>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-0.5 block">
                  {formData.contractorName}
                </span>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* قسم بيانات المشروع الأساسية */}
              <div className="bg-gray-50 dark:bg-gray-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-xs flex items-center gap-1.5">
                  <span>📌</span>
                  <span>بيانات المشروع وإدارة البرنامج</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">اسم المقاول <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={formData.contractorName}
                      onChange={e => setFormData({ ...formData, contractorName: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">رقم المشروع (العملية)</label>
                    <input
                      type="text"
                      value={formData.projectNumber}
                      onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">موقع المشروع (نطاق العمل / الحي)</label>
                    <input
                      type="text"
                      value={formData.projectLocation}
                      onChange={e => setFormData({ ...formData, projectLocation: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">مدير البرنامج (NWC)</label>
                    <input
                      type="text"
                      value={formData.programManager}
                      onChange={e => setFormData({ ...formData, programManager: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">مدير المشروع (NWC)</label>
                    <input
                      type="text"
                      value={formData.projectManager}
                      onChange={e => setFormData({ ...formData, projectManager: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* قسم بيانات السجل والتواصل للمقاول */}
              <div className="bg-blue-50/60 dark:bg-blue-950/30 p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 space-y-3">
                <h4 className="font-bold text-blue-900 dark:text-blue-300 text-xs flex items-center gap-1.5">
                  <span>🏢</span>
                  <span>بيانات السجل التجاري وأرقام التواصل الرسمية</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">رقم السجل التجاري (CR)</label>
                    <input
                      type="text"
                      placeholder="مثال: 1010XXXXXX"
                      value={formData.crNumber}
                      onChange={e => setFormData({ ...formData, crNumber: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">الرقم الموحد (700)</label>
                    <input
                      type="text"
                      placeholder="مثال: 700XXXXXXX"
                      value={formData.unifiedNumber}
                      onChange={e => setFormData({ ...formData, unifiedNumber: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">اسم / رقم المسؤول</label>
                    <input
                      type="text"
                      placeholder="اسم ممثل المقاول أو رقم الهوية / الوظيفة"
                      value={formData.managerName}
                      onChange={e => setFormData({ ...formData, managerName: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">جوال المسؤول</label>
                    <input
                      type="text"
                      placeholder="مثال: 05XXXXXXXX"
                      dir="ltr"
                      value={formData.managerPhone}
                      onChange={e => setFormData({ ...formData, managerPhone: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-right"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">البريد الإلكتروني الرسمي</label>
                    <input
                      type="email"
                      placeholder="example@contractor.com"
                      dir="ltr"
                      value={formData.managerEmail}
                      onChange={e => setFormData({ ...formData, managerEmail: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-850 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-right"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 font-bold text-blue-900 dark:text-blue-300 cursor-pointer bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-blue-200 dark:border-blue-800">
                    <input
                      type="checkbox"
                      checked={formData.applyToAllContractorProjects}
                      onChange={e => setFormData({ ...formData, applyToAllContractorProjects: e.target.checked })}
                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span>
                      تطبيق بيانات السجل التجاري والرقم الموحد وبيانات التواصل على كافة مشاريع المقاول ({formData.contractorName})
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50"
                >
                  {saving ? 'جاري حفظ البيانات...' : 'حفظ وتحديث البيانات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal إضافة مقاول / مشروع جديد */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>➕</span>
                <span>إضافة مشروع / مقاول جديد للسجل</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">اسم المقاول <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="مثال: شركة النظم الحديثة للمقاولات"
                    value={formData.contractorName}
                    onChange={e => setFormData({ ...formData, contractorName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">رقم المشروع (العملية)</label>
                  <input
                    type="text"
                    placeholder="مثال: 12053"
                    value={formData.projectNumber}
                    onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">موقع المشروع (الحي / النطاق)</label>
                  <input
                    type="text"
                    placeholder="مثال: حي النرجس، شمال الرياض"
                    value={formData.projectLocation}
                    onChange={e => setFormData({ ...formData, projectLocation: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">مدير البرنامج (NWC)</label>
                  <input
                    type="text"
                    placeholder="مثال: م. راكان الفالح"
                    value={formData.programManager}
                    onChange={e => setFormData({ ...formData, programManager: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">مدير المشروع (NWC)</label>
                  <input
                    type="text"
                    placeholder="اسم مدير المشروع"
                    value={formData.projectManager}
                    onChange={e => setFormData({ ...formData, projectManager: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">رقم السجل التجاري (CR)</label>
                  <input
                    type="text"
                    placeholder="1010XXXXXX"
                    value={formData.crNumber}
                    onChange={e => setFormData({ ...formData, crNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">الرقم الموحد (700)</label>
                  <input
                    type="text"
                    placeholder="700XXXXXXX"
                    value={formData.unifiedNumber}
                    onChange={e => setFormData({ ...formData, unifiedNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">اسم / رقم المسؤول</label>
                  <input
                    type="text"
                    placeholder="اسم ممثل المقاول"
                    value={formData.managerName}
                    onChange={e => setFormData({ ...formData, managerName: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">جوال المسؤول</label>
                  <input
                    type="text"
                    placeholder="05XXXXXXXX"
                    dir="ltr"
                    value={formData.managerPhone}
                    onChange={e => setFormData({ ...formData, managerPhone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-right"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">البريد الإلكتروني الرسمي</label>
                  <input
                    type="email"
                    placeholder="info@contractor.com"
                    dir="ltr"
                    value={formData.managerEmail}
                    onChange={e => setFormData({ ...formData, managerEmail: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-right"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-300 transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdd}
                  disabled={saving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md transition disabled:opacity-50"
                >
                  {saving ? 'جاري الإضافة...' : 'إضافة إلى السجل'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-6 z-50 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs md:text-sm font-bold border border-emerald-500 animate-bounce">
          <span>✅</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}
