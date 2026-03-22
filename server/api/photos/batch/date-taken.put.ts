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
  dateTaken: z.string().datetime({ offset: true }),
})

const formatExifDateTime = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}:${month}:${day} ${hour}:${minute}:${second}`
}

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

  const targetDate = new Date(payload.dateTaken)
  if (Number.isNaN(targetDate.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.error'),
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
  const exifDateTime = formatExifDateTime(targetDate)

  let updatedCount = 0
  const failedPhotoIds: string[] = []

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

    const tempDir = await mkdtemp(path.join(tmpdir(), 'cframe-batch-date-'))
    const ext = path.extname(photo.storageKey) || '.jpg'
    const tempFile = path.join(tempDir, `edited${ext}`)

    try {
      await writeFile(tempFile, originalBuffer)

      await exiftool.write(
        tempFile,
        {
          DateTimeOriginal: exifDateTime,
          CreateDate: exifDateTime,
          ModifyDate: exifDateTime,
          DateTimeDigitized: exifDateTime,
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
          dateTaken: targetDate.toISOString(),
          fileSize: updatedBuffer.length,
          lastModified: new Date().toISOString(),
        })
        .where(eq(tables.photos.id, photoId))

      updatedCount++
    } catch (error) {
      logger.image.error(`Failed to batch update date for photo ${photoId}`, error)
      failedPhotoIds.push(photoId)
    } finally {
      await rm(tempDir, { recursive: true, force: true })
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
