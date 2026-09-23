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

// استخراج مشاريع المحافظات من مجلد نطاق المحافظات
export async function parseGovernoratesKMZ(govDir) {
  const features = []
  if (!fs.existsSync(govDir)) return { type: 'FeatureCollection', features }

  const files = fs.readdirSync(govDir).filter(f => f.endsWith('.kmz'))

  for (const file of files) {
    try {
      const buffer = fs.readFileSync(path.join(govDir, file))
      const zip = new JSZip()
      await zip.loadAsync(buffer)

      const kmlFile = zip.file('doc.kml') || Object.values(zip.files).find(zf => zf.name.endsWith('.kml'))
      if (!kmlFile) continue

      const kmlContent = await kmlFile.async('string')

      const placemarkRegex = /<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g
      let match
      let filePolys = 0

      while ((match = placemarkRegex.exec(kmlContent)) !== null) {
        const placemark = match[1]

        const nameMatch = placemark.match(/<name[^>]*>([\s\S]*?)<\/name>/)
        let name = nameMatch ? nameMatch[1].trim() : file.replace('.kmz', '')
        name = name.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()

        const opMatch = (file + ' ' + name).match(/\d{2}\/\d{2}\/\d{1,2}\/\d{2}\/\d{4}\/\d{1}/)
        const operationNumber = opMatch ? opMatch[0] : null

        // Polygon
        const polyMatch = placemark.match(/<Polygon[^>]*>[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
        if (polyMatch) {
          const coordStr = polyMatch[1].trim()
          const coords = coordStr.split(/[\s\n]+/).map(c => {
            const parts = c.split(',').map(Number)
            return parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]) ? [parts[0], parts[1]] : null
          }).filter(Boolean)

          if (coords.length >= 3) {
            // Ensure polygon is closed
            if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
              coords.push(coords[0])
            }
            features.push({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [coords] },
              properties: {
                name,
                kmzFile: file,
                operationNumber,
                sector: file.includes('صرف') ? 'sanitation' : 'water',
                isGovernorate: true,
                isOngoing: true
              }
            })
            filePolys++
          }
        }
      }

      // If no polygon found in file (e.g. facility point), extract Point
      if (filePolys === 0) {
        const pointMatch = kmlContent.match(/<Point[^>]*>[\s\S]*?<coordinates>([^<]*)<\/coordinates>/)
        if (pointMatch) {
          const parts = pointMatch[1].trim().split(',').map(Number)
          if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            features.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [parts[0], parts[1]] },
              properties: {
                name: file.replace('.kmz', ''),
                kmzFile: file,
                sector: file.includes('صرف') ? 'sanitation' : 'water',
                isGovernorate: true,
                isOngoing: true
              }
            })
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Warning parsing governorate KMZ ${file}:`, err.message)
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

export async function parseAllKMZ() {
  const kmzDir = path.join(__dirname, '../../../KMZ')
  const geoJsonData = {
    water: { type: 'FeatureCollection', features: [] },
    sanitation: { type: 'FeatureCollection', features: [] },
    governorates: { type: 'FeatureCollection', features: [] }
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

    // Governorate projects (نطاق المحافظات)
    const govDir = path.join(kmzDir, 'نطاق المحافظات')
    if (fs.existsSync(govDir)) {
      geoJsonData.governorates = await parseGovernoratesKMZ(govDir)
    }
  } catch (err) {
    console.error('Error parsing KMZ files:', err)
  }

  return geoJsonData
}

