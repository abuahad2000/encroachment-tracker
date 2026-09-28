// CacheManager.js - Client-side caching and SWR utility
const memoryStore = {}

export const CacheManager = {
  // Store data with TTL
  setCachedData: async (key, data, ttlSeconds = 60) => {
    const cacheData = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttlSeconds * 1000
    }
    memoryStore[`cache_${key}`] = cacheData
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(`cache_${key}`, JSON.stringify(cacheData))
      }
    } catch (e) {}
    return data
  },

  // Retrieve cached data if valid
  getCachedData: (key) => {
    let cached = memoryStore[`cache_${key}`]
    if (!cached) {
      try {
        const raw = window.sessionStorage?.getItem(`cache_${key}`)
        if (raw) cached = JSON.parse(raw)
      } catch (e) {}
    }

    if (!cached) return null

    if (Date.now() > cached.expiry) {
      delete memoryStore[`cache_${key}`]
      try {
        window.sessionStorage?.removeItem(`cache_${key}`)
      } catch (e) {}
      return null
    }

    return cached.data
  },

  // Get with cache fallback or fetch
  getWithCache: async (key, fetchFunction, ttlSeconds = 60) => {
    const cached = CacheManager.getCachedData(key)
    if (cached) {
      return cached
    }
    const freshData = await fetchFunction()
    await CacheManager.setCachedData(key, freshData, ttlSeconds)
    return freshData
  },

  // Invalidate single cache
  invalidateCache: async (key) => {
    delete memoryStore[`cache_${key}`]
    try {
      window.sessionStorage?.removeItem(`cache_${key}`)
    } catch (e) {}
  },

  // Clear all caches
  clearAllCaches: () => {
    Object.keys(memoryStore).forEach(k => {
      if (k.startsWith('cache_')) delete memoryStore[k]
    })
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const keysToRemove = []
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i)
          if (k?.startsWith('cache_')) keysToRemove.push(k)
        }
        keysToRemove.forEach(k => window.sessionStorage.removeItem(k))
      }
    } catch (e) {}
  },

  // Get cache stats
  getCacheStats: () => {
    const keys = Object.keys(memoryStore).filter(k => k.startsWith('cache_'))
    return {
      totalCaches: keys.length,
      items: keys.map(k => {
        const item = memoryStore[k]
        return {
          key: k.replace('cache_', ''),
          ageSeconds: Math.round((Date.now() - (item.timestamp || 0)) / 1000),
          remainingSeconds: Math.max(0, Math.round(((item.expiry || 0) - Date.now()) / 1000))
        }
      })
    }
  }
}

export default CacheManager
