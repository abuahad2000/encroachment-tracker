// ExcelImportPipeline.js - Frontend Pipeline Orchestrator (Compatible with Appsmith & React)
import { CacheManager } from './CacheManager.js'
import { ProjectManagerMapper } from './ProjectManagerMapper.js'
import { ContractorPhaseResolver } from './ContractorPhaseResolver.js'

// Safe helper functions for Appsmith / React hybrid execution
const safeShowAlert = (msg, type = 'info') => {
  if (typeof showAlert === 'function') {
    showAlert(msg, type)
  } else {
    console.log(`[${type}] ${msg}`)
  }
}

const safeStoreValue = (key, val) => {
  if (typeof storeValue === 'function') {
    storeValue(key, val)
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (val === null || val === undefined) {
        window.localStorage.removeItem(key)
      } else {
        window.localStorage.setItem(key, JSON.stringify(val))
      }
    }
  } catch (e) {}
}

const getStoredValue = (key) => {
  if (typeof appsmith !== 'undefined' && appsmith?.store?.[key] !== undefined) {
    return appsmith.store[key]
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : null
    }
  } catch (e) {}
  return null
}

const refreshAppsmithQueries = async () => {
  const runSafe = async (queryObj) => {
    if (typeof queryObj !== 'undefined' && typeof queryObj.run === 'function') {
      try {
        await queryObj.run()
      } catch (err) {
        console.warn('Appsmith query execution warning:', err)
      }
    }
  }

  // 1. التقارير
  if (typeof getReports !== 'undefined') await runSafe(getReports)
  else if (typeof getReportsQuery !== 'undefined') await runSafe(getReportsQuery)

  // 2. الإحصائيات
  if (typeof getStats !== 'undefined') await runSafe(getStats)
  else if (typeof getStatsQuery !== 'undefined') await runSafe(getStatsQuery)

  // 3. المشاريع
  if (typeof getProjects !== 'undefined') await runSafe(getProjects)
  else if (typeof getProjectsQuery !== 'undefined') await runSafe(getProjectsQuery)

  // 4. المدراء
  if (typeof getManagers !== 'undefined') await runSafe(getManagers)
  else if (typeof getManagersQuery !== 'undefined') await runSafe(getManagersQuery)
  else if (typeof getProgramManagers !== 'undefined') await runSafe(getProgramManagers)

  // 5. المستبعدات
  if (typeof getExcludedProjects !== 'undefined') await runSafe(getExcludedProjects)
}

export const ExcelImportPipeline = {
  currentStage: 0,
  totalStages: 6,

  processUploadedFile: async (file) => {
    try {
      if (!file) {
        safeShowAlert('⚠️ الرجاء اختيار ملف Excel أولاً', 'warning')
        return { success: false, error: 'لم يتم اختيار ملف' }
      }

      const formData = new FormData()
      formData.append('file', file)
      
      const uploaderName = (typeof appsmith !== 'undefined' && appsmith?.user?.name) 
        ? appsmith.user.name 
        : 'system'
      formData.append('uploadedBy', uploaderName)

      // المرحلة 1
      ExcelImportPipeline.currentStage = 1
      safeStoreValue('importProgress', { stage: 1, total: 6, message: 'جاري تنظيف البيانات...' })
      safeShowAlert(' المرحلة 1/6: تنظيف البيانات...', 'info')

      const response = await fetch('/api/import-excel', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        // تحديث المراحل
        if (Array.isArray(result.stages)) {
          result.stages.forEach((stage, idx) => {
            safeStoreValue('importProgress', { 
              stage: idx + 1, 
              total: 6, 
              message: stage.message 
            })
          })
        }

        // مسح الـ Cache وتحديث البيانات
        if (typeof CacheManager?.clearAllCaches === 'function') {
          CacheManager.clearAllCaches()
        }

        // تشغيل استعلامات Appsmith فوراً لتحديث الواجهة والأرقام الإحصائية
        await refreshAppsmithQueries()
        
        // إعادة بناء القواميس
        if (typeof ProjectManagerMapper?.buildMappingDictionary === 'function') {
          ProjectManagerMapper.buildMappingDictionary()
        }
        if (typeof ContractorPhaseResolver?.buildContractorPhaseMap === 'function') {
          ContractorPhaseResolver.buildContractorPhaseMap()
        }

        // حفظ النتيجة
        safeStoreValue('lastImportResult', {
          fileName: result.fileName || file.name,
          count: result.audit?.processed || 0,
          matched: result.audit?.matched || 0,
          unmatched: result.audit?.unmatched || 0,
          accuracy: result.audit?.accuracy || '0.0',
          timestamp: new Date().toISOString()
        })

        safeStoreValue('importProgress', null)
        safeShowAlert(
          `✅ تم الاستيراد بنجاح!\n` +
          `📊 ${result.audit?.processed || 0} بلاغ معالج\n` +
          `🎯 ${result.audit?.matched || 0} مرتبط بدقة\n` +
          `⚠️ ${result.audit?.unmatched || 0} يحتاج مراجعة\n` +
          `📈 الدقة: ${result.audit?.accuracy || 0}%`,
          'success'
        )

        return result
      } else {
        safeStoreValue('importProgress', null)
        safeShowAlert('❌ فشل الاستيراد: ' + (result.error || 'خطأ غير معروف'), 'error')
        return { success: false, error: result.error }
      }
    } catch (error) {
      safeStoreValue('importProgress', null)
      safeShowAlert('❌ خطأ: ' + error.message, 'error')
      return { success: false, error: error.message }
    }
  },

  rollbackLastImport: async () => {
    try {
      const confirmAction = typeof confirm === 'function' 
        ? confirm('هل تريد التراجع عن آخر استيراد؟') 
        : true

      if (!confirmAction) return { success: false, cancelled: true }

      const response = await fetch('/api/import-rollback', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        if (typeof CacheManager?.clearAllCaches === 'function') {
          CacheManager.clearAllCaches()
        }
        await refreshAppsmithQueries()
        safeStoreValue('lastUploadTime', new Date().toISOString())
        safeShowAlert('✅ تم التراجع وتحديث الواجهة بنجاح', 'success')
        return result
      } else {
        safeShowAlert('❌ فشل التراجع: ' + result.error, 'error')
        return { success: false, error: result.error }
      }
    } catch (error) {
      safeShowAlert('❌ خطأ: ' + error.message, 'error')
      return { success: false, error: error.message }
    }
  },

  getImportStatus: () => {
    const progress = getStoredValue('importProgress')
    if (!progress) return 'جاهز للاستيراد'
    return `⏳ المرحلة ${progress.stage}/${progress.total}: ${progress.message}`
  },

  getLastImportSummary: () => {
    const last = getStoredValue('lastImportResult')
    if (!last) return 'لم يتم استيراد أي ملف بعد'
    return `📥 ${last.fileName} | ${last.count} بلاغ | الدقة: ${last.accuracy}%`
  }
}

export default ExcelImportPipeline
