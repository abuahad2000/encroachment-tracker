import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CacheManager } from '../utils/CacheManager'

function MapViewUpdater({ activeTab }) {
  const map = useMap()
  useEffect(() => {
    if (activeTab === 'governorates') {
      map.flyTo([24.2, 45.8], 8, { duration: 1.2 })
    } else {
      map.flyTo([24.7136, 46.6753], 11, { duration: 1.2 })
    }
  }, [activeTab, map])
  return null
}

export default function MapView() {
  const [rawData, setRawData] = useState(null)
  const [reports, setReports] = useState([])
  const [excludedReports, setExcludedReports] = useState([])
  const [programManagersList, setProgramManagersList] = useState([])
  const [showExcludedPins, setShowExcludedPins] = useState(false)
  const [selectedAssignManager, setSelectedAssignManager] = useState({})
  const [isAssigning, setIsAssigning] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('all') // 'capital-water' | 'maintenance-water' | ...
  const [searchQuery, setSearchQuery] = useState('')
  const [showReportPins, setShowReportPins] = useState(true)
  const [pinStatusFilter, setPinStatusFilter] = useState('contractor') // 'contractor' | 'in_progress' | 'all'
  const [selectedManager, setSelectedManager] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchData = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true)
        CacheManager.clearAllCaches()
      }
      const [layersData, reportsData, excludedData, managersData] = await Promise.all([
        fetch('/api/layers').then(r => r.json()),
        CacheManager.getWithCache('reports', () => fetch('/api/reports').then(r => r.json()), 60),
        CacheManager.getWithCache('projects_excluded', () => fetch('/api/projects/excluded').then(r => r.json()).catch(() => []), 120),
        CacheManager.getWithCache('program_managers', () => fetch('/api/program-managers').then(r => r.json()).catch(() => []), 600)
      ])
      setRawData(layersData)
      setReports(reportsData || [])
      setExcludedReports(excludedData || [])
      setProgramManagersList(managersData || [])
      setLoading(false)
    } catch (e) {
      console.error('Error fetching data for map:', e)
      setLoading(false)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleAssignReport = async (reportId) => {
    const targetManagerId = selectedAssignManager[reportId]
    if (!targetManagerId) {
      alert('يرجى اختيار مدير البرنامج أولاً')
      return
    }
    setIsAssigning(true)
    try {
      const res = await fetch('/api/reports/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          targetManagerId,
          assignedBy: 'خريطة النطاقات الجغرافية',
          timestamp: new Date().toISOString()
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        alert('تم إسناد البلاغ بنجاح وتحديث قاعدة البيانات')
        await CacheManager.invalidateCache('reports')
        await CacheManager.invalidateCache('projects_excluded')
        await fetchData(true)
      } else {
        alert('فشل إسناد البلاغ: ' + (data.error || 'خطأ غير معروف'))
      }
    } catch (e) {
      alert('خطأ في الاتصال: ' + e.message)
    } finally {
      setIsAssigning(false)
    }
  }

  // Icon for pending encroachment reports (Amber pin for contractor, Sky pin for in-progress)
  const getReportIcon = (status) => {
    const isContractorPending = status === 'تحت معالجة المقاول'
    const bg = isContractorPending
      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
      : 'linear-gradient(135deg, #0284c7, #0369a1)'
    const symbol = isContractorPending ? '⚠️' : '🔄'
    const shadow = isContractorPending
      ? '0 0 12px rgba(239, 68, 68, 0.8), 0 2px 4px rgba(0,0,0,0.3)'
      : '0 0 12px rgba(2, 132, 199, 0.8), 0 2px 4px rgba(0,0,0,0.3)'

    return L.divIcon({
      className: 'custom-report-pin',
      html: `
        <div style="
          background: ${bg};
          border: 2px solid #ffffff;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          box-shadow: ${shadow};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          animation: pulse 2s infinite;
        ">
          ${symbol}
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14]
    })
  }

  // Icon for excluded projects (Amber pin with 🚫 symbol)
  const getExcludedIcon = () => {
    return L.divIcon({
      className: 'custom-excluded-pin',
      html: `
        <div style="
          background: linear-gradient(135deg, #f59e0b, #d97706);
          border: 2px solid #ffffff;
          border-radius: 50%;
          width: 26px;
          height: 26px;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.8), 0 2px 4px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 13px;
          cursor: pointer;
        ">
          🚫
        </div>
      `,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    })
  }

  // Active matched encroachment reports with valid coordinates (both under contractor and in-progress)
  const pendingReports = useMemo(() => {
    return (reports || []).filter(r =>
      !r.excluded &&
      r.matched &&
      r.project &&
      r.status !== 'تمت المعالجة' &&
      r.longitude &&
      r.latitude &&
      r.longitude !== 0 &&
      r.latitude !== 0
    )
  }, [reports])

  // تحت معالجة المقاول فقط (118 بلاغاً)
  const contractorPendingReports = useMemo(() => {
    return pendingReports.filter(r => r.actionCategory === 'تحت معالجة المقاول')
  }, [pendingReports])

  // تحت الإجراء (17 بلاغاً)
  const inProgressReports = useMemo(() => {
    return pendingReports.filter(r => r.actionCategory === 'تحت الإجراء')
  }, [pendingReports])

  // Extract unique program managers from pending reports filtered by sector
  const availableManagers = useMemo(() => {
    const set = new Set()
    let pool = pinStatusFilter === 'contractor' ? contractorPendingReports : pendingReports
    if (activeTab === 'water') {
      pool = pool.filter(r => {
        const sec = r.sector || ''
        const sub = r.project?.subProgram || ''
        const pName = r.project?.name || ''
        return sec === 'مياه' || sub.includes('مياه') || (pName.includes('مياه') && !pName.includes('صرف'))
      })
    } else if (activeTab === 'sanitation') {
      pool = pool.filter(r => {
        const sec = r.sector || ''
        const sub = r.project?.subProgram || ''
        const pName = r.project?.name || ''
        return sec === 'صرف' || sub.includes('صرف') || pName.includes('صرف')
      })
    } else if (activeTab === 'governorates') {
      pool = pool.filter(r => {
        const isGov = r.city && !r.city.includes('الرياض')
        const pSub = r.project?.subProgram || ''
        const pScope = r.project?.scope || ''
        const pMgr = r.project?.programManager || ''
        return isGov || pSub.includes('المحافظات') || pScope.includes('محافظ') || ['فهد العنزي', 'سعيد الحارث', 'شاكر الحقباني', 'علي القحطاني'].includes(pMgr)
      })
    }

    pool.forEach(r => {
      if (r.project?.programManager) {
        set.add(r.project.programManager)
      }
    })
    return Array.from(set).sort()
  }, [pendingReports, contractorPendingReports, pinStatusFilter, activeTab])

  // Reset selected manager if not present in current sector's managers
  useEffect(() => {
    if (selectedManager !== 'all' && !availableManagers.includes(selectedManager)) {
      setSelectedManager('all')
    }
  }, [activeTab, availableManagers, selectedManager])

  // Filtered reports by sector (activeTab), status filter, selected manager & search query
  const displayedReportPins = useMemo(() => {
    if (!showReportPins) return []

    let list = pendingReports
    if (pinStatusFilter === 'contractor') {
      list = contractorPendingReports
    } else if (pinStatusFilter === 'in_progress') {
      list = inProgressReports
    }

    // 1. Strict sector filtering
    if (activeTab === 'water') {
      list = list.filter(r => {
        const sec = r.sector || ''
        const sub = r.project?.subProgram || ''
        const pName = r.project?.name || ''
        return sec === 'مياه' || sub.includes('مياه') || (pName.includes('مياه') && !pName.includes('صرف'))
      })
    } else if (activeTab === 'sanitation') {
      list = list.filter(r => {
        const sec = r.sector || ''
        const sub = r.project?.subProgram || ''
        const pName = r.project?.name || ''
        return sec === 'صرف' || sub.includes('صرف') || pName.includes('صرف')
      })
    } else if (activeTab === 'governorates') {
      list = list.filter(r => {
        const isGov = r.city && !r.city.includes('الرياض')
        const pSub = r.project?.subProgram || ''
        const pScope = r.project?.scope || ''
        const pMgr = r.project?.programManager || ''
        return isGov || pSub.includes('المحافظات') || pScope.includes('محافظ') || ['فهد العنزي', 'سعيد الحارث', 'شاكر الحقباني', 'علي القحطاني'].includes(pMgr)
      })
    }

    // 2. Manager filtering
    if (selectedManager !== 'all') {
      list = list.filter(r => r.project?.programManager === selectedManager)
    }

    // 3. Search query
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase().trim()
    return list.filter(r => {
      const idStr = String(r.id)
      const dist = (r.district || r.city || '').toLowerCase()
      const proj = (r.project?.name || '').toLowerCase()
      const cont = (r.contractorName || r.project?.contractor || '').toLowerCase()
      const mgr = (r.project?.programManager || '').toLowerCase()
      const pmgr = (r.project?.projectManager || '').toLowerCase()
      return idStr.includes(q) || dist.includes(q) || proj.includes(q) || cont.includes(q) || mgr.includes(q) || pmgr.includes(q)
    })
  }, [pendingReports, contractorPendingReports, inProgressReports, pinStatusFilter, showReportPins, activeTab, selectedManager, searchQuery])

  const classifyProjectPhase = (props) => {
    if (!props) return 'unknown'
    const status = (props.status || '').toLowerCase()
    const phase = (props.phase || '').toLowerCase()
    const type = (props.type || '').toLowerCase()
    const name = (props.name || props.projectName || '').toLowerCase()
    const folder = (props.folder || '').toLowerCase()

    if (status.includes('مسلم') || status.includes('صيانة') || status.includes('maintenance') || status.includes('handover') ||
        phase === 'maintenance' || phase === 'handover' || type === 'maintenance' || folder.includes('صيانة') || folder.includes('مسلم') ||
        name.includes('صيانة') || name.includes('إحلال') || name.includes('تجديد') || name.includes('تشغيل')) {
      return 'maintenance'
    }

    if (status.includes('جاري') || status.includes('ongoing') || type === 'capital' || phase === 'ongoing' ||
        name.includes('تنفيذ') || name.includes('إنشاء') || name.includes('عقد استكمال') || name.includes('مشروع')) {
      return 'capital'
    }

    return 'capital'
  }

  // Filter polygon/linestring features based on tab and search
  const filteredFeatures = useMemo(() => {
    if (!rawData) return []

    let list = rawData.features || []

    if (activeTab === 'governorates') {
      list = rawData.governoratesFeatures || []
    } else if (activeTab !== 'all') {
      const [phase, sector] = activeTab.split('-')
      list = (rawData.features || []).filter(f => {
        const featurePhase = classifyProjectPhase(f.properties)
        const isWater = (f.properties?.sector || f.properties?.folder || f.properties?.name || '').includes('مياه')
        const featureSector = isWater ? 'water' : 'sanitation'
        return featurePhase === phase && featureSector === sector
      })
    }

    if (!searchQuery.trim()) return list

    const q = searchQuery.toLowerCase().trim()
    return list.filter(f => {
      const name = (f.properties?.name || '').toLowerCase()
      const op = (f.properties?.operationNumber || '').toLowerCase()
      const folder = (f.properties?.folder || '').toLowerCase()
      const prog = (f.properties?.programManager || '').toLowerCase()
      const proj = (f.properties?.projectManager || '').toLowerCase()
      const cont = (f.properties?.contractor || '').toLowerCase()
      return name.includes(q) || op.includes(q) || folder.includes(q) || prog.includes(q) || proj.includes(q) || cont.includes(q)
    })
  }, [rawData, activeTab, searchQuery])

  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {}
    const name = props.projectName || props.name || 'مشروع بدون اسم'
    const isGov = props.isGovernorate || (props.subProgram && props.subProgram.includes('المحافظات'))
    const phase = classifyProjectPhase(props)
    const phaseLabel = phase === 'capital' ? '🏗️ مشروع رأسمالي (جاري)' :
                       phase === 'maintenance' ? '🔧 مشروع صيانة (مسلم)' :
                       '❓ غير مصنف'
    const phaseColor = phase === 'capital' ? '#059669' :
                       phase === 'maintenance' ? '#f59e0b' : '#ef4444'

    let sectorLabel = ''
    let sectorBg = '#0284c7'

    if (isGov) {
      const isWater = props.sector === 'water' || (props.name && props.name.includes('مياه'))
      sectorLabel = isWater ? '🏛️ نطاق المحافظات (مياه)' : '🏛️ نطاق المحافظات (صرف صحي)'
      sectorBg = isWater ? '#d97706' : '#7c3aed'
    } else {
      const isWater = props.sector === 'water' || (props.folder && props.folder.includes('مياه')) || (props.subProgram && props.subProgram.includes('مياه'))
      sectorLabel = isWater ? '💧 قطاع المياه' : '🚰 قطاع الصرف الصحي'
      sectorBg = isWater ? '#0284c7' : '#059669'
    }

    const op = props.operationNumber ? `<div><span style="color:#64748b;font-size:11px;">رقم العملية:</span> <strong style="font-size:12px;">${props.operationNumber}</strong></div>` : ''
    const po = props.po && props.po !== '-' ? `<div><span style="color:#64748b;font-size:11px;">أمر الشراء (PO):</span> <strong style="font-size:12px;color:#1e40af;">${props.po}</strong></div>` : ''
    const progMgr = props.programManager && props.programManager !== '-' ? `<div><span style="color:#64748b;font-size:11px;">مدير البرنامج:</span> <strong style="font-size:12px;color:#0284c7;">${props.programManager}</strong></div>` : ''
    const projMgr = props.projectManager && props.projectManager !== '-' ? `<div><span style="color:#64748b;font-size:11px;">مدير المشروع (NWC):</span> <strong style="font-size:12px;color:#0f766e;">${props.projectManager}</strong></div>` : ''
    const contractor = props.contractor && props.contractor !== '-' ? `<div><span style="color:#64748b;font-size:11px;">المقاول:</span> <strong style="font-size:12px;color:#b45309;">${props.contractor}</strong></div>` : ''
    const status = props.status ? `<div><span style="color:#64748b;font-size:11px;">حالة المشروع:</span> <span style="background:#e2e8f0;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:bold;">${props.status}</span></div>` : ''
    const scope = props.scope ? `<div><span style="color:#64748b;font-size:11px;">النطاق:</span> <span style="font-size:11px;">${props.scope}</span></div>` : ''

    const content = `
      <div style="direction:rtl;text-align:right;font-family:sans-serif;padding:6px;min-width:240px;line-height:1.5;">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
          <span style="background:${phaseColor};color:white;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;">
            ${phaseLabel}
          </span>
          <span style="background:${sectorBg};color:white;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;">
            ${sectorLabel}
          </span>
        </div>
        <div style="font-weight:bold;font-size:13px;color:#0f172a;margin-bottom:6px;line-height:1.4;">
          ${name}
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px;">
          ${progMgr}
          ${projMgr}
          ${contractor}
          ${op}
          ${po}
          ${status}
          ${scope}
        </div>
      </div>
    `
    layer.bindPopup(content)
  }

  const getStyle = (feature) => {
    if (!feature?.geometry) return {}
    if (feature.geometry.type === 'Point') return {}

    if (feature.properties?.isGovernorate) {
      const isWater = feature.properties?.sector === 'water' || feature.properties?.name?.includes('مياه')
      return {
        color: isWater ? '#d97706' : '#7c3aed', // Amber for water, Violet for sanitation
        weight: 2.5,
        opacity: 0.9,
        fillOpacity: 0.28,
        fillColor: isWater ? '#fbbf24' : '#a78bfa'
      }
    }

    const phase = classifyProjectPhase(feature.properties)
    const isWater = (feature.properties?.sector || feature.properties?.folder || feature.properties?.name || '').includes('مياه')

    if (phase === 'capital') {
      // مشاريع رأسمالية: ألوان زاهية وواضحة
      return {
        color: isWater ? '#0284c7' : '#059669', // أزرق للمياه، أخضر للصرف
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0.3,
        fillColor: isWater ? '#38bdf8' : '#10b981'
      }
    } else if (phase === 'maintenance') {
      // مشاريع صيانة وتسليم: ألوان هادئة بخطوط متقطعة
      return {
        color: isWater ? '#94a3b8' : '#6b7280',
        weight: 2,
        opacity: 0.7,
        dashArray: '5, 5',
        fillOpacity: 0.18,
        fillColor: isWater ? '#cbd5e1' : '#9ca3af'
      }
    }

    // غير مصنف
    return {
      color: '#ef4444',
      weight: 2,
      opacity: 0.5,
      fillOpacity: 0.12,
      fillColor: '#fca5a5'
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300 font-medium">جاري تحميل الخريطة وطبقات المشاريع والبلاغات...</p>
      </div>
    )
  }

  const capitalWaterCount = useMemo(() => (rawData?.waterFeatures || []).filter(f => classifyProjectPhase(f.properties) === 'capital').length, [rawData])
  const maintenanceWaterCount = useMemo(() => (rawData?.waterFeatures || []).filter(f => classifyProjectPhase(f.properties) === 'maintenance').length, [rawData])
  const capitalSanitationCount = useMemo(() => (rawData?.sanitationFeatures || []).filter(f => classifyProjectPhase(f.properties) === 'capital').length, [rawData])
  const maintenanceSanitationCount = useMemo(() => (rawData?.sanitationFeatures || []).filter(f => classifyProjectPhase(f.properties) === 'maintenance').length, [rawData])

  const waterCount = rawData?.stats?.water ?? (rawData?.waterFeatures?.length || 0)
  const sanitationCount = rawData?.stats?.sanitation ?? (rawData?.sanitationFeatures?.length || 0)
  const governoratesCount = rawData?.stats?.governorates ?? (rawData?.governoratesFeatures?.length || 0)
  const totalCount = rawData?.stats?.total ?? (rawData?.features?.length || 0)

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>الخريطة الجغرافية الشاملة للمشاريع ونقاط البلاغات</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            فصل المشاريع الرأسمالية الجارية عن مشاريع الصيانة والتسليم الابتدائي مع نقاط بلاغات التعدي
          </p>
        </div>

        {/* Actions & Search */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50"
            title="تحديث الخريطة ومسح الذاكرة المؤقتة"
          >
            <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
            <span>{refreshing ? 'جاري التحديث...' : 'تحديث الخريطة (مسح Cache)'}</span>
          </button>

          <div className="w-full sm:w-72">
            <div className="relative">
              <input
                type="text"
                placeholder="بحث في المشاريع، المقاول، أو البلاغ..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Layer Tabs & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-2 bg-gray-100 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700">
        {/* Separated Layer Tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🗺️ الكل</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200' : 'bg-gray-200 dark:bg-gray-600'}`}>
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('capital-water')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'capital-water'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>💧 مياه - رأسمالي</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'capital-water' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
              {capitalWaterCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('maintenance-water')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'maintenance-water'
                ? 'bg-slate-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🛠️ مياه - صيانة</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'maintenance-water' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800 dark:bg-slate-900 dark:text-slate-200'}`}>
              {maintenanceWaterCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('capital-sanitation')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'capital-sanitation'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🚰 صرف - رأسمالي</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'capital-sanitation' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
              {capitalSanitationCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('maintenance-sanitation')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'maintenance-sanitation'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🔧 صرف - صيانة</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'maintenance-sanitation' ? 'bg-purple-800 text-white' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200'}`}>
              {maintenanceSanitationCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('governorates')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'governorates'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🏛️ نطاق المحافظات</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'governorates' ? 'bg-amber-800 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>
              {governoratesCount}
            </span>
          </button>
        </div>

        {/* Encroachment Report Pin Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Pins Button */}
          <button
            onClick={() => setShowReportPins(!showReportPins)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              showReportPins
                ? 'bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-900'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <span>📍</span>
            <span>{showReportPins ? 'إخفاء النقاط' : 'إظهار نقاط البلاغات'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${showReportPins ? 'bg-red-800 text-white font-mono' : 'bg-gray-200 dark:bg-gray-600'}`}>
              {displayedReportPins.length}
            </span>
          </button>

          {/* Toggle Excluded Projects Layer Button */}
          <button
            onClick={() => setShowExcludedPins(!showExcludedPins)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              showExcludedPins
                ? 'bg-amber-600 text-white ring-2 ring-amber-300 dark:ring-amber-900'
                : 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
            }`}
            title="إظهار البلاغات المستبعدة من النطاق مع إمكانية إعادة الإسناد والتحديث الحقيقي"
          >
            <span>🚫</span>
            <span>{showExcludedPins ? 'إخفاء المستبعدة' : 'المشاريع المستبعدة'}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${showExcludedPins ? 'bg-amber-800 text-white font-mono' : 'bg-amber-100 dark:bg-amber-950'}`}>
              {excludedReports.length}
            </span>
          </button>

          {/* Status Filter Tabs for Pins */}
          {showReportPins && (
            <div className="flex items-center bg-white dark:bg-gray-700 p-0.5 rounded-xl border border-gray-300 dark:border-gray-600 text-[11px]">
              <button
                onClick={() => setPinStatusFilter('contractor')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  pinStatusFilter === 'contractor'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
                title="عرض البلاغات التي تحت معالجة المقاول فقط (مطابق لتقرير الإدارة)"
              >
                <span>⚠️ تحت معالجة المقاول</span>
                <span className={`text-[10px] px-1 rounded-full ${pinStatusFilter === 'contractor' ? 'bg-red-800 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>
                  {contractorPendingReports.length}
                </span>
              </button>

              <button
                onClick={() => setPinStatusFilter('in_progress')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  pinStatusFilter === 'in_progress'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
                title="عرض البلاغات التي تحت الإجراء"
              >
                <span>🔄 تحت الإجراء</span>
                <span className={`text-[10px] px-1 rounded-full ${pinStatusFilter === 'in_progress' ? 'bg-sky-800 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>
                  {inProgressReports.length}
                </span>
              </button>

              <button
                onClick={() => setPinStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  pinStatusFilter === 'all'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900'
                }`}
                title="عرض كافة البلاغات النشطة"
              >
                <span>الكل</span>
                <span className={`text-[10px] px-1 rounded-full ${pinStatusFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>
                  {pendingReports.length}
                </span>
              </button>
            </div>
          )}

          {/* Manager Filter */}
          {showReportPins && (
            <select
              value={selectedManager}
              onChange={e => setSelectedManager(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500 font-medium"
            >
              <option value="all">كافة مدراء البرامج ({availableManagers.length})</option>
              {availableManagers.map(mgr => {
                const count = (pinStatusFilter === 'contractor' ? contractorPendingReports : (pinStatusFilter === 'in_progress' ? inProgressReports : pendingReports)).filter(r => r.project?.programManager === mgr).length
                return (
                  <option key={mgr} value={mgr}>
                    {mgr} ({count})
                  </option>
                )
              })}
            </select>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div style={{ height: '640px', borderRadius: '20px', overflow: 'hidden' }} className="shadow-2xl border border-gray-200 dark:border-gray-700 relative">
        <MapContainer center={[24.7136, 46.6753]} zoom={11} style={{ height: '100%', width: '100%' }}>
          <MapViewUpdater activeTab={activeTab} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          />

          {/* 1. KMZ Polygons / Linestrings of ongoing projects */}
          {filteredFeatures.map((feature, idx) => {
            if (!feature.geometry || feature.geometry.type === 'Point') return null
            return (
              <GeoJSONLayer
                key={`geo-${activeTab}-${idx}-${feature.properties?.name || ''}`}
                data={feature}
                onEachFeature={onEachFeature}
                style={getStyle}
              />
            )
          })}

          {/* 2. Pending Encroachment Report Markers */}
          {displayedReportPins.map(r => {
            const effectiveContractor = r.contractorName || r.project?.contractor || 'غير محدد'

            const isContractorPending = r.status === 'تحت معالجة المقاول'

            return (
              <Marker
                key={`report-pin-${r.id}`}
                position={[r.latitude, r.longitude]}
                icon={getReportIcon(r.status)}
              >
                <Popup>
                  <div style={{ direction: 'rtl', textAlign: 'right', fontFamily: 'sans-serif', minWidth: '240px', padding: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{
                        background: isContractorPending ? '#fee2e2' : '#e0f2fe',
                        color: isContractorPending ? '#991b1b' : '#075985',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '2px 8px',
                        borderRadius: '10px'
                      }}>
                        {isContractorPending ? `⚠️ معلق (المقاول) #${r.id}` : `🔄 تحت الإجراء #${r.id}`}
                      </span>
                      <span style={{ fontSize: '10px', color: isContractorPending ? '#dc2626' : '#0284c7', fontWeight: 'bold' }}>
                        {r.ageDays} يوم تأخير
                      </span>
                    </div>

                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                      {r.district || r.city} {r.street ? `- ${r.street}` : ''}
                    </div>

                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b' }}>مدير البرنامج:</strong> <span style={{ color: '#0284c7', fontWeight: 'bold' }}>{r.programManager || r.project?.programManager || '-'}</span>
                    </div>

                    {r.project?.projectManager && r.project.projectManager !== '-' && (
                      <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                        <strong style={{ color: '#1e293b' }}>مدير المشروع:</strong> <span style={{ color: '#0f766e', fontWeight: 'bold' }}>{r.project.projectManager}</span>
                      </div>
                    )}

                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b' }}>المشروع المسند:</strong> {r.project?.name}
                    </div>

                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b' }}>المقاول:</strong> <strong style={{ color: '#b45309' }}>{effectiveContractor}</strong>
                    </div>

                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b' }}>الحالة:</strong> <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>{r.status}</span>
                    </div>

                    {r.description && (
                      <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #e2e8f0', fontSize: '10px', color: '#64748b', maxHeight: '60px', overflowY: 'auto' }}>
                        {r.description}
                      </div>
                    )}

                    {r.latitude && r.longitude && (
                      <a
                        href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          width: '100%',
                          marginTop: '8px',
                          padding: '6px 12px',
                          background: '#2563eb',
                          color: '#ffffff',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textDecoration: 'none',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
                        }}
                      >
                        <span>📍</span>
                        <span>فتح الموقع في خرائط Google</span>
                      </a>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Excluded Projects Layer with Assignment Mechanism */}
          {showExcludedPins && excludedReports.map((r, idx) => {
            if (!r.latitude || !r.longitude) return null
            const reportId = r.id || idx
            return (
              <Marker
                key={`ex-${reportId}`}
                position={[r.latitude, r.longitude]}
                icon={getExcludedIcon()}
              >
                <Popup>
                  <div style={{ direction: 'rtl', textAlign: 'right', fontFamily: 'sans-serif', minWidth: '260px', padding: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                        🚫 بلاغ مستبعد #{r.id}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>{r.city}</span>
                    </div>

                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                      {r.name || `بلاغ #${r.id}`}
                    </div>

                    <div style={{ fontSize: '11px', color: '#334155', marginBottom: '2px' }}>
                      <strong>الحي:</strong> {r.district || 'غير محدد'}
                    </div>

                    <div style={{ fontSize: '11px', color: '#334155', marginBottom: '2px' }}>
                      <strong>المقاول:</strong> {r.contractor || 'غير محدد'}
                    </div>

                    <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '6px', borderRadius: '6px', margin: '6px 0', border: '1px solid #fecaca' }}>
                      <strong>سبب الاستبعاد:</strong> {r.excludedReason || 'مستبعد من النطاق'}
                    </div>

                    {/* Assignment Mechanism */}
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e293b', display: 'block', marginBottom: '4px' }}>
                        إسناد لمدير برنامج:
                      </label>
                      <select
                        value={selectedAssignManager[r.id] || ''}
                        onChange={(e) => setSelectedAssignManager(prev => ({ ...prev, [r.id]: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          marginBottom: '8px',
                          direction: 'rtl'
                        }}
                      >
                        <option value="">-- اختر مدير البرنامج --</option>
                        {programManagersList.map((mgr) => (
                          <option key={mgr} value={mgr}>{mgr}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleAssignReport(r.id)}
                        disabled={isAssigning || !selectedAssignManager[r.id]}
                        style={{
                          width: '100%',
                          padding: '6px 12px',
                          background: selectedAssignManager[r.id] ? '#10b981' : '#94a3b8',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: selectedAssignManager[r.id] ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          boxShadow: selectedAssignManager[r.id] ? '0 1px 3px rgba(16, 185, 129, 0.3)' : 'none'
                        }}
                      >
                        <span>{isAssigning ? '⏳' : '✅'}</span>
                        <span>{isAssigning ? 'جاري الإسناد في قاعدة البيانات...' : 'إسناد البلاغ وتثبيته'}</span>
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

        {/* Map Legend */}
        <div style={{ position: 'absolute', bottom: '20px', right: '20px', background: 'rgba(255, 255, 255, 0.95)', padding: '10px 14px', borderRadius: '12px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)', zIndex: 1000, fontSize: '11px', direction: 'rtl', backdropFilter: 'blur(4px)', border: '1px solid rgba(226, 232, 240, 0.8)' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#0f172a', fontSize: '12px' }}>مفتاح الخريطة</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ width: '20px', height: '4px', background: '#0284c7', borderRadius: '2px' }}></div>
            <span style={{ color: '#1e293b', fontWeight: '600' }}>مياه - رأسمالي</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ width: '20px', height: '3px', background: '#94a3b8', borderRadius: '2px' }}></div>
            <span style={{ color: '#64748b' }}>مياه - صيانة</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
            <div style={{ width: '20px', height: '4px', background: '#059669', borderRadius: '2px' }}></div>
            <span style={{ color: '#1e293b', fontWeight: '600' }}>صرف - رأسمالي</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '20px', height: '3px', background: '#6b7280', borderRadius: '2px' }}></div>
            <span style={{ color: '#64748b' }}>صرف - صيانة</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-950/60 flex items-center justify-center text-red-600 text-2xl font-bold">
            📍
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">بلاغات التعدي المعلقة بالخريطة</div>
            <div className="text-xl font-extrabold text-red-600 dark:text-red-400">{displayedReportPins.length} بلاغاً</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 text-2xl font-bold">
            💧
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">مشاريع المياه الجارية</div>
            <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{waterCount} مشروعاً</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 text-2xl font-bold">
            🚰
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">مشاريع الصرف الجارية</div>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{sanitationCount} مشروعاً</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 text-2xl font-bold">
            👥
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">مدراء البرامج الممثلون</div>
            <div className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{availableManagers.length} مدراء</div>
          </div>
        </div>
      </div>
    </div>
  )
}
