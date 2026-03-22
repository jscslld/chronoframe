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
  tags: z.array(z.string().trim().max(128)).max(64),
})

const normalizeTags = (tags: string[]): string[] => {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const rawTag of tags) {
    const trimmed = rawTag.trim()
    if (!trimmed) continue

    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
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

  const normalizedTags = normalizeTags(payload.tags)

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

    const tempDir = await mkdtemp(path.join(tmpdir(), 'cframe-batch-tags-'))
    const ext = path.extname(photo.storageKey) || '.jpg'
    const tempFile = path.join(tempDir, `edited${ext}`)

    try {
      await writeFile(tempFile, originalBuffer)

      const tagsValue = normalizedTags.length > 0 ? normalizedTags : null
      await exiftool.write(
        tempFile,
        {
          Subject: tagsValue,
          Keywords: tagsValue,
          XPKeywords: normalizedTags.length > 0 ? normalizedTags.join('; ') : null,
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
          tags: normalizedTags,
          fileSize: updatedBuffer.length,
          lastModified: new Date().toISOString(),
        })
        .where(eq(tables.photos.id, photoId))

      updatedCount++
    } catch (error) {
      logger.image.error(
        `Failed to batch update tags for photo ${photoId}`,
        error,
      )
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
