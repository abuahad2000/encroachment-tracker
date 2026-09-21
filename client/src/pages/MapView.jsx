import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapView() {
  const [rawData, setRawData] = useState(null)
  const [reports, setReports] = useState([])
  const [activeTab, setActiveTab] = useState('all') // 'water' | 'sanitation' | 'all'
  const [searchQuery, setSearchQuery] = useState('')
  const [showReportPins, setShowReportPins] = useState(true)
  const [selectedManager, setSelectedManager] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/layers').then(r => r.json()),
      fetch('/api/reports').then(r => r.json())
    ])
      .then(([layersData, reportsData]) => {
        setRawData(layersData)
        setReports(reportsData || [])
        setLoading(false)
      })
      .catch(e => {
        console.error('Error fetching data for map:', e)
        setLoading(false)
      })
  }, [])

  // Icon for pending encroachment reports (Eye-catching red/amber marker)
  const reportIcon = L.divIcon({
    className: 'custom-report-pin',
    html: `
      <div style="
        background: linear-gradient(135deg, #ef4444, #dc2626);
        border: 2px solid #ffffff;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.8), 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        animation: pulse 2s infinite;
      ">
        ⚠️
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14]
  })

  // Pending matched encroachment reports with valid coordinates
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

  // Extract unique program managers from pending reports filtered by sector
  const availableManagers = useMemo(() => {
    const set = new Set()
    let pool = pendingReports
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
    }

    pool.forEach(r => {
      if (r.project?.programManager) {
        set.add(r.project.programManager)
      }
    })
    return Array.from(set).sort()
  }, [pendingReports, activeTab])

  // Reset selected manager if not present in current sector's managers
  useEffect(() => {
    if (selectedManager !== 'all' && !availableManagers.includes(selectedManager)) {
      setSelectedManager('all')
    }
  }, [activeTab, availableManagers, selectedManager])

  // Filtered reports by sector (activeTab), selected manager & search query
  const displayedReportPins = useMemo(() => {
    if (!showReportPins) return []

    let list = pendingReports

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
  }, [pendingReports, showReportPins, activeTab, selectedManager, searchQuery])

  // Filter polygon/linestring features based on tab and search
  const filteredFeatures = useMemo(() => {
    if (!rawData) return []

    let list = []
    if (activeTab === 'water') {
      list = rawData.waterFeatures || []
    } else if (activeTab === 'sanitation') {
      list = rawData.sanitationFeatures || []
    } else {
      list = rawData.features || []
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
    const name = props.name || 'مشروع بدون اسم'
    const isWater = props.sector === 'water' || (props.folder && props.folder.includes('مياه')) || (props.subProgram && props.subProgram.includes('مياه'))
    const sectorLabel = isWater ? '💧 قطاع المياه (جاري)' : '🚰 قطاع الصرف الصحي (جاري)'
    const sectorBg = isWater ? '#0284c7' : '#059669'

    const op = props.operationNumber ? `<div><span style="color:#64748b;font-size:11px;">رقم العملية:</span> <strong style="font-size:12px;">${props.operationNumber}</strong></div>` : ''
    const po = props.po && props.po !== '-' ? `<div><span style="color:#64748b;font-size:11px;">أمر الشراء (PO):</span> <strong style="font-size:12px;color:#1e40af;">${props.po}</strong></div>` : ''
    const progMgr = props.programManager && props.programManager !== '-' ? `<div><span style="color:#64748b;font-size:11px;">مدير البرنامج:</span> <strong style="font-size:12px;color:#0284c7;">${props.programManager}</strong></div>` : ''
    const projMgr = props.projectManager && props.projectManager !== '-' ? `<div><span style="color:#64748b;font-size:11px;">مدير المشروع (NWC):</span> <strong style="font-size:12px;color:#0f766e;">${props.projectManager}</strong></div>` : ''
    const contractor = props.contractor && props.contractor !== '-' ? `<div><span style="color:#64748b;font-size:11px;">المقاول:</span> <strong style="font-size:12px;color:#b45309;">${props.contractor}</strong></div>` : ''
    const status = props.status ? `<div><span style="color:#64748b;font-size:11px;">حالة المشروع:</span> <span style="background:#e2e8f0;padding:1px 6px;border-radius:6px;font-size:10px;font-weight:bold;">${props.status}</span></div>` : ''
    const scope = props.scope ? `<div><span style="color:#64748b;font-size:11px;">النطاق:</span> <span style="font-size:11px;">${props.scope}</span></div>` : ''

    const content = `
      <div style="direction:rtl;text-align:right;font-family:sans-serif;padding:6px;min-width:240px;line-height:1.5;">
        <div style="display:inline-block;background:${sectorBg};color:white;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;margin-bottom:6px;">
          ${sectorLabel}
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

    const isWater = feature.properties?.sector === 'water' || (feature.properties?.folder && feature.properties?.folder.includes('مياه'))

    if (isWater) {
      return {
        color: '#0284c7', // Sky blue stroke
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0.28,
        fillColor: '#38bdf8'
      }
    }

    // Sanitation: Emerald/Green
    return {
      color: '#059669', // Emerald green stroke
      weight: 2.5,
      opacity: 0.85,
      fillOpacity: 0.22,
      fillColor: '#10b981'
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

  const waterCount = rawData?.stats?.water ?? (rawData?.waterFeatures?.length || 0)
  const sanitationCount = rawData?.stats?.sanitation ?? (rawData?.sanitationFeatures?.length || 0)
  const totalCount = rawData?.stats?.total ?? (rawData?.features?.length || 0)

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>الخريطة الجغرافية الشاملة للمشاريع الجارية ونقاط البلاغات</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            عرض طبقات المشاريع الجارية المعتمدة بـ KMZ مع نقاط بلاغات التعدي المعلقة المسندة لمدراء البرامج
          </p>
        </div>

        {/* Search */}
        <div className="w-full lg:w-80">
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

      {/* Layer Tabs & Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-2 bg-gray-100 dark:bg-gray-800/90 rounded-2xl border border-gray-200 dark:border-gray-700">
        {/* Sector Tabs */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🗺️ كافة المشاريع الجارية</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200' : 'bg-gray-200 dark:bg-gray-600'}`}>
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('water')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'water'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>💧 مشاريع المياه</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'water' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
              {waterCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sanitation')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'sanitation'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
            }`}
          >
            <span>🚰 مشاريع الصرف</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'sanitation' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
              {sanitationCount}
            </span>
          </button>
        </div>

        {/* Encroachment Report Pin Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Pins Button */}
          <button
            onClick={() => setShowReportPins(!showReportPins)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              showReportPins
                ? 'bg-red-600 text-white ring-2 ring-red-300 dark:ring-red-900'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600'
            }`}
          >
            <span>📍</span>
            <span>نقاط البلاغات المعلقة</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${showReportPins ? 'bg-red-800 text-white' : 'bg-gray-200 dark:bg-gray-600'}`}>
              {displayedReportPins.length}
            </span>
          </button>

          {/* Manager Filter */}
          {showReportPins && (
            <select
              value={selectedManager}
              onChange={e => setSelectedManager(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="all">كافة مدراء البرامج ({pendingReports.length})</option>
              {availableManagers.map(mgr => {
                const count = pendingReports.filter(r => r.project?.programManager === mgr).length
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

            return (
              <Marker
                key={`report-pin-${r.id}`}
                position={[r.latitude, r.longitude]}
                icon={reportIcon}
              >
                <Popup>
                  <div style={{ direction: 'rtl', textAlign: 'right', fontFamily: 'sans-serif', minWidth: '240px', padding: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px' }}>
                        ⚠️ بلاغ تعدي معلق #{r.id}
                      </span>
                      <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 'bold' }}>
                        {r.ageDays} يوم تأخير
                      </span>
                    </div>

                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a', marginBottom: '4px' }}>
                      {r.district || r.city} {r.street ? `- ${r.street}` : ''}
                    </div>

                    <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b' }}>مدير البرنامج:</strong> <span style={{ color: '#0284c7', fontWeight: 'bold' }}>{r.project?.programManager || '-'}</span>
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
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
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
