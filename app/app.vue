<script setup lang="ts">
import dayjsLocale_zhCN from 'dayjs/locale/zh-cn'
import dayjsLocale_zhTW from 'dayjs/locale/zh-tw'
import dayjsLocale_zhHK from 'dayjs/locale/zh-hk'

const router = useRouter()
const dayjs = useDayjs()
const colorMode = useColorMode()
const { locale } = useI18n()

// 初始化设置系统 - 一次性加载所有设置
const settingsStore = useSettingsStore()
await settingsStore.initSettings()

const appTitle = useSettingRef('app:title')

colorMode.preference = useSettingRef('app:appearance.theme').value as string

useHead({
  titleTemplate: (title) =>
    `${title ? title + ' | ' : ''}${appTitle.value || 'ChronoFrame'}`,
})

// 获取 query 中的 albumId
const albumId = computed(() => router.currentRoute.value.query.albumId as string | undefined)

// 构建 fetch URL
const fetchUrl = computed(() => {
  return albumId.value ? `/api/photos?albumId=${albumId.value}` : '/api/photos'
})

const { data, refresh, status } = useFetch<Photo[]>(fetchUrl)

const photos = computed(() => data.value || [])
const { switchToIndex, closeViewer, clearReturnRoute } = useViewerState()
const { currentPhotoIndex, isViewerOpen, returnRoute, isDirectAccess } =
  storeToRefs(useViewerState())

const handleIndexChange = (newIndex: number) => {
  const photo = photos.value[newIndex]
  if (!photo) return

  switchToIndex(newIndex)

  router.replace({
    path: `/${photo.id}`,
    query: { ...router.currentRoute.value.query }, // 保留原 query
  })
}

const handleClose = () => {
  closeViewer()

  const currentQuery = router.currentRoute.value.query

  if (isDirectAccess.value) {
    isDirectAccess.value = false
    router.replace({ path: '/', query: { ...currentQuery } })
  } else if (returnRoute.value) {
    const destination = returnRoute.value
    clearReturnRoute()
    router.replace({ path: destination, query: { ...currentQuery } })
  } else {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.replace({ path: '/', query: { ...currentQuery } })
    }
  }
}

watchEffect(() => {
  dayjs.locale('zh-Hans', dayjsLocale_zhCN)
  dayjs.locale('zh-Hant-TW', dayjsLocale_zhTW)
  dayjs.locale('zh-Hant-HK', dayjsLocale_zhHK)
  dayjs.locale(locale.value)
})

// 在全局级别提供筛选功能的状态管理
provide(
  'photosFiltering',
  reactive({
    activeFilters: {
      tags: [],
      cameras: [],
      lenses: [],
      cities: [],
      ratings: [],
    },
  }),
)
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <PhotosProvider
      :photos="photos"
      :refresh="refresh"
      :status="status"
    >
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
      <ClientOnly>
        <PhotoViewer
          :photos="photos"
          :current-index="currentPhotoIndex"
          :is-open="isViewerOpen"
          @close="handleClose"
          @index-change="handleIndexChange"
        />
      </ClientOnly>
    </PhotosProvider>
  </UApp>
</template>

<style></style>
