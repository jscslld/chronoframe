import { sql } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { requireAdminSession } from '../../utils/require-admin'
import { useDB } from '../../utils/db'
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return useDB().all(
    sql`select id, label, latitude, longitude from saved_photo_locations where site_id = ${DEFAULT_SITE.id} order by created_at desc, id desc`,
  )
})
