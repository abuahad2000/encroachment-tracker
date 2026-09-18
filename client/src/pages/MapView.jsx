import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export default function MapView() {
  const [geoData, setGeoData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/layers')
      .then(r => r.json())
      .then(d => {
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

  if (loading) return <div className="text-center py-8">جاري تحميل الخريطة...</div>

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">الخريطة التفاعلية</h1>

      <div style={{ height: '600px', borderRadius: '12px', overflow: 'hidden' }} className="shadow-lg">
        {geoData ? (
          <MapContainer center={[24.7, 46.7]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            {geoData.features && geoData.features.map((feature, i) => {
              if (feature.geometry.type === 'Point') {
                const [lng, lat] = feature.geometry.coordinates
                return (
                  <Marker key={i} position={[lat, lng]} icon={defaultIcon}>
                    <Popup>{feature.properties.name}</Popup>
                  </Marker>
                )
              }
              return null
            })}
          </MapContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            لا توجد بيانات خريطة
          </div>
        )}
      </div>

      <div className="mt-6 card">
        <h2 className="text-lg font-bold mb-4">مفتاح الألوان</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-sm">0-15 يوم</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-500 rounded"></div>
            <span className="text-sm">16-30 يوم</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-sm">31-60 يوم</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-sm">60+ يوم</span>
          </div>
        </div>
      </div>
    </div>
  )
}
