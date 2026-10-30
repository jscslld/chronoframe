import { parsePhotoPage } from '@chronoframe/core'
import { createError, getQuery, type H3Event } from 'h3'

export function photoPageQuery(event: H3Event) {
  try {
    return parsePhotoPage(getQuery(event))
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid photo page query',
    })
  }
}
