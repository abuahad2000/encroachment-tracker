import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// بسيط جداً: تحويل KML إلى GeoJSON (بدون مكتبة KML محترفة)
function kmlToGeoJSON(kmlString) {
  const features = []

  // استخراج جميع Placemarks
  const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g
  let match

  while ((match = placemarkRegex.exec(kmlString)) !== null) {
    const placemark = match[1]

    // استخراج الاسم
    const nameMatch = placemark.match(/<name>([\s\S]*?)<\/name>/)
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown'

    // استخراج النوع والإحداثيات
    let geometry = null
    let coordinates = null

    // Point
    const pointMatch = placemark.match(/<Point>\s*<coordinates>([\s\S]*?)<\/coordinates>/i)
    if (pointMatch) {
      const coords = pointMatch[1].trim().split(',').map(Number)
      geometry = { type: 'Point', coordinates: [coords[0], coords[1]] }
    }

    // LineString
    const lineMatch = placemark.match(/<LineString>\s*<coordinates>([\s\S]*?)<\/coordinates>/i)
    if (lineMatch) {
      const coordStr = lineMatch[1].trim()
      const coords = coordStr.split('\n').filter(s => s.trim()).map(c => {
        const [lon, lat] = c.trim().split(',').map(Number)
        return [lon, lat]
      })
      geometry = { type: 'LineString', coordinates: coords }
    }

    // Polygon
    const polyMatch = placemark.match(/<Polygon>\s*<outerBoundaryIs>\s*<LinearRing>\s*<coordinates>([\s\S]*?)<\/coordinates>/i)
    if (polyMatch) {
      const coordStr = polyMatch[1].trim()
      const coords = coordStr.split('\n').filter(s => s.trim()).map(c => {
        const [lon, lat] = c.trim().split(',').map(Number)
        return [lon, lat]
      })
      geometry = { type: 'Polygon', coordinates: [coords] }
    }

    if (geometry) {
      features.push({
        type: 'Feature',
        geometry,
        properties: { name }
      })
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

export async function parseKMZ(filePath) {
  const buffer = fs.readFileSync(filePath)
  const zip = new JSZip()
  await zip.loadAsync(buffer)

  // استخراج doc.kml
  const kmlFile = zip.file('doc.kml')
  if (!kmlFile) {
    throw new Error('doc.kml not found in KMZ')
  }

  const kmlContent = await kmlFile.async('string')
  return kmlToGeoJSON(kmlContent)
}

export async function parseAllKMZ() {
  const kmzDir = path.join(__dirname, '../../../KMZ')
  const geoJsonData = {
    water: null,
    sanitation: null
  }

  try {
    // Water projects
    const waterPath = path.join(kmzDir, 'مشاريع المياه بمدينة الرياض .kmz')
    if (fs.existsSync(waterPath)) {
      geoJsonData.water = await parseKMZ(waterPath)
    }

    // Sanitation projects
    const sanPath = path.join(kmzDir, '- مشاريع الصرف الصحي بمدينة الرياض.kmz')
    if (fs.existsSync(sanPath)) {
      geoJsonData.sanitation = await parseKMZ(sanPath)
    }
  } catch (err) {
    console.error('Error parsing KMZ files:', err)
  }

  return geoJsonData
}
