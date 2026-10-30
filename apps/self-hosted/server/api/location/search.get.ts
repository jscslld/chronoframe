import { z } from 'zod'
import { requireAdminSession } from '../../utils/require-admin'
import { settingsManager } from '../../services/settings/settingsManager'
import { waitForGeocodingSlot } from '../../services/location/rate-limit'

const schema = z.object({ q: z.string().trim().min(2).max(200) })
const cache = new Map<
  string,
  {
    expires: number
    results: Array<{ label: string; latitude: number; longitude: number }>
  }
>()

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const { q } = await getValidatedQuery(event, schema.parse)
  const base =
    (await settingsManager.get<string>('location', 'nominatim.baseUrl')) ||
    'https://nominatim.openstreetmap.org'
  const language =
    (await settingsManager.get<string>('location', 'language')) || 'en'
  const key = JSON.stringify([base, language, q])
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.results
  const url = new URL('search', base.replace(/\/?$/, '/'))
  url.search = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '5',
    'accept-language': language,
  }).toString()
  await waitForGeocodingSlot(new URL(base).origin, 1100)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ChronoFrame/1.0 (photo location editor)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error('Search provider unavailable')
    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('Invalid provider response')
    const results = data.flatMap((row) => {
      const latitude = Number(row.lat),
        longitude = Number(row.lon)
      return typeof row.display_name === 'string' &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180
        ? [{ label: row.display_name, latitude, longitude }]
        : []
    })
    if (cache.size >= 100) cache.delete(cache.keys().next().value!)
    cache.set(key, { expires: Date.now() + 3600000, results })
    return results
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: 'Address search unavailable. Please try again.',
    })
  }
})
