<script setup lang="ts">
import type { DeliveryIssue, DeliveryRecord, DeviceKind, DiffLine, Exhibit, LanguageDraft, ScriptStatus, Segment } from '~/types'
import { DURATION_TOLERANCE, LANGUAGES, deviationRatio, evaluateExhibit, formatDuration, useScriptStore } from '~/stores/script'

const store = useScriptStore()
const activeTab = ref('editor')
const device = ref<DeviceKind>('desktop')
const versionDialog = ref(false)
const versionName = ref('')
const leftFilter = ref('')
const compareA = ref('')
const compareB = ref('')
const helpDialog = ref(false)
const deleteTarget = ref<string | null>(null)
const withdrawTarget = ref<string | null>(null)
const verifierNames = reactive<Record<string, string>>({})

const statusOptions: Array<{ value: ScriptStatus; label: string; color: string }> = [
  { value: 'draft', label: '草稿', color: 'grey' },
  { value: 'review', label: '待审', color: 'warning' },
  { value: 'returned', label: '退回', color: 'error' },
  { value: 'approved', label: '已定稿', color: 'success' }
]
const deviceOptions: Array<{ value: DeviceKind; label: string }> = [
  { value: 'desktop', label: '桌面大屏' },
  { value: 'tablet', label: '平板导览' },
  { value: 'mobile', label: '手机导览' },
  { value: 'kiosk', label: '馆内触摸屏' }
]

const draft = computed(() => store.selectedDraft)
const exhibit = computed(() => store.selectedExhibit)
const currentLanguage = computed(() => LANGUAGES.find(item => item.id === store.selectedLanguageId))
const currentStatus = computed(() => statusOptions.find(item => item.value === draft.value?.status) || statusOptions[0])
const filteredExhibits = computed(() => store.hallExhibits.filter(item => !leftFilter.value || `${item.code} ${item.title}`.toLowerCase().includes(leftFilter.value.toLowerCase())))
const versions = computed(() => store.versions.filter(item => item.exhibitId === store.selectedExhibitId && item.languageId === store.selectedLanguageId))
const selectedVersionA = computed(() => versions.value.find(item => item.id === compareA.value))
const selectedVersionB = computed(() => versions.value.find(item => item.id === compareB.value))
const diffLines = computed<DiffLine[]>(() => {
  const before = selectedVersionA.value?.draft.narration || ''
  const after = selectedVersionB.value?.draft.narration || ''
  return buildDiff(before, after)
})
const currentDeviationPercent = computed(() => exhibit.value && draft.value ? deviationPercent(exhibit.value, draft.value.languageId) : null)
const durationOffTarget = computed(() => currentDeviationPercent.value !== null && currentDeviationPercent.value > DURATION_TOLERANCE * 100)

const checklistRows = computed(() => store.hallExhibits.map(item => {
  const issues = evaluateExhibit(item)
  const delivered = store.activeDelivery(item.id)
  const latest = store.latestDelivery(item.id)
  return {
    exhibit: item,
    issues,
    delivered,
    withdrawn: !delivered && latest?.withdrawnAt ? latest : null
  }
}))
const hallSummary = computed(() => {
  const perLanguage: Record<string, { deliverable: number; total: number }> = {}
  for (const lang of LANGUAGES) perLanguage[lang.id] = { deliverable: 0, total: checklistRows.value.length }
  let issueCount = 0
  let durationIssues = 0
  let sourceIssues = 0
  let segmentIssues = 0
  let deliverableExhibits = 0
  let delivered = 0
  for (const row of checklistRows.value) {
    issueCount += row.issues.length
    durationIssues += row.issues.filter(issue => issue.code === 'duration-mismatch').length
    sourceIssues += row.issues.filter(issue => issue.code === 'missing-source' || issue.code === 'source-unverified').length
    segmentIssues += row.issues.filter(issue => issue.code === 'no-segments' || issue.code === 'segments-unconfirmed').length
    if (!row.issues.length) deliverableExhibits++
    if (row.delivered) delivered++
    for (const lang of LANGUAGES) {
      if (isLanguageDeliverable(row.exhibit, lang.id)) perLanguage[lang.id].deliverable++
    }
  }
  return { perLanguage, issueCount, durationIssues, sourceIssues, segmentIssues, deliverableExhibits, delivered }
})
const deliverableCount = computed(() => Object.values(hallSummary.value.perLanguage).reduce((sum, item) => sum + item.deliverable, 0))

onMounted(() => {
  store.hydrate()
  syncCompareSelection()
  window.addEventListener('keydown', handleKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
watch(versions, syncCompareSelection)

function syncCompareSelection() {
  if (!versions.value.some(item => item.id === compareA.value)) compareA.value = versions.value[1]?.id || versions.value[0]?.id || ''
  if (!versions.value.some(item => item.id === compareB.value)) compareB.value = versions.value[0]?.id || ''
}
function handleKeydown(event: KeyboardEvent) {
  const modifier = event.metaKey || event.ctrlKey
  if (!modifier) return
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? store.redo() : store.undo()
  }
  if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    store.redo()
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    store.createVersion('键盘快捷保存')
  }
}
function saveDraftField(field: 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources', event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  store.updateDraft({ [field]: field === 'durationMinutes' ? Number(value) : value } as Partial<LanguageDraft>)
}
function saveSegment(id: string, field: 'label' | 'content', event: Event) {
  store.updateSegment(id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
}
function submitVersion() {
  store.createVersion(versionName.value.trim() || undefined)
  versionName.value = ''
  versionDialog.value = false
}
function confirmDelete() {
  if (deleteTarget.value) store.removeSegment(deleteTarget.value)
  deleteTarget.value = null
}
function confirmWithdraw() {
  if (withdrawTarget.value) store.withdrawExhibit(withdrawTarget.value)
  withdrawTarget.value = null
}
function isLanguageDeliverable(item: Exhibit, languageId: string): boolean {
  if (!item.drafts.some(entry => entry.languageId === languageId)) return false
  return !evaluateExhibit(item).some(issue => issue.languageId === languageId)
}
function deviationPercent(item: Exhibit, languageId: string): number | null {
  const entry = item.drafts.find(draftItem => draftItem.languageId === languageId)
  const target = item.targetDurationMinutes
  if (!entry || !(target && target > 0) || !(entry.durationMinutes > 0)) return null
  return Math.round(deviationRatio(target, entry.durationMinutes) * 100)
}
function deviationText(item: Exhibit, languageId: string): string {
  const percent = deviationPercent(item, languageId)
  if (percent === null) return '—'
  return percent > DURATION_TOLERANCE * 100 ? `${percent}%（超一成）` : `${percent}%`
}
function saveTarget(exhibitId: string, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  const value = Number(raw)
  store.setTargetDuration(exhibitId, raw === '' || !Number.isFinite(value) || value <= 0 ? null : value)
}
function goToLanguage(item: Exhibit, languageId: string) {
  store.selectExhibit(item.id)
  store.selectLanguage(languageId)
  activeTab.value = 'editor'
}
function goToIssue(item: Exhibit, issue: DeliveryIssue) {
  if (issue.languageId) goToLanguage(item, issue.languageId)
  else store.selectExhibit(item.id)
}
function changedSummary(record: DeliveryRecord): string {
  const labels = Array.from(new Set((record.changedFields || []).map(field => field.label)))
  if (!labels.length) return '内容'
  return labels.slice(0, 6).join('、') + (labels.length > 6 ? '等' : '')
}
function statusColor(status?: ScriptStatus) {
  return statusOptions.find(item => item.value === status)?.color || 'grey'
}
function verifierFor(exhibitId: string, languageId: string): string {
  const key = `${exhibitId}:${languageId}`
  if (!(key in verifierNames)) {
    const entry = store.exhibits.find(item => item.id === exhibitId)?.drafts.find(item => item.languageId === languageId)
    verifierNames[key] = entry?.sourceVerifiedBy || ''
  }
  return verifierNames[key]
}
function setVerifier(exhibitId: string, languageId: string, value: string) {
  verifierNames[`${exhibitId}:${languageId}`] = value
}
function toggleSourceVerified(value: boolean | null) {
  if (!exhibit.value || !draft.value) return
  store.setSourceVerification(exhibit.value.id, draft.value.languageId, Boolean(value), verifierFor(exhibit.value.id, draft.value.languageId))
}
function buildDiff(before: string, after: string): DiffLine[] {
  const a = before.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const b = after.split(/(?<=[。！？.!?])\s*/).filter(Boolean)
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1])
  }
  const result: DiffLine[] = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++ }
    else if (rows[i + 1][j] >= rows[i][j + 1]) { result.push({ type: 'remove', text: a[i] }); i++ }
    else { result.push({ type: 'add', text: b[j] }); j++ }
  }
  while (i < a.length) result.push({ type: 'remove', text: a[i++] })
  while (j < b.length) result.push({ type: 'add', text: b[j++] })
  return result
}
function formatTime(value: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
function segmentLabel(segment: Segment) { return segment.label || '未命名段落' }
</script>

<template>
  <v-app class="workspace-shell">
    <a class="skip-link" href="#main-workspace">跳到主要内容</a>
    <v-app-bar color="surface" flat border>
      <template #prepend><v-app-bar-nav-icon aria-label="打开项目导航" /></template>
      <v-app-bar-title>
        <span class="project-mark">博物声</span>
        <span class="text-caption text-medium-emphasis ms-3 d-none d-md-inline">展陈脚本工作台</span>
      </v-app-bar-title>
      <v-spacer />
      <v-chip class="me-2 d-none d-sm-flex" :color="currentStatus.color" variant="tonal" size="small">
        <span class="status-dot" :style="{ background: 'currentColor' }" />{{ currentStatus.label }}
      </v-chip>
      <v-btn variant="text" prepend-icon="mdi-keyboard-outline" class="d-none d-md-flex" @click="helpDialog = true">快捷键</v-btn>
      <v-btn color="primary" prepend-icon="mdi-content-save-outline" @click="versionDialog = true">保存版本</v-btn>
    </v-app-bar>

    <v-navigation-drawer permanent width="320" color="surface" border>
      <div class="pa-4">
        <div class="section-title mb-2">展厅</div>
        <v-select
          :model-value="store.selectedHallId"
          :items="store.halls"
          item-title="name"
          item-value="id"
          hide-details
          aria-label="选择展厅"
          @update:model-value="store.selectHall"
        />
        <div class="d-flex align-center justify-space-between mt-5 mb-2">
          <div class="section-title">展项</div>
          <v-chip size="x-small" variant="tonal">{{ filteredExhibits.length }} 项</v-chip>
        </div>
        <v-text-field v-model="leftFilter" density="compact" hide-details prepend-inner-icon="mdi-magnify" placeholder="筛选展项" aria-label="筛选展项" />
        <v-list class="mt-2 bg-transparent" nav>
          <v-list-item
            v-for="item in filteredExhibits"
            :key="item.id"
            :active="item.id === store.selectedExhibitId"
            color="primary"
            rounded="lg"
            @click="store.selectExhibit(item.id)"
          >
            <template #prepend><v-chip size="small" variant="outlined">{{ item.code }}</v-chip></template>
            <v-list-item-title class="font-weight-medium">{{ item.title }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ item.drafts.length }} 种语言
              <v-chip v-if="store.activeDelivery(item.id)" size="x-small" color="success" variant="tonal" class="ms-1">已交付</v-chip>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </div>
      <v-divider />
      <div class="pa-4">
        <div class="section-title mb-3">多语言完成度</div>
        <div v-for="lang in LANGUAGES" :key="lang.id" class="mb-3">
          <button class="d-flex align-center w-100 border-0 bg-transparent text-left pa-0" :aria-pressed="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">
            <v-avatar size="32" :color="lang.id === store.selectedLanguageId ? 'primary' : 'grey-lighten-2'" :class="lang.id === store.selectedLanguageId ? 'text-white' : ''">{{ lang.shortLabel }}</v-avatar>
            <div class="ms-3 flex-grow-1">
              <div class="text-body-2 font-weight-medium">{{ lang.label }}</div>
              <v-progress-linear class="mt-1" :model-value="exhibit ? store.completionFor(exhibit, lang.id) : 0" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'" height="5" rounded />
            </div>
            <span class="text-caption ms-3">{{ exhibit ? store.completionFor(exhibit, lang.id) : 0 }}%</span>
          </button>
        </div>
      </div>
    </v-navigation-drawer>

    <v-main id="main-workspace" style="background:#f4f0e8">
      <div class="pa-3 pa-md-6">
        <div class="d-flex flex-wrap align-start justify-space-between ga-4 mb-5">
          <div>
            <div class="text-caption text-medium-emphasis mb-1">{{ store.selectedHall?.name }} / {{ exhibit?.code }}</div>
            <h1 class="text-h4 font-weight-bold project-mark">{{ exhibit?.title || '请选择展项' }}</h1>
            <div class="text-body-2 text-medium-emphasis mt-2">
              当前语言：{{ currentLanguage?.label }} ·
              {{ draft?.updatedAt ? `最后更新 ${formatTime(draft.updatedAt)}` : '尚未建立文稿' }}
            </div>
          </div>
          <div class="d-flex ga-2">
            <v-btn variant="outlined" prepend-icon="mdi-undo" :disabled="!store.canUndo" @click="store.undo">撤销</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-redo" :disabled="!store.canRedo" @click="store.redo">重做</v-btn>
            <v-btn variant="outlined" prepend-icon="mdi-history" @click="activeTab = 'versions'">版本</v-btn>
          </div>
        </div>

        <v-alert v-if="store.notice" class="mb-4" color="secondary" variant="tonal" closable @click:close="store.notice = ''">{{ store.notice }}</v-alert>

        <v-tabs v-model="activeTab" color="primary" bg-color="surface" rounded="lg" class="mb-4 px-2">
          <v-tab value="editor">脚本编辑</v-tab>
          <v-tab value="checklist">交付清单</v-tab>
          <v-tab value="versions">版本比较</v-tab>
          <v-tab value="preview">设备预览</v-tab>
          <v-tab value="sources">资料核对</v-tab>
        </v-tabs>

        <div v-if="draft">
          <v-window v-model="activeTab" :touch="false">
            <v-window-item value="editor">
              <v-row>
                <v-col cols="12" lg="8">
                  <v-card class="script-card pa-4 pa-md-6">
                    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                      <div>
                        <div class="section-title">当前文稿</div>
                        <div class="text-h6 font-weight-bold mt-1">{{ currentLanguage?.label }}</div>
                      </div>
                      <div class="d-flex flex-wrap ga-2">
                        <v-select
                          :model-value="draft.status"
                          :items="statusOptions"
                          item-title="label"
                          item-value="value"
                          label="审校状态"
                          hide-details
                          style="min-width:150px"
                          @update:model-value="store.setStatus"
                        />
                        <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" @click="store.addSegment">新增段落</v-btn>
                      </div>
                    </div>

                    <v-text-field label="展项标题" :model-value="draft.title" hint="面向观众的主标题" persistent-hint @change="saveDraftField('title', $event)" />
                    <v-row class="mt-2">
                      <v-col cols="12" md="5">
                        <v-text-field label="预计朗读时长（分钟）" type="number" min="0" step="0.5" :model-value="draft.durationMinutes" @change="saveDraftField('durationMinutes', $event)" />
                        <div class="text-caption mt-1" :class="durationOffTarget ? 'text-warning' : 'text-medium-emphasis'">
                          目标 {{ exhibit?.targetDurationMinutes ? formatDuration(exhibit.targetDurationMinutes) : '未设定' }}<template v-if="currentDeviationPercent !== null"> · 偏差 {{ currentDeviationPercent }}%<template v-if="durationOffTarget">，超过一成，已列入交付待办</template></template>
                        </div>
                      </v-col>
                      <v-col cols="12" md="7">
                        <v-text-field label="资料来源" :model-value="draft.sources" hint="书籍、档案号或专家核验记录" persistent-hint @change="saveDraftField('sources', $event)" />
                      </v-col>
                    </v-row>

                    <div class="section-title mt-6 mb-2">完整讲解词</div>
                    <v-textarea label="讲解词" rows="7" auto-grow counter :model-value="draft.narration" @change="saveDraftField('narration', $event)" />

                    <div class="section-title mt-6 mb-2">无障碍描述</div>
                    <v-textarea label="无障碍描述" rows="4" auto-grow hint="描述尺寸、材质、色彩与可触摸特征，避免只依赖视觉" persistent-hint :model-value="draft.accessibility" @change="saveDraftField('accessibility', $event)" />
                  </v-card>

                  <v-card class="script-card pa-4 pa-md-6 mt-5">
                    <div class="d-flex align-center justify-space-between mb-4">
                      <div>
                        <div class="section-title">分段校对</div>
                        <div class="text-body-2 text-medium-emphasis mt-1">锁定段落不会被编辑；可在撤销中恢复。</div>
                      </div>
                      <v-chip variant="tonal">{{ draft.segments.filter(item => item.locked).length }}/{{ draft.segments.length }} 已锁定</v-chip>
                    </div>
                    <div class="d-flex flex-column ga-3">
                      <div v-for="(segment, index) in draft.segments" :key="segment.id" class="segment-row" :class="{ locked: segment.locked }">
                        <div class="d-flex align-center ga-2">
                          <v-btn icon size="small" variant="text" :aria-label="segment.locked ? '解锁段落' : '锁定段落'" @click="store.toggleLock(segment.id)">
                            {{ segment.locked ? '🔒' : '🔓' }}
                          </v-btn>
                          <v-text-field :model-value="segment.label" density="compact" hide-details variant="plain" :readonly="segment.locked" :aria-label="`第 ${index + 1} 段标题`" @change="saveSegment(segment.id, 'label', $event)" />
                          <v-chip v-if="segment.locked" color="success" size="small" variant="tonal">已确认</v-chip>
                          <v-btn icon="mdi-delete-outline" size="small" variant="text" color="error" :disabled="segment.locked" :aria-label="`删除第 ${index + 1} 段`" @click="deleteTarget = segment.id" />
                        </div>
                        <v-textarea class="mt-2" :model-value="segment.content" rows="2" auto-grow hide-details :readonly="segment.locked" :aria-label="segmentLabel(segment)" @change="saveSegment(segment.id, 'content', $event)" />
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" lg="4">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-4">同展项语言进度</div>
                    <div v-for="lang in LANGUAGES" :key="lang.id" class="d-flex align-center ga-3 mb-4">
                      <v-progress-circular :model-value="store.completionFor(exhibit!, lang.id)" size="52" width="5" :color="lang.id === store.selectedLanguageId ? 'primary' : 'secondary'">
                        {{ store.completionFor(exhibit!, lang.id) }}
                      </v-progress-circular>
                      <div class="flex-grow-1">
                        <div class="font-weight-medium">{{ lang.label }}</div>
                        <div class="text-caption text-medium-emphasis">
                          {{ exhibit?.drafts.find(item => item.languageId === lang.id) ? store.statusLabel(exhibit!.drafts.find(item => item.languageId === lang.id)!.status) : '尚未创建' }}
                        </div>
                      </div>
                      <v-btn size="small" variant="text" :disabled="lang.id === store.selectedLanguageId" @click="store.selectLanguage(lang.id)">切换</v-btn>
                    </div>
                  </v-card>
                  <v-card class="script-card pa-5 mt-5">
                    <div class="section-title mb-3">审校检查</div>
                    <v-list density="compact" class="bg-transparent">
                      <v-list-item :prepend-icon="draft.narration.length > 80 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`讲解词 ${draft.narration.length} 字`" />
                      <v-list-item :prepend-icon="draft.accessibility.length > 30 ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`无障碍描述 ${draft.accessibility.length} 字`" />
                      <v-list-item :prepend-icon="draft.sources ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="draft.sources ? '资料来源已填写' : '缺少资料来源'" />
                      <v-list-item :prepend-icon="draft.sourceVerified ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="draft.sourceVerified ? `来源已核验（${draft.sourceVerifiedBy || '未留名'}）` : '来源未核验登记'" />
                      <v-list-item :prepend-icon="durationOffTarget ? 'mdi-alert-circle' : 'mdi-check-circle'" :title="currentDeviationPercent === null ? '目标时长未设定或预计时长无效' : `时长偏差 ${currentDeviationPercent}%${durationOffTarget ? '，超过一成' : ''}`" />
                      <v-list-item :prepend-icon="draft.segments.length > 0 && draft.segments.every(item => item.locked) ? 'mdi-check-circle' : 'mdi-alert-circle'" :title="`段落 ${draft.segments.filter(item => item.locked).length}/${draft.segments.length} 已确认`" />
                    </v-list>
                    <v-alert class="mt-3" type="info" variant="tonal" density="compact">
                      估算语速约 {{ Math.max(1, Math.round(draft.narration.length / 220 * 10) / 10) }} 分钟，请与目标时长核对。
                    </v-alert>
                    <v-btn class="mt-3" block variant="tonal" color="primary" prepend-icon="mdi-clipboard-check-outline" @click="activeTab = 'checklist'">查看交付清单</v-btn>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>

            <v-window-item value="checklist">
              <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
                <div>
                  <div class="section-title">交付清单</div>
                  <div class="text-h6 font-weight-bold mt-1">按展厅与语言核对可交付稿件和待办</div>
                </div>
                <v-select
                  :model-value="store.selectedHallId"
                  :items="store.halls"
                  item-title="name"
                  item-value="id"
                  label="展厅"
                  hide-details
                  style="min-width:220px"
                  aria-label="选择交付清单展厅"
                  @update:model-value="store.selectHall"
                />
              </div>

              <v-row class="mb-2">
                <v-col cols="12" md="4">
                  <v-card class="script-card pa-5 h-100">
                    <div class="section-title mb-2">可交付稿件</div>
                    <div class="text-h4 font-weight-bold">
                      {{ deliverableCount }} <span class="text-body-2 text-medium-emphasis">/ {{ checklistRows.length * LANGUAGES.length }} 个语言稿件</span>
                    </div>
                    <div class="text-body-2 text-medium-emphasis mt-2">{{ hallSummary.deliverableExhibits }} 个展项全部语言齐备，可整体交付</div>
                    <div class="mt-3 d-flex flex-wrap ga-2">
                      <v-chip v-for="lang in LANGUAGES" :key="lang.id" size="small" variant="tonal" :color="hallSummary.perLanguage[lang.id].deliverable === hallSummary.perLanguage[lang.id].total && hallSummary.perLanguage[lang.id].total > 0 ? 'success' : 'grey'">
                        {{ lang.shortLabel }} {{ hallSummary.perLanguage[lang.id].deliverable }}/{{ hallSummary.perLanguage[lang.id].total }}
                      </v-chip>
                    </div>
                  </v-card>
                </v-col>
                <v-col cols="12" md="4">
                  <v-card class="script-card pa-5 h-100">
                    <div class="section-title mb-2">待办</div>
                    <div class="text-h4 font-weight-bold">{{ hallSummary.issueCount }} <span class="text-body-2 text-medium-emphasis">项</span></div>
                    <div class="text-body-2 text-medium-emphasis mt-2">缺来源、段落未确认、时长偏差超过一成都会列入待办</div>
                    <div class="mt-3 d-flex flex-wrap ga-2">
                      <v-chip v-if="hallSummary.durationIssues" size="small" color="warning" variant="tonal">时长偏差 {{ hallSummary.durationIssues }}</v-chip>
                      <v-chip v-if="hallSummary.sourceIssues" size="small" color="warning" variant="tonal">来源待办 {{ hallSummary.sourceIssues }}</v-chip>
                      <v-chip v-if="hallSummary.segmentIssues" size="small" color="warning" variant="tonal">段落未确认 {{ hallSummary.segmentIssues }}</v-chip>
                      <span v-if="!hallSummary.issueCount" class="text-body-2 text-success">当前展厅没有待办</span>
                    </div>
                  </v-card>
                </v-col>
                <v-col cols="12" md="4">
                  <v-card class="script-card pa-5 h-100">
                    <div class="section-title mb-2">已交付</div>
                    <div class="text-h4 font-weight-bold">{{ hallSummary.delivered }} <span class="text-body-2 text-medium-emphasis">个展项</span></div>
                    <div class="text-body-2 text-medium-emphasis mt-2">交付后改动标题、讲解词、无障碍描述、时长或段落，交付标记自动撤回并重新生成待办</div>
                  </v-card>
                </v-col>
              </v-row>

              <v-empty-state v-if="!checklistRows.length" icon="mdi-clipboard-list-outline" title="当前展厅暂无展项" text="请切换其他展厅查看交付清单。" />

              <v-card v-for="row in checklistRows" :key="row.exhibit.id" class="script-card pa-4 pa-md-5 mb-4">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3">
                  <div class="d-flex align-center ga-3 flex-wrap">
                    <v-chip variant="outlined">{{ row.exhibit.code }}</v-chip>
                    <div>
                      <div class="text-h6 font-weight-bold">{{ row.exhibit.title }}</div>
                      <div class="text-caption text-medium-emphasis">
                        <template v-if="row.delivered">已于 {{ formatTime(row.delivered.deliveredAt) }} 交付</template>
                        <template v-else-if="row.issues.length">{{ row.issues.length }} 项待办</template>
                        <template v-else>全部语言就绪，可交付</template>
                      </div>
                    </div>
                    <v-chip v-if="row.delivered" color="success" size="small" variant="tonal">已交付</v-chip>
                    <v-chip v-else-if="!row.issues.length" color="primary" size="small" variant="tonal">可交付</v-chip>
                    <v-chip v-else color="warning" size="small" variant="tonal">待办 {{ row.issues.length }}</v-chip>
                  </div>
                  <div class="d-flex align-center ga-2 flex-wrap">
                    <v-btn v-if="row.delivered" variant="outlined" color="error" size="small" @click="withdrawTarget = row.exhibit.id">撤回交付</v-btn>
                    <v-btn v-else color="primary" :disabled="row.issues.length > 0" @click="store.deliverExhibit(row.exhibit.id)">标记交付</v-btn>
                  </div>
                </div>

                <v-alert v-if="row.withdrawn" class="mt-4" type="warning" variant="tonal" density="compact">
                  交付标记已于 {{ formatTime(row.withdrawn.withdrawnAt || '') }} 撤回<template v-if="row.withdrawn.withdrawnReason === 'changed'">：检测到{{ changedSummary(row.withdrawn) }}改动</template><template v-else>（手动撤回）</template>。请重新处理待办后再交付。
                </v-alert>

                <div class="d-flex flex-wrap align-center ga-3 mt-4">
                  <v-text-field
                    :model-value="row.exhibit.targetDurationMinutes ?? ''"
                    type="number"
                    min="0"
                    step="0.5"
                    density="compact"
                    hide-details
                    style="max-width:230px"
                    label="目标朗读时长（分钟）"
                    :aria-label="`${row.exhibit.title} 目标朗读时长`"
                    @change="saveTarget(row.exhibit.id, $event)"
                  />
                  <span class="text-caption text-medium-emphasis">预计时长与目标偏差超过一成（10%）将列入待办</span>
                </div>

                <div class="mt-4 d-flex flex-column ga-3">
                  <div v-for="lang in LANGUAGES" :key="lang.id" class="delivery-lang-row">
                    <div class="d-flex flex-wrap align-center ga-3">
                      <v-avatar size="30" :color="isLanguageDeliverable(row.exhibit, lang.id) ? 'success' : 'grey-lighten-2'" :class="isLanguageDeliverable(row.exhibit, lang.id) ? 'text-white' : ''">{{ lang.shortLabel }}</v-avatar>
                      <div class="flex-grow-1" style="min-width:220px">
                        <div class="d-flex align-center ga-2 flex-wrap">
                          <span class="font-weight-medium">{{ lang.label }}</span>
                          <v-chip size="x-small" :color="statusColor(row.exhibit.drafts.find(item => item.languageId === lang.id)?.status)" variant="tonal">
                            {{ row.exhibit.drafts.find(item => item.languageId === lang.id) ? store.statusLabel(row.exhibit.drafts.find(item => item.languageId === lang.id)!.status) : '未创建' }}
                          </v-chip>
                          <v-chip v-if="isLanguageDeliverable(row.exhibit, lang.id)" size="x-small" color="success" variant="tonal">可交付</v-chip>
                        </div>
                        <div class="text-caption text-medium-emphasis mt-1">
                          <template v-if="row.exhibit.drafts.find(item => item.languageId === lang.id)">
                            预计 {{ formatDuration(row.exhibit.drafts.find(item => item.languageId === lang.id)!.durationMinutes) }} · 偏差 {{ deviationText(row.exhibit, lang.id) }} ·
                            段落 {{ row.exhibit.drafts.find(item => item.languageId === lang.id)!.segments.filter(item => item.locked).length }}/{{ row.exhibit.drafts.find(item => item.languageId === lang.id)!.segments.length }} 已确认 ·
                            来源 {{ row.exhibit.drafts.find(item => item.languageId === lang.id)!.sourceVerified ? `已核验（${row.exhibit.drafts.find(item => item.languageId === lang.id)!.sourceVerifiedBy || '未留名'}）` : (row.exhibit.drafts.find(item => item.languageId === lang.id)!.sources ? '未核验' : '缺失') }}
                          </template>
                          <template v-else>尚未建立该语言稿件</template>
                        </div>
                      </div>
                      <v-btn size="small" variant="text" @click="goToLanguage(row.exhibit, lang.id)">打开</v-btn>
                    </div>
                  </div>
                </div>

                <template v-if="row.issues.length">
                  <div class="section-title mt-5 mb-2">待办清单</div>
                  <v-list density="compact" class="bg-transparent">
                    <v-list-item
                      v-for="(issue, issueIndex) in row.issues"
                      :key="issueIndex"
                      class="issue-item"
                      rounded="lg"
                      prepend-icon="mdi-alert-circle-outline"
                      :title="issue.message"
                      @click="goToIssue(row.exhibit, issue)"
                    />
                  </v-list>
                </template>
                <v-alert v-else class="mt-4" type="success" variant="tonal" density="compact">
                  全部语言已定稿、段落已确认、来源已核验，预计时长偏差在一成以内。
                </v-alert>
              </v-card>
            </v-window-item>

            <v-window-item value="versions">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">版本比较</div>
                    <div class="text-h6 font-weight-bold mt-1">选择同一展项、同一语言的两个快照</div>
                  </div>
                  <v-btn color="primary" prepend-icon="mdi-content-save-plus-outline" @click="versionDialog = true">保存当前版本</v-btn>
                </div>
                <v-alert v-if="versions.length < 2" type="info" variant="tonal">至少保存两个版本后即可比较。当前有 {{ versions.length }} 个版本。</v-alert>
                <template v-else>
                  <v-row>
                    <v-col cols="12" md="6"><v-select v-model="compareA" :items="versions" item-title="name" item-value="id" label="基准版本" /></v-col>
                    <v-col cols="12" md="6"><v-select v-model="compareB" :items="versions" item-title="name" item-value="id" label="目标版本" /></v-col>
                  </v-row>
                  <div class="d-flex ga-4 text-caption text-medium-emphasis mb-2">
                    <span><span class="status-dot" style="background:#9b2c25" /> 删除</span>
                    <span><span class="status-dot" style="background:#2f6b45" /> 新增</span>
                  </div>
                  <div class="rounded-lg border pa-3 bg-white">
                    <p v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="`diff-${line.type}`">{{ line.text }}</p>
                    <div v-if="!diffLines.length" class="text-medium-emphasis pa-4">所选版本内容一致。</div>
                  </div>
                  <v-list class="mt-4 bg-transparent">
                    <v-list-item v-for="version in versions" :key="version.id" :title="version.name" :subtitle="formatTime(version.createdAt)">
                      <template #append><v-btn variant="outlined" size="small" @click="store.restoreVersion(version.id)">恢复此版</v-btn></template>
                    </v-list-item>
                  </v-list>
                </template>
              </v-card>
            </v-window-item>

            <v-window-item value="preview">
              <v-card class="script-card pa-4 pa-md-6">
                <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-5">
                  <div>
                    <div class="section-title">设备排版预览</div>
                    <div class="text-h6 font-weight-bold mt-1">以展项实际阅读顺序预览</div>
                  </div>
                  <v-btn-toggle v-model="device" mandatory variant="outlined" divided>
                    <v-btn v-for="item in deviceOptions" :key="item.value" :value="item.value">{{ item.label }}</v-btn>
                  </v-btn-toggle>
                </div>
                <div class="preview-frame" :class="device">
                  <div class="preview-content">
                    <div class="text-overline text-medium-emphasis">{{ exhibit?.code }} · {{ currentLanguage?.label }}</div>
                    <h2 class="text-h4 font-weight-bold mt-2">{{ draft.title }}</h2>
                    <p class="text-body-1 mt-6" style="line-height:1.9;white-space:pre-wrap">{{ draft.narration }}</p>
                    <v-divider class="my-6" />
                    <div class="section-title">无障碍描述</div>
                    <p class="text-body-2 mt-2" style="line-height:1.8;white-space:pre-wrap">{{ draft.accessibility }}</p>
                    <div class="mt-7 text-caption text-medium-emphasis">预计讲解 {{ draft.durationMinutes }} 分钟</div>
                  </div>
                </div>
              </v-card>
            </v-window-item>

            <v-window-item value="sources">
              <v-row>
                <v-col cols="12" md="7">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">来源与核验记录</div>
                    <div class="d-flex flex-wrap align-center ga-3 mb-4">
                      <v-checkbox
                        :model-value="Boolean(draft.sourceVerified)"
                        label="来源已核验"
                        hide-details
                        density="compact"
                        :aria-label="`${currentLanguage?.label}来源核验标记`"
                        @update:model-value="toggleSourceVerified"
                      />
                      <v-text-field
                        :model-value="verifierFor(store.selectedExhibitId, store.selectedLanguageId)"
                        label="核验人"
                        density="compact"
                        hide-details
                        style="max-width:200px"
                        @update:model-value="setVerifier(store.selectedExhibitId, store.selectedLanguageId, $event)"
                      />
                      <span v-if="draft.sourceVerifiedAt" class="text-caption text-medium-emphasis">登记于 {{ formatTime(draft.sourceVerifiedAt) }}</span>
                    </div>
                    <v-alert v-if="!draft.sourceVerified" class="mb-4" type="warning" variant="tonal" density="compact">来源尚未核验登记，展项交付前必须完成核验。</v-alert>
                    <v-textarea :model-value="draft.sources" rows="8" @change="saveDraftField('sources', $event)" />
                    <v-alert class="mt-4" type="warning" variant="tonal">发布前请由内容负责人逐条核对来源。当前无障碍描述与实物尺寸需由教育部门复核。</v-alert>
                  </v-card>
                </v-col>
                <v-col cols="12" md="5">
                  <v-card class="script-card pa-5">
                    <div class="section-title mb-3">段落锁定概况</div>
                    <v-timeline density="compact" side="end">
                      <v-timeline-item v-for="segment in draft.segments" :key="segment.id" :dot-color="segment.locked ? 'success' : 'grey'" size="small">
                        <div class="font-weight-medium">{{ segment.label }}</div>
                        <div class="text-caption text-medium-emphasis">{{ segment.locked ? '已锁定，审校确认' : '编辑中' }}</div>
                      </v-timeline-item>
                    </v-timeline>
                  </v-card>
                </v-col>
              </v-row>
            </v-window-item>
          </v-window>
        </div>
        <v-empty-state v-else icon="mdi-script-text-outline" title="尚未选择展项" text="请从左侧选择一个展厅和展项。" />
      </div>
    </v-main>

    <v-dialog v-model="versionDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>保存版本快照</v-card-title>
        <v-card-text>
          <p class="mb-4 text-medium-emphasis">将当前“{{ draft?.title }}”的完整内容和锁定状态保存为只读版本。</p>
          <v-text-field v-model="versionName" label="版本名称（可选）" autofocus @keyup.enter="submitVersion" />
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="versionDialog = false">取消</v-btn><v-btn color="primary" @click="submitVersion">保存快照</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(deleteTarget)" max-width="440" @update:model-value="deleteTarget = null">
      <v-card class="pa-3">
        <v-card-title>删除这个段落？</v-card-title>
        <v-card-text>删除后可使用撤销恢复。</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="deleteTarget = null">取消</v-btn><v-btn color="error" @click="confirmDelete">删除</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(withdrawTarget)" max-width="440" @update:model-value="withdrawTarget = null">
      <v-card class="pa-3">
        <v-card-title>撤回交付标记？</v-card-title>
        <v-card-text>撤回后展项回到待办状态，需重新满足全部语言定稿、段落确认、来源核验与时长要求后再交付。</v-card-text>
        <v-card-actions><v-spacer /><v-btn @click="withdrawTarget = null">取消</v-btn><v-btn color="error" @click="confirmWithdraw">撤回交付</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="helpDialog" max-width="520">
      <v-card class="pa-3">
        <v-card-title>键盘操作</v-card-title>
        <v-card-text>
          <v-list>
            <v-list-item prepend-icon="mdi-apple-keyboard-command" title="Ctrl / ⌘ + Z" subtitle="撤销上一步编辑" />
            <v-list-item prepend-icon="mdi-redo" title="Ctrl / ⌘ + Shift + Z" subtitle="重做" />
            <v-list-item prepend-icon="mdi-content-save-outline" title="Ctrl / ⌘ + S" subtitle="保存当前版本快照" />
            <v-list-item prepend-icon="mdi-keyboard-tab" title="Tab / Shift + Tab" subtitle="在字段、状态与段落操作之间移动" />
          </v-list>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn color="primary" @click="helpDialog = false">知道了</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar :model-value="Boolean(store.notice)" timeout="2600" location="bottom right" @update:model-value="store.notice = ''">
      {{ store.notice }}
      <template #actions><v-btn variant="text" @click="store.notice = ''">关闭</v-btn></template>
    </v-snackbar>
  </v-app>
</template>
