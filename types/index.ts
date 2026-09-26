export type ScriptStatus = 'draft' | 'review' | 'returned' | 'approved'
export type DeviceKind = 'desktop' | 'tablet' | 'mobile' | 'kiosk'

export interface Hall {
  id: string
  name: string
  description: string
}

export interface Segment {
  id: string
  label: string
  content: string
  locked: boolean
}

export interface LanguageDraft {
  id: string
  languageId: string
  title: string
  narration: string
  accessibility: string
  durationMinutes: number
  sources: string
  status: ScriptStatus
  segments: Segment[]
  updatedAt: string
  /** 资料来源是否已经过核验登记 */
  sourceVerified?: boolean
  sourceVerifiedBy?: string
  sourceVerifiedAt?: string
}

export interface Exhibit {
  id: string
  hallId: string
  code: string
  title: string
  order: number
  /** 目标朗读时长（分钟），用于与预计时长核对 */
  targetDurationMinutes?: number
  drafts: LanguageDraft[]
}

export interface Language {
  id: string
  code: string
  label: string
  shortLabel: string
}

export interface VersionSnapshot {
  id: string
  exhibitId: string
  languageId: string
  name: string
  createdAt: string
  draft: LanguageDraft
}

export type DeliveryIssueCode =
  | 'target-missing'
  | 'missing-draft'
  | 'missing-title'
  | 'missing-narration'
  | 'missing-accessibility'
  | 'missing-source'
  | 'source-unverified'
  | 'not-approved'
  | 'no-segments'
  | 'segments-unconfirmed'
  | 'duration-invalid'
  | 'duration-mismatch'

export interface DeliveryIssue {
  code: DeliveryIssueCode
  /** 展项级问题 languageId 为空字符串 */
  languageId: string
  message: string
}

/** 交付时冻结的单语稿件状态，用于交付后比对改动 */
export interface DeliveredDraftState {
  languageId: string
  title: string
  narration: string
  accessibility: string
  durationMinutes: number
  sources: string
  status: ScriptStatus
  sourceVerified: boolean
  segments: Array<{ id: string; label: string; content: string; locked: boolean }>
}

export interface DeliveryRecord {
  id: string
  exhibitId: string
  deliveredAt: string
  targetDurationMinutes: number | null
  drafts: DeliveredDraftState[]
  /** 非空表示交付标记已撤回，需要重新处理待办后再交付 */
  withdrawnAt?: string
  withdrawnReason?: 'changed' | 'manual'
  /** 撤回时检测到的改动项（如：标题、讲解词、无障碍描述、时长、段落） */
  changedFields?: Array<{ languageId: string; label: string }>
}

export interface PersistedState {
  halls: Hall[]
  exhibits: Exhibit[]
  versions: VersionSnapshot[]
  deliveries: DeliveryRecord[]
  selectedHallId: string
  selectedExhibitId: string
  selectedLanguageId: string
  lastSavedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}
