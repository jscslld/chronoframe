import { createError, getQuery } from 'h3'
import { createResourceReader, parsePhotoPage } from '@chronoframe/core'
import { createCloudResourceRepository } from '@chronoframe/database/cloud-resources'
import type { MediaDatabase } from '@chronoframe/database/cloud-media'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../shared/platform/context'

export default definePlatformHandler(async (event) => {
  let page
  try {
    page = parsePhotoPage(getQuery(event))
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid photo page query',
    })
  }
  const context = await publicSiteContext(event)
  const reader = createResourceReader(
    createCloudResourceRepository(
      platformDatabase(event) as unknown as MediaDatabase,
      context.site,
      '/api/public/media',
    ),
  )
  const photos = await reader.listVisiblePhotos({
    ...page,
    limit: page.limit + 1,
  })
  return {
    photos: photos.slice(0, page.limit),
    hasMore: photos.length > page.limit,
  }
})
