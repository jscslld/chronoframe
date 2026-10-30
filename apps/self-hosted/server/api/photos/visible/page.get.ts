import { useResourceReader } from '../../../utils/resource-reader'
import { photoPageQuery } from '../../../utils/photo-page'

export default eventHandler(async (event) => {
  const page = photoPageQuery(event)
  const photos = await useResourceReader().listVisiblePhotos({
    ...page,
    limit: page.limit + 1,
  })
  return {
    photos: photos.slice(0, page.limit),
    hasMore: photos.length > page.limit,
  }
})
