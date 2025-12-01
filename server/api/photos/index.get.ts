import { asc, desc, eq } from 'drizzle-orm'

export default eventHandler(async (event) => {
  const db = useDB()
  const query = getQuery(event)
  const albumId = query.albumId ? Number(query.albumId) : null

  if (!albumId) {
    return db
      .select()
      .from(tables.photos)
      .orderBy(desc(tables.photos.dateTaken))
      .all()
  }

  const result = await db
    .select()
    .from(tables.albumPhotos)
    .innerJoin(tables.photos, eq(tables.albumPhotos.photoId, tables.photos.id))
    .where(eq(tables.albumPhotos.albumId, albumId))
    .orderBy(
      asc(tables.albumPhotos.position), // 保持 album 内自定义顺序
      desc(tables.photos.dateTaken)    // 同一位置再按拍摄时间
    )
    .all()

  // join 返回的是 { albumPhotos: {...}, photos: {...} }，只取 photos
  return result.map(r => r.photos)
})