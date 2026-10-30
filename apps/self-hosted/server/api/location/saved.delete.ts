import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { DEFAULT_SITE } from '@chronoframe/core'
import { requireAdminSession } from '../../utils/require-admin'
import { useDB } from '../../utils/db'
export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const { id } = await readValidatedBody(
    event,
    z.object({ id: z.number().int().positive() }).parse,
  )
  useDB().run(
    sql`delete from saved_photo_locations where site_id = ${DEFAULT_SITE.id} and id = ${id}`,
  )
  return { success: true }
})
