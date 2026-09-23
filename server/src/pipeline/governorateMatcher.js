/**
 * Match a governorate KMZ feature or filename to its canonical project in projects.json
 */
export function matchGovernorateFeatureToProject(featOrFile, projects) {
  const file = typeof featOrFile === 'string' ? featOrFile : (featOrFile.properties?.kmzFile || featOrFile.properties?.name || '')
  const name = typeof featOrFile === 'string' ? '' : (featOrFile.properties?.name || '')
  const op = typeof featOrFile === 'string' ? '' : (featOrFile.properties?.operationNumber || '')

  const matchId = (id) => projects.find(p => String(p.id).trim() === String(id).trim())

  // Direct mapping by contract / operation ID embedded in filename
  if (file.includes('10031')) return matchId(103)
  if (file.includes('10098')) return matchId(87)
  if (file.includes('10099')) return matchId(87)
  if (file.includes('10132')) return matchId(104)
  if (file.includes('10133')) return matchId(102)
  if (file.includes('10134')) return matchId(72)
  if (file.includes('10135')) return matchId(72)
  if (file.includes('10159')) return matchId(105)
  if (file.includes('10160')) return matchId(72)
  if (file.includes('10161')) return matchId(74)
  if (file.includes('10162')) return matchId(107)
  if (file.includes('10167')) return matchId(108)
  if (file.includes('10171')) return matchId(88)
  if (file.includes('10172')) return matchId(112)
  if (file.includes('10173')) return matchId(109)
  if (file.includes('10174')) return matchId(78)
  if (file.includes('10176')) return matchId(89)
  if (file.includes('10202')) return matchId(115)
  if (file.includes('10236')) return matchId(73)
  if (file.includes('10237')) return matchId(71) // فهد العنزي - رماح
  if (file.includes('10258')) return matchId(119)
  if (file.includes('AP41')) return matchId(93)
  if (file.includes('AP58')) return matchId(90)
  if (file.includes('NA-00028')) return matchId(120)
  if (file.includes('P1463-10')) return matchId(82) // فهد العنزي - رماح
  if (file.includes('P1463-3')) return matchId(106)
  if (file.includes('P1463-8')) return matchId(79)
  if (file.includes('P1603')) return matchId(111)
  if (file.includes('P1605-1')) return matchId(98) || matchId(100)
  if (file.includes('P1605-2')) return matchId(98)
  if (file.includes('P1616')) return matchId(91)
  if (file.includes('P1643-1')) return matchId(110)
  if (file.includes('P1644-1')) return matchId(94)
  if (file.includes('P1644-2')) return matchId(99)
  if (file.includes('P1652')) return matchId(97)
  if (file.includes('P1654')) return matchId(114)
  if (file.includes('P1658')) return matchId(83)
  if (file.includes('P1707')) return matchId(113)
  if (file.includes('P1747')) return matchId(96)
  if (file.includes('P1752-1')) return matchId(81)
  if (file.includes('P1782')) return matchId(117)
  if (file.includes('P1788')) return matchId(122)
  if (file.includes('P1791')) return matchId(92)
  if (file.includes('P1793')) return matchId(84)
  if (file.includes('P1810')) return matchId(76) // فهد العنزي - حريملاء
  if (file.includes('P1811')) return matchId(123)
  if (file.includes('P1812')) return matchId(121)
  if (file.includes('P1825')) return matchId(80)
  if (file.includes('P1850')) return matchId(78)
  if (file.includes('P1857')) return matchId(116)

  const clean = (s) => (s || '').replace(/[^\w\d\u0600-\u06FF]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  const fClean = clean(file)
  if (fClean.includes('ثادق')) return matchId(75)
  if (fClean.includes('السليل')) return matchId(101)
  if (fClean.includes('الشماليه')) return matchId(77) // فهد العنزي - المحافظات الشمالية
  if (fClean.includes('الدرعيه')) return matchId(85) // فهد العنزي - الدرعية وحريملاء
  if (fClean.includes('الخرج')) return matchId(100)

  // Fallback by operationNumber
  if (op) {
    const pByOp = projects.find(p => p.operationNumber && p.operationNumber.trim() === op.trim())
    if (pByOp) return pByOp
  }

  // Fallback by name similarity
  const pByName = projects.find(p => {
    const cp = clean(p.name)
    return cp && (fClean.includes(cp) || cp.includes(fClean))
  })
  return pByName || null
}
