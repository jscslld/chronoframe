import { z } from 'zod'
import { requireAdminSession } from '../../../utils/require-admin'
import { usePhotoWriter } from '../../../utils/resource-writer'

const bodySchema = z.object({
  photoIds: z.array(z.string().min(1)).min(1).max(500),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .refine(({ latitude, longitude }) => latitude !== 0 || longitude !== 0),
})

export default eventHandler(async (event) => {
  await requireAdminSession(event)
  const payload = bodySchema.parse(await readBody(event))
  const writer = usePhotoWriter(event)
  const failedPhotoIds: string[] = []
  let updatedCount = 0
  for (const id of new Set(payload.photoIds)) {
    try {
      await writer.update(
        id,
        { location: payload.location },
        { authenticated: true },
      )
      updatedCount++
    } catch {
      failedPhotoIds.push(id)
    }
  }
  if (!updatedCount)
    throw createError({
      statusCode: 500,
      statusMessage: 'Metadata update failed',
    })
  return {
    success: true,
    updatedCount,
    failedCount: failedPhotoIds.length,
    failedPhotoIds,
  }
})
