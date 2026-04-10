<script setup lang="ts">
import dayjsLocale_zhCN from 'dayjs/locale/zh-cn'
import dayjsLocale_zhTW from 'dayjs/locale/zh-tw'
import dayjsLocale_zhHK from 'dayjs/locale/zh-hk'

const router = useRouter()
const dayjs = useDayjs()
const colorMode = useColorMode()
const localeRef = ref('en')
try {
  const { locale } = useI18n()
  watch(
    locale,
    (value) => {
      localeRef.value = value
    },
    { immediate: true },
  )
} catch {
  // i18n context may be unavailable during early server-side error rendering
}

// 初始化设置系统 - 一次性加载所有设置
const settingsStore = useSettingsStore()
await settingsStore.initSettings()

const appTitle = useSettingRef('app:title')

colorMode.preference = useSettingRef('app:appearance.theme').value as string

useHead({
  titleTemplate: (title) =>
    `${title ? title + ' | ' : ''}${appTitle.value || 'ChronoFrame'}`,
})

const route = useRoute()
const { loggedIn } = useUserSession()

const albumId = computed(() => {
  const value = route.query.albumId
  return Array.isArray(value) ? value[0] : value
})

const fetchUrl = computed(() => {
  // 后台管理页始终显示全部
  // 前端页面：登录用户显示全部，未登录用户只显示可见照片
  const base =
    route.path.startsWith('/dashboard') || loggedIn.value
      ? '/api/photos'
      : '/api/photos/visible'

  if (!albumId.value) return base

  const params = new URLSearchParams({
    albumId: albumId.value,
  })

  return `${base}?${params.toString()}`
})

const { data, refresh, status } = await useFetch<Photo[]>(() => fetchUrl.value, {
  watch: [fetchUrl],
})

const photos = computed(() => data.value ?? [])
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
  dayjs.locale(localeRef.value)
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
