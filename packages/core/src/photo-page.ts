import type { PhotoPage } from './index.ts'

/** Validate the public pagination contract before it reaches a repository. */
export function parsePhotoPage(query: Record<string, unknown>): PhotoPage {
  const number = (key: string, fallback: number) => {
    const raw = query[key]
    if (raw === undefined) return fallback
    if (typeof raw !== 'string' || !/^\d+$/.test(raw))
      throw new RangeError(`Invalid ${key}`)
    const value = Number(raw)
    if (!Number.isSafeInteger(value)) throw new RangeError(`Invalid ${key}`)
    return value
  }
  const date = (key: string) => {
    const raw = query[key]
    if (raw === undefined || raw === '') return undefined
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
      throw new RangeError(`Invalid ${key}`)
    const parsed = new Date(`${raw}T00:00:00.000Z`)
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== raw
    )
      throw new RangeError(`Invalid ${key}`)
    return parsed.toISOString()
  }
  const limit = number('limit', 50)
  const offset = number('offset', 0)
  if (limit < 1 || limit > 100 || offset > 1000000)
    throw new RangeError('Invalid pagination')
  const from = date('from')
  const before = date('before')
  if (from && before && from >= before)
    throw new RangeError('Invalid date range')
  return { limit, offset, from, before }
}
