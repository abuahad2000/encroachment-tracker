import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapView() {
  const [rawData, setRawData] = useState(null)
  const [activeTab, setActiveTab] = useState('all') // 'water' | 'sanitation' | 'all'
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/layers')
      .then(r => r.json())
      .then(d => {
        setRawData(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error fetching layers:', e)
        setLoading(false)
      })
  }, [])

  const defaultIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684839.png',
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24]
  })

  // Filter features based on tab and search
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
      return name.includes(q) || op.includes(q) || folder.includes(q)
    })
  }, [rawData, activeTab, searchQuery])

  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {}
    const name = props.name || 'مشروع بدون اسم'
    const isWater = props.sector === 'water' || (props.folder && props.folder.includes('مياه'))
    const sectorLabel = isWater ? '💧 قطاع المياه (جاري)' : '🚰 قطاع الصرف الصحي (جاري)'
    const sectorBg = isWater ? '#0284c7' : '#059669'
    const op = props.operationNumber ? `<div><span style="color:#64748b;font-size:11px;">رقم العملية:</span> <strong style="font-size:12px;">${props.operationNumber}</strong></div>` : ''
    const folder = props.folder ? `<div><span style="color:#64748b;font-size:11px;">التصنيف:</span> <span style="font-size:12px;">${props.folder}</span></div>` : ''

    const content = `
      <div style="direction:rtl;text-align:right;font-family:sans-serif;padding:6px;min-width:200px;">
        <div style="display:inline-block;background:${sectorBg};color:white;font-size:10px;font-weight:bold;padding:2px 8px;border-radius:12px;margin-bottom:6px;">
          ${sectorLabel}
        </div>
        <div style="font-weight:bold;font-size:13px;color:#0f172a;margin-bottom:6px;line-height:1.4;">
          ${name}
        </div>
        ${op}
        ${folder}
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
        fillOpacity: 0.3,
        fillColor: '#38bdf8'
      }
    }

    // Sanitation: Emerald/Green
    return {
      color: '#059669', // Emerald green stroke
      weight: 2.5,
      opacity: 0.85,
      fillOpacity: 0.25,
      fillColor: '#10b981'
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-300 font-medium">جاري تحميل طبقات المشاريع الجارية...</p>
      </div>
    )
  }

  const waterCount = rawData?.stats?.water ?? (rawData?.waterFeatures?.length || 0)
  const sanitationCount = rawData?.stats?.sanitation ?? (rawData?.sanitationFeatures?.length || 0)
  const totalCount = rawData?.stats?.total ?? (rawData?.features?.length || 0)

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>الخريطة الجغرافية للمشاريع الجارية</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            عرض حصري للطبقات الجارية النشطة المعتمدة في الميدان لشركة المياه الوطنية بمدينة الرياض
          </p>
        </div>

        {/* Search */}
        <div className="w-full md:w-72">
          <div className="relative">
            <input
              type="text"
              placeholder="بحث في أسماء المشاريع أو رقم العملية..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
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

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'all'
              ? 'bg-white dark:bg-gray-700 text-primary-700 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>🗺️ كافة المشاريع الجارية</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'all' ? 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200' : 'bg-gray-200 dark:bg-gray-600'}`}>
            {totalCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('water')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'water'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>💧 مشاريع المياه الجارية</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'water' ? 'bg-blue-800 text-white' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'}`}>
            {waterCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sanitation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'sanitation'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/50'
          }`}
        >
          <span>🚰 مشاريع الصرف الصحي الجارية</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'sanitation' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'}`}>
            {sanitationCount}
          </span>
        </button>
      </div>

      {/* Map Container */}
      <div style={{ height: '620px', borderRadius: '16px', overflow: 'hidden' }} className="shadow-xl border border-gray-200 dark:border-gray-700 relative">
        {filteredFeatures.length > 0 ? (
          <MapContainer center={[24.7136, 46.6753]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            />
            {filteredFeatures.map((feature, idx) => {
              if (!feature.geometry) return null

              if (feature.geometry.type === 'Point') {
                const [lng, lat] = feature.geometry.coordinates
                return (
                  <Marker key={`pt-${activeTab}-${idx}`} position={[lat, lng]} icon={defaultIcon}>
                    <Popup>
                      <div className="p-1" style={{ direction: 'rtl' }}>
                        <strong className="text-sm block">{feature.properties?.name}</strong>
                        <span className="text-xs text-gray-500">{feature.properties?.folder}</span>
                      </div>
                    </Popup>
                  </Marker>
                )
              }

              return (
                <GeoJSONLayer
                  key={`geo-${activeTab}-${idx}-${feature.properties?.name || ''}`}
                  data={feature}
                  onEachFeature={onEachFeature}
                  style={getStyle}
                />
              )
            })}
          </MapContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 text-gray-500">
            <p className="text-lg font-bold mb-1">لا توجد طبقات مطابقة للبحث</p>
            <p className="text-sm">حاول تغيير عبارة البحث أو التبديل بين التبويبات أعلاه</p>
          </div>
        )}
      </div>

      {/* Stats and Legend Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 text-xl font-bold">
            💧
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">مشاريع المياه الجارية</div>
            <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{waterCount} مشروعاً</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 text-xl font-bold">
            🚰
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">مشاريع الصرف الجارية</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{sanitationCount} مشروعاً</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 text-xl font-bold">
            📐
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">المعروض على الخريطة</div>
            <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{filteredFeatures.length} طبقة</div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center text-amber-600 text-xl font-bold">
            🛡️
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">حوكمة الطبقات</div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">مقتصرة على الجاري فقط</div>
          </div>
        </div>
      </div>
    </div>
  )
}
