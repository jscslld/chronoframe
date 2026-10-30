import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { DEFAULT_SITE } from '@chronoframe/core'
import { requireAdminSession } from '../../utils/require-admin'
import { useDB } from '../../utils/db'
const schema = z.object({
  label: z.string().trim().min(1).max(100),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const value = await readValidatedBody(event, schema.parse)
  const db = useDB()
  const count = db.get<{ total: number }>(
    sql`select count(*) as total from saved_photo_locations where site_id = ${DEFAULT_SITE.id}`,
  )!
  if (count.total >= 200)
    throw createError({
      statusCode: 409,
      statusMessage: 'Saved location limit reached (200)',
    })
  const existing = db.get(
    sql`select id from saved_photo_locations where site_id = ${DEFAULT_SITE.id} and label = ${value.label}`,
  )
  if (existing)
    throw createError({
      statusCode: 409,
      statusMessage: 'A saved location already uses this name',
    })
  return db.get(
    sql`insert into saved_photo_locations(site_id,label,latitude,longitude,created_at) values(${DEFAULT_SITE.id},${value.label},${value.latitude},${value.longitude},${Date.now()}) returning id,label,latitude,longitude`,
  )
})
