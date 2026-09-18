// تطبيع النصوص العربية: إزالة الهمزات، توحيد التاء المربوطة، إلخ
export function normalizeArabic(text) {
  if (!text) return ''
  return text
    .replace(/[أإآا]/g, 'ا')      // Alef variations
    .replace(/ى/g, 'ي')           // Alef Maksura -> Ya
    .replace(/ة/g, 'ه')           // Ta Marbuta -> Ha
    .replace(/\s+/g, ' ')         // Multiple spaces -> single space
    .trim()
}

// دالة similarity بسيطة (Dice coefficient)
export function similarity(s1, s2) {
  const n1 = normalizeArabic(s1).toLowerCase()
  const n2 = normalizeArabic(s2).toLowerCase()

  if (n1 === n2) return 1

  const bigrams1 = new Set()
  const bigrams2 = new Set()

  for (let i = 0; i < n1.length - 1; i++) {
    bigrams1.add(n1.substring(i, i + 2))
  }
  for (let i = 0; i < n2.length - 1; i++) {
    bigrams2.add(n2.substring(i, i + 2))
  }

  let intersection = 0
  for (const bigram of bigrams1) {
    if (bigrams2.has(bigram)) intersection++
  }

  const dice = (2 * intersection) / (bigrams1.size + bigrams2.size)
  return dice || 0
}
