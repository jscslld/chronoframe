import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { exiftool } from 'exiftool-vendored'
import { eq, inArray } from 'drizzle-orm'

import { extractExifData } from '~~/server/services/image/exif'
import { tables, useDB } from '~~/server/utils/db'
import { useStorageProvider } from '~~/server/utils/useStorageProvider'

const bodySchema = z.object({
  photoIds: z.array(z.string().min(1)).min(1).max(500),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
})

export default eventHandler(async (event) => {
  await requireUserSession(event)

  const t = await useTranslation(event)
  const payload = bodySchema.parse(await readBody(event))
  const photoIds = Array.from(new Set(payload.photoIds))

  if (photoIds.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.batchSelectRequired'),
    })
  }

  const db = useDB()
  const photos = await db
    .select()
    .from(tables.photos)
    .where(inArray(tables.photos.id, photoIds))
    .all()

  if (photos.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: t('dashboard.photos.messages.photoNotFound'),
    })
  }

  const photoMap = new Map(photos.map((photo) => [photo.id, photo]))

  const { storageProvider } = useStorageProvider(event)
  const { latitude, longitude } = payload.location

  let updatedCount = 0
  const failedPhotoIds: string[] = []
  const reverseGeocodeTargets: Array<{ photoId: string; latitude: number; longitude: number }> = []

  for (const photoId of photoIds) {
    const photo = photoMap.get(photoId)
    if (!photo || !photo.storageKey) {
      failedPhotoIds.push(photoId)
      continue
    }

    const originalBuffer = await storageProvider.get(photo.storageKey)
    if (!originalBuffer) {
      failedPhotoIds.push(photoId)
      continue
    }

    const tempDir = await mkdtemp(path.join(tmpdir(), 'cframe-batch-gps-'))
    const ext = path.extname(photo.storageKey) || '.jpg'
    const tempFile = path.join(tempDir, `edited${ext}`)

    try {
      await writeFile(tempFile, originalBuffer)

      const latAbs = Math.abs(latitude)
      const lonAbs = Math.abs(longitude)

      await exiftool.write(
        tempFile,
        {
          GPSLatitude: latAbs,
          GPSLatitudeRef: latitude >= 0 ? 'N' : 'S',
          GPSLongitude: lonAbs,
          GPSLongitudeRef: longitude >= 0 ? 'E' : 'W',
          GPSPosition: `${latitude} ${longitude}`,
        },
        ['-overwrite_original'],
      )

      const updatedBuffer = await readFile(tempFile)
      const prefix =
        storageProvider.config && 'prefix' in storageProvider.config
          ? storageProvider.config.prefix
          : ''

      await storageProvider.create(
        photo.storageKey.replace(prefix || '', ''),
        updatedBuffer,
      )

      const exifData = await extractExifData(updatedBuffer)

      await db
        .update(tables.photos)
        .set({
          exif: exifData,
          latitude,
          longitude,
          country: null,
          city: null,
          locationName: null,
          fileSize: updatedBuffer.length,
          lastModified: new Date().toISOString(),
        })
        .where(eq(tables.photos.id, photoId))

      reverseGeocodeTargets.push({ photoId, latitude, longitude })
      updatedCount++
    } catch (error) {
      logger.image.error(`Failed to batch update location for photo ${photoId}`, error)
      failedPhotoIds.push(photoId)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  const workerPool = globalThis.__workerPool
  if (workerPool) {
    for (const target of reverseGeocodeTargets) {
      try {
        await workerPool.addTask(
          {
            type: 'photo-reverse-geocoding',
            photoId: target.photoId,
            latitude: target.latitude,
            longitude: target.longitude,
          },
          {
            priority: 1,
          },
        )
      } catch (taskError) {
        logger.location.warn(
          `Failed to enqueue reverse geocoding for photo ${target.photoId}:`,
          taskError,
        )
      }
    }
  }

  if (updatedCount === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: t('dashboard.photos.messages.metadataUpdateFailed'),
    })
  }

  const uniqueFailedPhotoIds = Array.from(new Set(failedPhotoIds))

  return {
    success: true,
    updatedCount,
    failedCount: uniqueFailedPhotoIds.length,
    failedPhotoIds: uniqueFailedPhotoIds,
  }
})
