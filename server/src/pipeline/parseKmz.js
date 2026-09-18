import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// تحويل KML إلى GeoJSON مع معالجة البنية المتداخلة
function kmlToGeoJSON(kmlString) {
  const features = []

  // أزل المسافات البيضاء الزائدة
  let cleaned = kmlString.replace(/>\s+</g, '><')

  // استخراج جميع Placemarks
  const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g
  let match

  while ((match = placemarkRegex.exec(cleaned)) !== null) {
    const placemark = match[1]

    // استخراج الاسم
    const nameMatch = placemark.match(/<name[^>]*>([\s\S]*?)<\/name>/)
    let name = nameMatch ? nameMatch[1].trim() : 'Unknown'

    // تنظيف الاسم من الـ CDATA وغيره
    name = name.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()

    // استخراج النوع والإحداثيات
    let geometry = null

    // Point
    const pointMatch = placemark.match(/<Point[^>]*>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
    if (pointMatch) {
      const coordStr = pointMatch[1].trim()
      if (coordStr) {
        const coords = coordStr.split(',').map(Number)
        if (coords.length >= 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          geometry = { type: 'Point', coordinates: [coords[0], coords[1]] }
        }
      }
    }

    // LineString
    if (!geometry) {
      const lineMatch = placemark.match(/<LineString[^>]*>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
      if (lineMatch) {
        const coordStr = lineMatch[1].trim()
        const coords = coordStr.split(/[\s\n]+/).filter(s => s).map(c => {
          const parts = c.split(',').map(Number)
          return parts.length >= 2 ? [parts[0], parts[1]] : null
        }).filter(c => c)

        if (coords.length >= 2) {
          geometry = { type: 'LineString', coordinates: coords }
        }
      }
    }

    // Polygon
    if (!geometry) {
      const polyMatch = placemark.match(/<Polygon[^>]*>[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
      if (polyMatch) {
        const coordStr = polyMatch[1].trim()
        const coords = coordStr.split(/[\s\n]+/).filter(s => s).map(c => {
          const parts = c.split(',').map(Number)
          return parts.length >= 2 ? [parts[0], parts[1]] : null
        }).filter(c => c)

        if (coords.length >= 3) {
          geometry = { type: 'Polygon', coordinates: [coords] }
        }
      }
    }

    if (geometry && name !== 'Unknown') {
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
