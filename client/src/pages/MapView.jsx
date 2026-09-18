import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapView() {
  const [geoData, setGeoData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/layers')
      .then(r => r.json())
      .then(d => {
        console.log('✓ Loaded', d.features?.length, 'features')
        setGeoData(d)
        setLoading(false)
      })
      .catch(e => {
        console.error('Error:', e)
        setLoading(false)
      })
  }, [])

  const defaultIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684839.png',
    iconSize: [24, 24],
  })

  const onEachFeature = (feature, layer) => {
    const name = feature.properties?.name || 'Unknown'
    layer.bindPopup(`<div style="direction:rtl"><strong>${name}</strong></div>`)
  }

  const getStyle = (feature) => {
    if (!feature?.geometry) return {}
    if (feature.geometry.type === 'Point') return {}

    const colors = ['#0066cc', '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24']
    const color = colors[Math.floor(Math.random() * colors.length)]

    return {
      color,
      weight: 2,
      opacity: 0.7,
      fillOpacity: 0.2,
      fillColor: color
    }
  }

  if (loading) {
    return <div className="text-center py-12">جاري تحميل الخريطة...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">الخريطة التفاعلية</h1>

      <div style={{ height: '600px', borderRadius: '12px', overflow: 'hidden' }} className="shadow-lg mb-6">
        {geoData?.features?.length > 0 ? (
          <MapContainer center={[24.7, 46.7]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            {geoData.features.map((feature, idx) => {
              if (!feature.geometry) return null

              // Points as markers
              if (feature.geometry.type === 'Point') {
                const [lng, lat] = feature.geometry.coordinates
                return (
                  <Marker key={`point-${idx}`} position={[lat, lng]} icon={defaultIcon}>
                    <Popup>{feature.properties?.name}</Popup>
                  </Marker>
                )
              }

              // Lines and polygons as GeoJSON
              return (
                <GeoJSONLayer
                  key={`geo-${idx}`}
                  data={feature}
                  onEachFeature={onEachFeature}
                  style={getStyle}
                />
              )
            })}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div>
              <p className="text-lg mb-2">لا توجد بيانات خريطة</p>
              <p className="text-sm text-gray-500">عدد الطبقات: {geoData?.features?.length || 0}</p>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-4">معلومات الخريطة</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-semibold text-gray-600 dark:text-gray-400">إجمالي الطبقات:</span>
            <p className="text-lg font-bold text-blue-600">{geoData?.features?.length || 0}</p>
          </div>
          <div>
            <span className="font-semibold text-gray-600 dark:text-gray-400">المركز:</span>
            <p>الرياض (24.7°N, 46.7°E)</p>
          </div>
          <div>
            <span className="font-semibold text-gray-600 dark:text-gray-400">مصدر الخريطة:</span>
            <p>OpenStreetMap</p>
          </div>
        </div>
      </div>
    </div>
  )
}
