import { asc, desc, notInArray } from 'drizzle-orm'

export default eventHandler(async (event) => {
  const db = useDB()
  const query = getQuery(event)
  const albumId = query.albumId ? Number(query.albumId) : null

  // 先查出所有隐藏相册中的照片 ID
  const hiddenAlbumPhotos = await db
    .select({
      photoId: tables.albumPhotos.photoId,
    })
    .from(tables.albumPhotos)
    .innerJoin(tables.albums, eq(tables.albumPhotos.albumId, tables.albums.id))
    .where(eq(tables.albums.isHidden, true))
    .all()

  const hiddenPhotoIds = hiddenAlbumPhotos.map((row) => row.photoId)

  // 按相册筛选
  if (albumId) {
    const result = await db
      .select()
      .from(tables.albumPhotos)
      .innerJoin(tables.photos, eq(tables.albumPhotos.photoId, tables.photos.id))
      .where(eq(tables.albumPhotos.albumId, albumId))
      .orderBy(
        asc(tables.albumPhotos.position), // 保持 album 内自定义顺序
        desc(tables.photos.dateTaken)     // 同一位置再按拍摄时间
      )
      .all()

    const photos = result.map((r) => r.photos)

    // 排除隐藏相册中的照片
    if (hiddenPhotoIds.length > 0) {
      return photos.filter((photo) => !hiddenPhotoIds.includes(photo.id))
    }

    return photos
  }

  // 不按相册筛选时，直接查询所有可见照片
  if (hiddenPhotoIds.length > 0) {
    return db
      .select()
      .from(tables.photos)
      .where(notInArray(tables.photos.id, hiddenPhotoIds))
      .orderBy(desc(tables.photos.dateTaken))
      .all()
  }

  return db
    .select()
    .from(tables.photos)
    .orderBy(desc(tables.photos.dateTaken))
    .all()
})