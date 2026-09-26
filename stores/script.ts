import { defineStore } from 'pinia'
import type { DeliveryIssue, DeliveryRecord, DeliveredDraftState, Exhibit, Hall, Language, LanguageDraft, PersistedState, ScriptStatus, Segment, VersionSnapshot } from '~/types'

export const LANGUAGES: Language[] = [
  { id: 'zh', code: 'zh-CN', label: '简体中文', shortLabel: '中' },
  { id: 'en', code: 'en-US', label: 'English', shortLabel: 'EN' },
  { id: 'ja', code: 'ja-JP', label: '日本語', shortLabel: '日' }
]

const STORAGE_KEY = 'museum-script-studio-v1'
/** 预计时长与目标时长允许的偏差比例：一成 */
export const DURATION_TOLERANCE = 0.1

const segments = (prefix: string, values: Array<[string, string, boolean?]>): Segment[] => values.map(([label, content, locked], index) => ({
  id: `${prefix}-${index + 1}`,
  label,
  content,
  locked: Boolean(locked)
}))

/** 展项维度的交付评估：返回全部待办，为空即满足交付条件 */
export function evaluateExhibit(exhibit: Exhibit): DeliveryIssue[] {
  const issues: DeliveryIssue[] = []
  const hasTarget = typeof exhibit.targetDurationMinutes === 'number' && exhibit.targetDurationMinutes > 0
  if (!hasTarget) {
    issues.push({ code: 'target-missing', languageId: '', message: '尚未为展项设定目标朗读时长' })
  }

  for (const lang of LANGUAGES) {
    const prefix = `[${lang.label}] `
    const draft = exhibit.drafts.find(item => item.languageId === lang.id)
    if (!draft) {
      issues.push({ code: 'missing-draft', languageId: lang.id, message: `${prefix}尚未建立稿件` })
      continue
    }
    if (!draft.title.trim()) issues.push({ code: 'missing-title', languageId: lang.id, message: `${prefix}缺少展项标题` })
    if (!draft.narration.trim()) issues.push({ code: 'missing-narration', languageId: lang.id, message: `${prefix}缺少讲解词` })
    if (!draft.accessibility.trim()) issues.push({ code: 'missing-accessibility', languageId: lang.id, message: `${prefix}缺少无障碍描述` })
    if (!draft.sources.trim()) {
      issues.push({ code: 'missing-source', languageId: lang.id, message: `${prefix}缺少资料来源` })
    } else if (!draft.sourceVerified) {
      issues.push({ code: 'source-unverified', languageId: lang.id, message: `${prefix}来源尚未核验登记` })
    }
    if (draft.status !== 'approved') issues.push({ code: 'not-approved', languageId: lang.id, message: `${prefix}尚未定稿` })
    if (draft.segments.length === 0) {
      issues.push({ code: 'no-segments', languageId: lang.id, message: `${prefix}缺少校对段落` })
    } else if (draft.segments.some(segment => !segment.locked)) {
      const pending = draft.segments.filter(segment => !segment.locked).length
      issues.push({ code: 'segments-unconfirmed', languageId: lang.id, message: `${prefix}${pending} 个段落尚未确认锁定` })
    }
    if (!(draft.durationMinutes > 0)) {
      issues.push({ code: 'duration-invalid', languageId: lang.id, message: `${prefix}预计朗读时长无效` })
    } else if (hasTarget && deviationRatio(exhibit.targetDurationMinutes as number, draft.durationMinutes) > DURATION_TOLERANCE) {
      const percent = Math.round(deviationRatio(exhibit.targetDurationMinutes as number, draft.durationMinutes) * 100)
      issues.push({ code: 'duration-mismatch', languageId: lang.id, message: `${prefix}预计 ${draft.durationMinutes} 分钟，与目标 ${exhibit.targetDurationMinutes} 分钟偏差 ${percent}%，超过一成` })
    }
  }
  return issues
}

export function deviationRatio(targetMinutes: number, actualMinutes: number): number {
  if (!(targetMinutes > 0)) return 0
  return Math.abs(actualMinutes - targetMinutes) / targetMinutes
}

export function formatDuration(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${Math.round(value * 10) / 10} 分钟`
}

function demoState(): PersistedState {
  const halls: Hall[] = [
    { id: 'hall-ancient', name: '文明肇始厅', description: '史前至先秦文明，共 18 个展项' },
    { id: 'hall-silk', name: '丝路交融厅', description: '丝绸之路上的器物、信仰与生活' },
    { id: 'hall-city', name: '城市记忆厅', description: '近现代城市空间与市民生活' }
  ]
  const exhibits: Exhibit[] = [
    {
      id: 'exhibit-jade', hallId: 'hall-ancient', code: 'A-03', title: '玉琮：沟通天地的礼器', order: 3, targetDurationMinutes: 2.5,
      drafts: [
        {
          id: 'draft-jade-zh', languageId: 'zh', title: '玉琮：沟通天地的礼器',
          narration: '这件玉琮出土于长江下游的良渚遗址。它外方内圆，四角雕刻神人兽面纹，体现了新石器时代晚期精湛的玉器工艺。',
          accessibility: '玉琮为深青色，高约二十厘米。触摸模型可感受方形四角与中央圆孔；圆孔贯穿器身。',
          durationMinutes: 2.5, sources: '《中国玉器全集》第一卷；本馆藏品档案 1987-J-042',
          status: 'approved', updatedAt: '2026-09-23T08:35:00.000Z',
          sourceVerified: true, sourceVerifiedBy: '王岚', sourceVerifiedAt: '2026-09-23T08:40:00.000Z',
          segments: segments('jade-zh', [
            ['开场定位', '这件玉琮来自距今约五千年的良渚文化。', true],
            ['器物观察', '它外方内圆，四角雕刻神人兽面纹。', true],
            ['文化含义', '玉琮常被看作沟通天地的礼器，也象征权力与身份。', true],
            ['参观提示', '请沿展柜顺时针观察，触摸复制品前先使用免洗消毒液。', true]
          ])
        },
        {
          id: 'draft-jade-en', languageId: 'en', title: 'Jade Cong: A Ritual Object Between Heaven and Earth',
          narration: 'This jade cong was made by the Liangzhu culture. Its square exterior and circular bore embody an early Chinese vision of the cosmos.',
          accessibility: 'The object is dark green. A tactile model shows four corners, carved faces, and a central circular opening.',
          durationMinutes: 2.3, sources: 'Complete Collection of Chinese Jades, Vol. 1; Museum accession 1987-J-042',
          status: 'review', updatedAt: '2026-09-24T02:15:00.000Z',
          sourceVerified: true, sourceVerifiedBy: '王岚', sourceVerifiedAt: '2026-09-24T02:30:00.000Z',
          segments: segments('jade-en', [
            ['Introduction', 'This jade cong is about five thousand years old.', true],
            ['Visual description', 'Its square body encloses a circular opening, while spirit-and-animal motifs cover the corners.'],
            ['Meaning', 'Jade cong is understood as a ritual link between heaven and earth.']
          ])
        },
        {
          id: 'draft-jade-ja', languageId: 'ja', title: '玉琮：天と地を結ぶ礼器',
          narration: 'こちらは良渚文化の玉琮です。外側は方形、中央は円形で、四隅には神人獣面文が刻まれています。',
          accessibility: '暗い青緑色の玉製です。複製模型では四つの角と中央の円孔を触って確認できます。',
          durationMinutes: 2.6, sources: '『中国玉器全集』第一巻；収蔵資料 1987-J-042',
          status: 'draft', updatedAt: '2026-09-21T06:10:00.000Z',
          segments: segments('jade-ja', [
            ['導入', '約五千年前の良渚文化を代表する玉琮です。'],
            ['観察', '外側は方形、中央は円形で、四隅に精緻な文様があります。'],
            ['意味', '天地を結ぶ礼器として、力と身分を象徴しました。']
          ])
        }
      ]
    },
    {
      id: 'exhibit-bronze', hallId: 'hall-ancient', code: 'A-08', title: '青铜爵与礼制', order: 8, targetDurationMinutes: 3,
      drafts: [
        {
          id: 'draft-bronze-zh', languageId: 'zh', title: '青铜爵与礼制',
          narration: '爵是最早的青铜酒器之一。三足稳定器身，长流便于倾倒，柱饰则与商周礼仪密切相关。',
          accessibility: '器物为青铜色，器口一侧有长流，底部三足支撑。复制件配有可触摸的局部纹样。',
          durationMinutes: 3, sources: '《殷周青铜器通论》；展品说明卡 A-08',
          status: 'returned', updatedAt: '2026-09-23T11:20:00.000Z',
          sourceVerified: true, sourceVerifiedBy: '陈墨', sourceVerifiedAt: '2026-09-22T09:30:00.000Z',
          segments: segments('bronze-zh', [
            ['器物介绍', '这是一件商代青铜爵，用于温酒和饮酒。'],
            ['结构说明', '三足使器身稳定，前端的流便于倾倒。'],
            ['礼制背景', '青铜器数量与形制反映了使用者的身份。'],
            ['修改说明', '审校意见：补充“柱饰”的用途，并核对年代。']
          ])
        },
        {
          id: 'draft-bronze-en', languageId: 'en', title: 'Bronze Jue and Ritual Order',
          narration: 'The jue was among the earliest bronze drinking vessels. Its tripod base, pouring spout, and posts were closely tied to Shang and Zhou ritual.',
          accessibility: 'The tactile replica includes the long spout, tripod feet, and raised posts.',
          durationMinutes: 2.8, sources: 'A General Survey of Yin-Zhou Bronzes; Gallery label A-08',
          status: 'draft', updatedAt: '2026-09-22T09:00:00.000Z',
          segments: segments('bronze-en', [['Object', 'This bronze jue dates to the Shang dynasty.'], ['Structure', 'Three legs support the body; the long spout guides the pour.']])
        }
      ]
    },
    {
      id: 'exhibit-silk', hallId: 'hall-silk', code: 'B-02', title: '织机与丝路纹样', order: 2, targetDurationMinutes: 3.5,
      drafts: [{
        id: 'draft-silk-zh', languageId: 'zh', title: '织机与丝路纹样',
        narration: '织机把一根根丝线组织成布匹，也把不同地区的图案与故事连接在一起。',
        accessibility: '体验区提供放大纹样、凸点经纬结构以及可操作的小型织机模型。',
        durationMinutes: 4, sources: '馆内教育活动资料；丝绸之路纺织史专题',
        status: 'draft', updatedAt: '2026-09-20T03:00:00.000Z',
        segments: segments('silk-zh', [['序言', '丝绸不只是一种材料，也是交流的媒介。'], ['互动', '请试着推动梭子，观察经纬线如何交会。']])
      }]
    }
  ]
  return {
    halls,
    exhibits,
    versions: [],
    deliveries: [],
    selectedHallId: halls[0].id,
    selectedExhibitId: exhibits[0].id,
    selectedLanguageId: 'zh',
    lastSavedAt: new Date().toISOString()
  }
}

let reconcileQueued = false

export const useScriptStore = defineStore('museum-script', {
  state: () => ({
    halls: [] as Hall[],
    exhibits: [] as Exhibit[],
    versions: [] as VersionSnapshot[],
    deliveries: [] as DeliveryRecord[],
    selectedHallId: '',
    selectedExhibitId: '',
    selectedLanguageId: 'zh',
    lastSavedAt: '',
    hydrated: false,
    past: [] as string[],
    future: [] as string[],
    notice: ''
  }),
  getters: {
    selectedHall(state): Hall | undefined {
      return state.halls.find(hall => hall.id === state.selectedHallId)
    },
    hallExhibits(state): Exhibit[] {
      return state.exhibits.filter(exhibit => exhibit.hallId === state.selectedHallId).sort((a, b) => a.order - b.order)
    },
    selectedExhibit(state): Exhibit | undefined {
      return state.exhibits.find(exhibit => exhibit.id === state.selectedExhibitId)
    },
    selectedDraft(): LanguageDraft | undefined {
      return this.selectedExhibit?.drafts.find(draft => draft.languageId === this.selectedLanguageId)
    },
    wordCount(): number {
      return (this.selectedDraft?.narration || '').replace(/\s/g, '').length
    },
    canUndo(state): boolean { return state.past.length > 0 },
    canRedo(state): boolean { return state.future.length > 0 }
  },
  actions: {
    hydrate() {
      if (this.hydrated || typeof localStorage === 'undefined') return
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const data = JSON.parse(saved) as Partial<PersistedState>
          this.$patch({
            halls: data.halls || [],
            exhibits: data.exhibits || [],
            versions: data.versions || [],
            deliveries: Array.isArray(data.deliveries) ? data.deliveries : [],
            selectedHallId: data.selectedHallId || '',
            selectedExhibitId: data.selectedExhibitId || '',
            selectedLanguageId: data.selectedLanguageId || 'zh',
            lastSavedAt: data.lastSavedAt || '',
            hydrated: true
          })
          if (!this.halls.length || !this.exhibits.length) this.resetDemo()
        } catch {
          this.resetDemo()
        }
      } else {
        this.resetDemo()
      }
      this.ensureSelection()
      this.hydrated = true
      if (this.reconcileDeliveries().length) this.persist()
    },
    resetDemo() {
      this.$patch({ ...demoState(), hydrated: true, past: [], future: [] })
      this.persist()
      this.notice = '示例数据已就绪，可直接开始编辑。'
    },
    snapshot(): string {
      return JSON.stringify({
        halls: this.halls,
        exhibits: this.exhibits,
        versions: this.versions,
        deliveries: this.deliveries
      })
    },
    commit(mutator: () => void) {
      this.past.push(this.snapshot())
      if (this.past.length > 50) this.past.shift()
      this.future = []
      mutator()
      this.lastSavedAt = new Date().toISOString()
      this.persist()
      this.scheduleReconcile()
    },
    persist() {
      if (typeof localStorage === 'undefined') return
      const data: PersistedState = {
        halls: this.halls, exhibits: this.exhibits, versions: this.versions, deliveries: this.deliveries,
        selectedHallId: this.selectedHallId, selectedExhibitId: this.selectedExhibitId,
        selectedLanguageId: this.selectedLanguageId, lastSavedAt: this.lastSavedAt
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    },
    ensureSelection() {
      if (!this.halls.some(hall => hall.id === this.selectedHallId)) this.selectedHallId = this.halls[0]?.id || ''
      const inHall = this.exhibits.filter(exhibit => exhibit.hallId === this.selectedHallId)
      if (!inHall.some(exhibit => exhibit.id === this.selectedExhibitId)) this.selectedExhibitId = inHall[0]?.id || ''
      const exhibit = this.selectedExhibit
      if (!exhibit?.drafts.some(draft => draft.languageId === this.selectedLanguageId)) this.selectedLanguageId = exhibit?.drafts[0]?.languageId || 'zh'
    },
    selectHall(id: string) {
      this.selectedHallId = id
      const exhibit = this.exhibits.find(item => item.hallId === id)
      this.selectedExhibitId = exhibit?.id || ''
      this.ensureSelection()
      this.persist()
    },
    selectExhibit(id: string) {
      this.selectedExhibitId = id
      this.ensureSelection()
      this.persist()
    },
    selectLanguage(id: string) {
      this.selectedLanguageId = id
      this.persist()
    },
    updateDraft(patch: Partial<Pick<LanguageDraft, 'title' | 'narration' | 'accessibility' | 'durationMinutes' | 'sources'>>) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => Object.assign(draft, patch, { updatedAt: new Date().toISOString() }))
      this.notice = '改动已自动保存到浏览器。'
    },
    updateSegment(id: string, patch: Partial<Pick<Segment, 'label' | 'content'>>) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment || segment.locked) return
      this.commit(() => Object.assign(segment, patch))
    },
    toggleLock(id: string) {
      const segment = this.selectedDraft?.segments.find(item => item.id === id)
      if (!segment) return
      this.commit(() => { segment.locked = !segment.locked })
      this.notice = segment.locked ? '段落已锁定，避免误改。' : '段落已解锁。'
    },
    addSegment() {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => draft.segments.push({ id: `segment-${Date.now()}`, label: `新段落 ${draft.segments.length + 1}`, content: '', locked: false }))
    },
    removeSegment(id: string) {
      const draft = this.selectedDraft
      const segment = draft?.segments.find(item => item.id === id)
      if (!draft || !segment || segment.locked) return
      this.commit(() => { draft.segments = draft.segments.filter(item => item.id !== id) })
    },
    setStatus(status: ScriptStatus) {
      const draft = this.selectedDraft
      if (!draft) return
      this.commit(() => { draft.status = status; draft.updatedAt = new Date().toISOString() })
      this.notice = `状态已更新为“${this.statusLabel(status)}”。`
    },
    setTargetDuration(exhibitId: string, minutes: number | null) {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      if (!exhibit) return
      this.commit(() => { exhibit.targetDurationMinutes = minutes && minutes > 0 ? minutes : undefined })
      this.notice = '目标朗读时长已保存，将按一成偏差核对预计时长。'
    },
    setSourceVerification(exhibitId: string, languageId: string, verified: boolean, verifier: string) {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      const draft = exhibit?.drafts.find(item => item.languageId === languageId)
      if (!draft) return
      this.commit(() => {
        draft.sourceVerified = verified
        if (verified) {
          draft.sourceVerifiedBy = verifier.trim()
          draft.sourceVerifiedAt = new Date().toISOString()
        } else {
          draft.sourceVerifiedBy = ''
          draft.sourceVerifiedAt = ''
        }
        draft.updatedAt = new Date().toISOString()
      })
      this.notice = verified ? '来源核验已登记。' : '来源核验标记已取消，需重新核验后才能交付。'
    },
    statusLabel(status: ScriptStatus) {
      return ({ draft: '草稿', review: '待审', returned: '退回', approved: '已定稿' })[status]
    },
    createVersion(name?: string) {
      const draft = this.selectedDraft
      if (!draft) return
      const version: VersionSnapshot = {
        id: `version-${Date.now()}`,
        exhibitId: this.selectedExhibitId,
        languageId: this.selectedLanguageId,
        name: name || `${new Date().toLocaleString('zh-CN', { hour12: false })} 快照`,
        createdAt: new Date().toISOString(),
        draft: JSON.parse(JSON.stringify(draft))
      }
      this.commit(() => this.versions.unshift(version))
      this.notice = '已保存当前版本，可在版本页比较或恢复。'
    },
    restoreVersion(id: string) {
      const version = this.versions.find(item => item.id === id)
      if (!version) return
      this.commit(() => {
        const exhibit = this.exhibits.find(item => item.id === version.exhibitId)
        if (!exhibit) return
        const index = exhibit.drafts.findIndex(item => item.languageId === version.languageId)
        const restored = JSON.parse(JSON.stringify(version.draft)) as LanguageDraft
        if (index >= 0) exhibit.drafts[index] = restored
        else exhibit.drafts.push(restored)
      })
      this.selectedExhibitId = version.exhibitId
      this.selectedLanguageId = version.languageId
      this.notice = '版本已恢复，并作为一次可撤销操作保存。'
    },
    undo() {
      const state = this.past.pop()
      if (!state) return
      this.future.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.scheduleReconcile()
      this.notice = '已撤销上一步。'
    },
    redo() {
      const state = this.future.pop()
      if (!state) return
      this.past.push(this.snapshot())
      this.$patch(JSON.parse(state))
      this.lastSavedAt = new Date().toISOString()
      this.ensureSelection()
      this.persist()
      this.scheduleReconcile()
      this.notice = '已重做。'
    },
    completionFor(exhibit: Exhibit, languageId: string): number {
      const draft = exhibit.drafts.find(item => item.languageId === languageId)
      if (!draft) return 0
      const checks = [draft.title, draft.narration, draft.accessibility, draft.sources, draft.segments.length > 0 ? 'segments' : '']
      return Math.round(checks.filter(Boolean).length / checks.length * 100)
    },
    /** 当前仍有效的交付记录（不含已撤回） */
    activeDelivery(exhibitId: string): DeliveryRecord | undefined {
      return this.deliveries.find(record => record.exhibitId === exhibitId && !record.withdrawnAt)
    },
    /** 最新一条交付记录，含已撤回，用于提示撤回原因 */
    latestDelivery(exhibitId: string): DeliveryRecord | undefined {
      const records = this.deliveries.filter(record => record.exhibitId === exhibitId)
      return records.sort((a, b) => (a.withdrawnAt || a.deliveredAt) < (b.withdrawnAt || b.deliveredAt) ? 1 : -1)[0]
    },
    /** 交付：全部语言定稿、段落确认、来源核验且无待办时才能标记 */
    deliverExhibit(exhibitId: string): boolean {
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      if (!exhibit) return false
      const issues = evaluateExhibit(exhibit)
      if (issues.length) {
        this.notice = `“${exhibit.title}”仍有 ${issues.length} 项交付待办，全部解决后才能交付。`
        return false
      }
      const record: DeliveryRecord = {
        id: `delivery-${Date.now()}`,
        exhibitId,
        deliveredAt: new Date().toISOString(),
        targetDurationMinutes: typeof exhibit.targetDurationMinutes === 'number' ? exhibit.targetDurationMinutes : null,
        drafts: exhibit.drafts.map(draft => this.freezeDraft(draft))
      }
      this.commit(() => {
        this.deliveries = this.deliveries.filter(item => item.exhibitId !== exhibitId)
        this.deliveries.push(record)
      })
      this.notice = `展项“${exhibit.title}”全部语言已定稿、段落已确认且来源已核验，正式交付。`
      return true
    },
    /** 手动撤回交付标记 */
    withdrawExhibit(exhibitId: string) {
      const record = this.deliveries.find(item => item.exhibitId === exhibitId && !item.withdrawnAt)
      if (!record) return
      this.commit(() => {
        record.withdrawnAt = new Date().toISOString()
        record.withdrawnReason = 'manual'
        record.changedFields = []
      })
      const exhibit = this.exhibits.find(item => item.id === exhibitId)
      this.notice = `已撤回“${exhibit?.title || '展项'}”的交付标记，请重新处理待办后再交付。`
    },
    freezeDraft(draft: LanguageDraft): DeliveredDraftState {
      return {
        languageId: draft.languageId,
        title: draft.title,
        narration: draft.narration,
        accessibility: draft.accessibility,
        durationMinutes: draft.durationMinutes,
        sources: draft.sources,
        status: draft.status,
        sourceVerified: Boolean(draft.sourceVerified),
        segments: draft.segments.map(segment => ({
          id: segment.id, label: segment.label, content: segment.content, locked: segment.locked
        }))
      }
    },
    /** 比对当前内容与交付快照，发现标题/讲解词/无障碍描述/时长/段落等改动即撤回交付 */
    diffDelivery(record: DeliveryRecord, exhibit: Exhibit): Array<{ languageId: string; label: string }> {
      const changes: Array<{ languageId: string; label: string }> = []
      const targetNow = typeof exhibit.targetDurationMinutes === 'number' ? exhibit.targetDurationMinutes : null
      if (targetNow !== record.targetDurationMinutes) changes.push({ languageId: '', label: '目标时长' })

      for (const saved of record.drafts) {
        const lang = LANGUAGES.find(item => item.id === saved.languageId)
        const tag = lang ? `${lang.shortLabel} ` : ''
        const current = exhibit.drafts.find(draft => draft.languageId === saved.languageId)
        if (!current) {
          changes.push({ languageId: saved.languageId, label: `${tag}语言稿件` })
          continue
        }
        const checks: Array<[keyof DeliveredDraftState, string]> = [
          ['title', '标题'],
          ['narration', '讲解词'],
          ['accessibility', '无障碍描述'],
          ['durationMinutes', '时长'],
          ['sources', '来源'],
          ['status', '定稿状态'],
          ['sourceVerified', '来源核验']
        ]
        for (const [field, label] of checks) {
          if ((current as unknown as Record<string, unknown>)[field] !== saved[field]) {
            changes.push({ languageId: saved.languageId, label: `${tag}${label}` })
          }
        }
        const sameSegments = current.segments.length === saved.segments.length &&
          current.segments.every((segment, index) => {
            const old = saved.segments[index]
            return segment.id === old.id && segment.label === old.label && segment.content === old.content && segment.locked === old.locked
          })
        if (!sameSegments) changes.push({ languageId: saved.languageId, label: `${tag}段落` })
      }
      for (const draft of exhibit.drafts) {
        if (!record.drafts.some(saved => saved.languageId === draft.languageId)) {
          const lang = LANGUAGES.find(item => item.id === draft.languageId)
          changes.push({ languageId: draft.languageId, label: `${lang ? lang.shortLabel + ' ' : ''}语言稿件` })
        }
      }
      return changes
    },
    reconcileDeliveries(): DeliveryRecord[] {
      const withdrawn: DeliveryRecord[] = []
      for (const record of this.deliveries) {
        if (record.withdrawnAt) continue
        const exhibit = this.exhibits.find(item => item.id === record.exhibitId)
        const changes = exhibit ? this.diffDelivery(record, exhibit) : [{ languageId: '', label: '展项' }]
        if (changes.length) {
          record.withdrawnAt = new Date().toISOString()
          record.withdrawnReason = 'changed'
          record.changedFields = changes
          withdrawn.push(record)
        }
      }
      return withdrawn
    },
    scheduleReconcile() {
      if (reconcileQueued || typeof queueMicrotask === 'undefined') {
        const withdrawn = this.reconcileDeliveries()
        if (withdrawn.length) this.persist()
        return
      }
      reconcileQueued = true
      queueMicrotask(() => {
        reconcileQueued = false
        const withdrawn = this.reconcileDeliveries()
        if (!withdrawn.length) return
        this.persist()
        const names = withdrawn.map(record => this.exhibits.find(item => item.id === record.exhibitId)?.title || '展项').join('、')
        const fields = Array.from(new Set(withdrawn.flatMap(record => (record.changedFields || []).map(field => field.label)))).slice(0, 5).join('、')
        this.notice = `交付标记已撤回：${names}（检测到${fields || '内容'}改动）。请重新处理待办后再交付。`
      })
    }
  }
})
