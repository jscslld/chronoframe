<script setup lang="ts">
interface Result {
  label: string
  latitude: number
  longitude: number
  id?: number
}
const props = defineProps<{
  location?: { latitude: number; longitude: number } | null
}>()
const bookmarkName = ref('')
const saving = ref(false)
const deleting = ref<number | null>(null)
const bookmarkMessage = ref('')
const emit = defineEmits<{ select: [value: Result] }>()
const api = useConsoleApi()
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const query = ref('')
const results = ref<Result[]>([])
const pending = ref(false)
const message = ref('')
const saved = ref<Result[]>([])
const savedLoading = ref(true)
const savedFailed = ref(false)
async function loadSaved() {
  savedLoading.value = true
  savedFailed.value = false
  try {
    saved.value = await api<Result[]>('/api/location/saved')
  } catch {
    savedFailed.value = true
  } finally {
    savedLoading.value = false
  }
}
onMounted(loadSaved)
async function saveLocation() {
  if (!props.location || !bookmarkName.value.trim() || saving.value) return
  saving.value = true
  bookmarkMessage.value = ''
  try {
    await api('/api/location/saved', {
      method: 'POST',
      body: { ...props.location, label: bookmarkName.value.trim() },
    })
    bookmarkName.value = ''
    await loadSaved()
    bookmarkMessage.value = zh.value ? '位置已收藏' : 'Location saved'
  } catch {
    bookmarkMessage.value = zh.value
      ? '收藏失败，请检查是否重名或稍后重试'
      : 'Could not save. Check for duplicate names or retry.'
  } finally {
    saving.value = false
  }
}
async function deleteLocation(place: Result) {
  if (!place.id || deleting.value !== null) return
  deleting.value = place.id
  try {
    await api('/api/location/saved', {
      method: 'DELETE',
      body: { id: place.id },
    })
    saved.value = saved.value.filter((item) => item.id !== place.id)
  } catch {
    bookmarkMessage.value = zh.value
      ? '删除失败，请重试'
      : 'Could not delete. Please retry.'
  } finally {
    deleting.value = null
  }
}
const savedMatches = computed(() => {
  const text = query.value.trim().toLocaleLowerCase()
  return saved.value
    .filter((place) => !text || place.label.toLocaleLowerCase().includes(text))
    .slice(0, 12)
})
let generation = 0
watch(query, () => {
  generation++
  results.value = []
  message.value = ''
  pending.value = false
})
async function search() {
  const text = query.value.trim()
  if (text.length < 2) return
  const current = ++generation
  pending.value = true
  message.value = ''
  results.value = []
  try {
    const data = await api<Result[]>('/api/location/search', {
      query: { q: text },
    })
    if (current !== generation) return
    results.value = data
    if (!data.length)
      message.value = zh.value
        ? '未找到地址，请输入更完整的地名'
        : 'No results. Try a more specific address.'
  } catch {
    if (current === generation)
      message.value = zh.value
        ? '地址搜索暂不可用，请稍后重试'
        : 'Address search unavailable. Please retry.'
  } finally {
    if (current === generation) pending.value = false
  }
}
function select(result: Result) {
  generation++
  emit('select', result)
  results.value = []
  message.value = zh.value
    ? '已定位，可点击地图微调，保存后生效'
    : 'Location selected. Click the map to adjust, then save.'
}
</script>

<template>
  <div class="space-y-2">
    <div class="space-y-1">
      <p class="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {{ zh ? '收藏的位置' : 'Saved locations' }}
      </p>
      <p
        v-if="savedLoading"
        role="status"
        class="text-xs text-neutral-500"
      >
        {{ zh ? '加载中…' : 'Loading…' }}
      </p>
      <UButton
        v-else-if="savedFailed"
        type="button"
        size="xs"
        variant="ghost"
        @click="loadSaved"
        >{{ zh ? '加载失败，点击重试' : 'Could not load. Retry' }}</UButton
      >
      <div
        v-else-if="savedMatches.length"
        class="flex max-h-28 flex-wrap gap-1 overflow-y-auto"
      >
        <div
          v-for="place in savedMatches"
          :key="place.id"
          class="flex items-center rounded-md border border-neutral-200 dark:border-neutral-700"
        >
          <UButton
            type="button"
            size="xs"
            color="neutral"
            variant="ghost"
            :title="`${place.label} (${place.latitude}, ${place.longitude})`"
            @click="select(place)"
            ><span class="max-w-48 truncate">{{ place.label }}</span></UButton
          >
          <UButton
            type="button"
            size="xs"
            color="error"
            variant="ghost"
            icon="tabler:x"
            :aria-label="
              (zh ? '删除收藏：' : 'Delete saved location: ') + place.label
            "
            :loading="deleting === place.id"
            :disabled="deleting !== null"
            @click="deleteLocation(place)"
          />
        </div>
      </div>
      <p
        v-else
        class="text-xs text-neutral-500"
      >
        {{
          zh
            ? '暂无匹配的收藏位置，可搜索地址或在地图上选择后收藏'
            : 'No matching saved locations. Search an address below.'
        }}
      </p>
    </div>
    <div class="flex gap-2">
      <UInput
        v-model="query"
        :placeholder="
          zh
            ? '输入地址或地名，例如：南京大学仙林校区'
            : 'Enter an address or place name'
        "
        :aria-label="zh ? '搜索拍摄地址' : 'Search photo address'"
        class="flex-1"
        @keydown.enter.prevent="search"
      />
      <UButton
        type="button"
        icon="tabler:search"
        :loading="pending"
        :disabled="query.trim().length < 2"
        @click="search"
        >{{ zh ? '搜索' : 'Search' }}</UButton
      >
    </div>
    <div
      v-if="results.length"
      class="max-h-48 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700"
    >
      <button
        v-for="result in results"
        :key="`${result.latitude},${result.longitude},${result.label}`"
        type="button"
        class="block w-full p-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
        @click="select(result)"
      >
        {{ result.label }}
      </button>
    </div>
    <p
      v-if="message"
      role="status"
      class="text-xs text-neutral-500"
    >
      {{ message }}
    </p>
    <div
      v-if="props.location"
      class="flex gap-2"
    >
      <UInput
        v-model="bookmarkName"
        :placeholder="zh ? '给当前位置起个名字' : 'Name this location'"
        :aria-label="zh ? '收藏位置名称' : 'Saved location name'"
        :maxlength="100"
        class="flex-1"
        @keydown.enter.prevent="saveLocation"
      />
      <UButton
        type="button"
        icon="tabler:bookmark"
        :disabled="!bookmarkName.trim()"
        :loading="saving"
        @click="saveLocation"
        >{{ zh ? '收藏位置' : 'Save location' }}</UButton
      >
    </div>
    <p
      v-if="bookmarkMessage"
      role="status"
      class="text-xs text-neutral-500"
    >
      {{ bookmarkMessage }}
    </p>
    <a
      href="https://www.openstreetmap.org/copyright"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-neutral-500"
      >© OpenStreetMap contributors</a
    >
  </div>
</template>
