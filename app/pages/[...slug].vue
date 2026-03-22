<script lang="ts" setup>
definePageMeta({
  layout: 'masonry',
  // 固定 key 防止路径参数变化时创建新的实例
  key: 'photo-viewer-route',
})

const route = useRoute()
const router = useRouter()

const { switchToIndex, closeViewer, openViewer } = useViewerState()
const { isViewerOpen } = storeToRefs(useViewerState())

const { photos } = usePhotos()

const slug = computed(() => (route.params.slug as string[]) || [])
const photoId = computed(() => slug.value[0] || null)
const sourceAlbumId = computed(() => {
  const albumId = route.query.albumId
  return typeof albumId === 'string' && albumId.trim() ? albumId : null
})
const viewerReturnRoute = computed(() =>
  sourceAlbumId.value ? `/albums/${sourceAlbumId.value}` : null,
)
const currentPhoto = computed(() =>
  photos.value.find((photo) => photo.id === photoId.value),
)

defineOgImageComponent('Photo', {
  headline: currentPhoto.value ? 'PHOTO' : 'ChronoFrame',
  title: currentPhoto.value?.title || getSetting('app:title'),
  description: currentPhoto.value
    ? currentPhoto.value.description
    : getSetting('app:title'),
  thumbnailJpegUrl:
    currentPhoto.value && currentPhoto.value.thumbnailKey
      ? `/thumb/${encodeURIComponent(currentPhoto.value.thumbnailUrl || '')}`
      : undefined,
  photo: currentPhoto.value || undefined,
})

// 处理标签查询参数
const { clearAllFilters, toggleFilter } = usePhotoFilters()

// 监听路由查询参数中的标签
watch(
  () => route.query.tag,
  (tagParam) => {
    if (tagParam && typeof tagParam === 'string' && !photoId.value) {
      clearAllFilters()
      toggleFilter('tags', tagParam)

      const { tag, ...otherQuery } = route.query
      router.replace({
        path: '/',
        query: { ...otherQuery },
      })
    }
  },
  { immediate: true },
)

watch(
  [photoId, photos],
  async ([currentPhotoId, currentPhotos]) => {
    if (currentPhotoId && currentPhotos.length > 0) {
      const foundIndex = currentPhotos.findIndex(
        (photo) => photo.id === currentPhotoId,
      )
      if (foundIndex !== -1) {
        useHead({
          title: currentPhotos[foundIndex]?.title || $t('title.fallback.photo'),
        })

        await nextTick()

        if (!isViewerOpen.value) {
          // 带 albumId 的详情页视为从相册进入，关闭时返回对应相册页
          openViewer(foundIndex, viewerReturnRoute.value)
        } else {
          switchToIndex(foundIndex)
        }
      }
    } else if (!currentPhotoId) {
      closeViewer()
      useHead({
        title: '',
      })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div />
</template>

<style scoped></style>
