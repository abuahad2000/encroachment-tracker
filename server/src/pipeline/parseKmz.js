import JSZip from 'jszip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// المجلدات المعتمدة للمشاريع الجارية فقط
const ONGOING_FOLDERS = {
  water: ['المشاريع الجاري تنفيذها', 'مشاريع إستبدال الاسبستوس الجارية'],
  sanitation: ['مشاريع الصرف الصحي الجارية']
}

function extractPlacemarksFromFolder(folderXml, folderName, sector) {
  const features = []
  const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g
  let match

  while ((match = placemarkRegex.exec(folderXml)) !== null) {
    const placemark = match[1]

    // استخراج الاسم
    const nameMatch = placemark.match(/<name[^>]*>([\s\S]*?)<\/name>/)
    let name = nameMatch ? nameMatch[1].trim() : 'Unknown'
    name = name.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()

    // استخراج رقم العملية إن وجد في الاسم (مثل 24/23/2/02/0042/1)
    const opMatch = name.match(/\d{2}\/\d{2}\/\d{1,2}\/\d{2}\/\d{4}\/\d{1}/)
    const operationNumber = opMatch ? opMatch[0] : null

    // استخراج الإحداثيات والنوع
    let geometry = null

    // Polygon
    const polyMatch = placemark.match(/<Polygon[^>]*>[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
    if (polyMatch) {
      const coordStr = polyMatch[1].trim()
      const coords = coordStr.split(/[\s\n]+/).map(c => {
        const parts = c.split(',').map(Number)
        return parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) ? [parts[0], parts[1]] : null
      }).filter(Boolean)

      if (coords.length >= 3) {
        geometry = { type: 'Polygon', coordinates: [coords] }
      }
    }

    // LineString
    if (!geometry) {
      const lineMatch = placemark.match(/<LineString[^>]*>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
      if (lineMatch) {
        const coordStr = lineMatch[1].trim()
        const coords = coordStr.split(/[\s\n]+/).map(c => {
          const parts = c.split(',').map(Number)
          return parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) ? [parts[0], parts[1]] : null
        }).filter(Boolean)

        if (coords.length >= 2) {
          geometry = { type: 'LineString', coordinates: coords }
        }
      }
    }

    // Point
    if (!geometry) {
      const pointMatch = placemark.match(/<Point[^>]*>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
      if (pointMatch) {
        const coordStr = pointMatch[1].trim()
        const parts = coordStr.split(',').map(Number)
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          geometry = { type: 'Point', coordinates: [parts[0], parts[1]] }
        }
      }
    }

    if (geometry && name !== 'Unknown') {
      features.push({
        type: 'Feature',
        geometry,
        properties: {
          name,
          folder: folderName,
          sector, // 'water' أو 'sanitation'
          operationNumber,
          isOngoing: true
        }
      })
    }
  }

  return features
}

// استخراج المشاريع الجارية فقط من ملف KMZ
export async function parseOngoingKMZ(filePath, sector) {
  const buffer = fs.readFileSync(filePath)
  const zip = new JSZip()
  await zip.loadAsync(buffer)

  const kmlFile = zip.file('doc.kml')
  if (!kmlFile) {
    throw new Error('doc.kml not found in KMZ')
  }

  const kmlContent = await kmlFile.async('string')
  const allowedFolders = ONGOING_FOLDERS[sector] || []
  const ongoingFeatures = []

  // تقسيم KML حسب المجلدات
  const folderRegex = /<Folder[^>]*>([\s\S]*?)<\/Folder>/g
  let match

  while ((match = folderRegex.exec(kmlContent)) !== null) {
    const folderXml = match[1]
    const nameMatch = folderXml.match(/<name[^>]*>([\s\S]*?)<\/name>/)
    const folderName = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim() : 'Unknown'

    // هل هذا المجلد يمثل مشاريع جارية؟
    const isOngoing = allowedFolders.some(f => folderName.includes(f))
    if (isOngoing) {
      const features = extractPlacemarksFromFolder(folderXml, folderName, sector)
      ongoingFeatures.push(...features)
    }
  }

  return {
    type: 'FeatureCollection',
    features: ongoingFeatures
  }
}

export async function parseAllKMZ() {
  const kmzDir = path.join(__dirname, '../../../KMZ')
  const geoJsonData = {
    water: { type: 'FeatureCollection', features: [] },
    sanitation: { type: 'FeatureCollection', features: [] }
  }

  try {
    // Water projects (المشاريع الجارية فقط)
    const waterPath = path.join(kmzDir, 'مشاريع المياه بمدينة الرياض .kmz')
    if (fs.existsSync(waterPath)) {
      geoJsonData.water = await parseOngoingKMZ(waterPath, 'water')
    }

    // Sanitation projects (مشاريع الصرف الصحي الجارية فقط)
    const sanPath = path.join(kmzDir, '- مشاريع الصرف الصحي بمدينة الرياض.kmz')
    if (fs.existsSync(sanPath)) {
      geoJsonData.sanitation = await parseOngoingKMZ(sanPath, 'sanitation')
    }
  } catch (err) {
    console.error('Error parsing KMZ files:', err)
  }

  return geoJsonData
}
