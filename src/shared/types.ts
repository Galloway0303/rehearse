export type Locale = 'en' | 'zh'

export type FreedomLevel = 0 | 1 | 2 | 3 | 4

export type WordStatus = 'new' | 'learning' | 'known'

export type ExerciseType =
  | 'situation'
  | 'cloze'
  | 'ban_literal'
  | 'role'
  | 'contrast'

export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SubtitleLine {
  id: string
  en: string
  zh: string
  t: number
  raw?: string
}

export interface VocabItem {
  id: string
  word: string
  lemma?: string
  status: WordStatus
  sessionId: string
  contextEn: string
  contextZh: string
  prevSentence?: string
  nextSentence?: string
  timestamp: number
  createdAt: number
  reviewCount: number
  correctCount: number
  wrongCount: number
  lastReviewedAt?: number
  note?: string
  kind: 'word' | 'sentence' | 'unclear'
}

export interface Session {
  id: string
  title: string
  showName?: string
  episode?: string
  notes?: string
  startedAt: number
  endedAt?: number
  freedomLevel: FreedomLevel
  subtitleText: string
  subtitleLines: SubtitleLine[]
  wordIds: string[]
  demoMode: boolean
}

export interface Exercise {
  id: string
  type: ExerciseType
  promptEn: string
  promptZh: string
  answer: string
  acceptAlternatives: string[]
  revealSentence: string
  why: string
  hint?: string
  targetWord: string
}

export interface ExerciseResult {
  exerciseId: string
  userAnswer: string
  correct: boolean
  targetWord: string
}

export interface AiSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface OcrSettings {
  intervalMs: number
  lang: 'eng' | 'chi_sim' | 'eng+chi_sim'
}

/**
 * Live CN cover catalog (open-ended 鈥?add ids in MASK_EFFECTS + effects.ts).
 * All sample real video when mask is exclude-from-capture.
 */
export type MaskEffectId =
  | 'mosaic'
  | 'liquid_glass'
  | 'frost'
  | 'glass'
  | 'slow_blur'
  | 'shade_wave'
  | 'soft_void'
  | 'veil'
  | 'smoke'
  | 'prism'
  | 'ripple'
  | 'flip'
  | 'glitch'
  | 'solid'
  | 'blackhole'

/** Where Chinese sits inside the free-selected dual-line box */
export type MaskCnSide = 'top' | 'bottom' | 'full'

export interface AppSettings {
  locale: Locale
  freedomLevel: FreedomLevel
  region: ScreenRect | null
  ai: AiSettings
  ocr: OcrSettings
  onboardingDone: boolean
  adaptiveDecel: boolean
  notifyReview: boolean
  overlayClickThrough: boolean
  chineseMirrorEffect: boolean
  /**
   * Dual-line layout: cover this side of the free box.
   * Default top = 涓枃涓?/ 鑻辨枃涓?(common).
   */
  maskCnSide: MaskCnSide
  /** How much of the box to cover from that side (0.35鈥?.7 typical). Ignored if full. */
  maskCoverRatio: number
  /** @deprecated kept for migration 鈥?mapped to maskCoverRatio / side */
  maskCoverFrom?: number
  maskEffect: MaskEffectId
}

export interface AppStateSnapshot {
  settings: AppSettings
  activeSession: Session | null
  currentSubtitle: SubtitleLine | null
  vocab: VocabItem[]
  sessions: Session[]
  ocrRunning: boolean
  demoMode: boolean
  chineseRevealUntil: number
  selectModeUntil: number
  pendingUndoWordId: string | null
  chineseClarityClicks: number
}

/** xAI 鈥?OpenAI-compatible. Key via settings or env XAI_API_KEY. */
export const DEFAULT_AI: AiSettings = {
  baseUrl: 'https://api.x.ai/v1',
  apiKey: '',
  model: 'grok-4.5',
}

export const XAI_BASE_URL = 'https://api.x.ai/v1'
export const XAI_DEFAULT_MODEL = 'grok-4.5'

export const DEFAULT_OCR: OcrSettings = {
  // slower = less flash (mask hide) + less CPU
  intervalMs: 2200,
  lang: 'eng',
}

export const DEFAULT_SETTINGS: AppSettings = {
  locale: 'en',
  freedomLevel: 2,
  region: null,
  ai: DEFAULT_AI,
  ocr: DEFAULT_OCR,
  onboardingDone: false,
  adaptiveDecel: true,
  notifyReview: true,
  overlayClickThrough: true,
  chineseMirrorEffect: false,
  // 涓枃鍦ㄤ笂銆佽嫳鏂囧湪涓嬶紙甯歌锛?  maskCnSide: 'top',
  maskCoverRatio: 0.5,
  // default: Apple-style liquid glass (beautiful + strong CN friction)
  maskEffect: 'liquid_glass',
}

export type MaskEffectGroup = 'cover' | 'glass' | 'motion' | 'hard'

export const MASK_EFFECTS: {
  id: MaskEffectId
  zh: string
  en: string
  group: MaskEffectGroup
  /** short vibe line */
  tipZh?: string
  tipEn?: string
}[] = [
  {
    id: 'liquid_glass',
    zh: '苹果大玻璃',
    en: 'Apple liquid glass',
    group: 'glass',
    tipZh: '磨砂玻璃：重模糊+半透明雾面，不发亮',
    tipEn: 'Matte frosted glass - heavy blur, not glossy',
  },
  {
    id: 'frost',
    zh: '厚霜磨砂',
    en: 'Heavy frost',
    group: 'glass',
    tipZh: '更糊的雾面磨砂',
    tipEn: 'Denser matte frost',
  },
  {
    id: 'glass',
    zh: '柔焦模糊',
    en: 'Soft blur',
    group: 'glass',
    tipZh: '轻高斯，偏克制',
    tipEn: 'Light Gaussian',
  },
  {
    id: 'slow_blur',
    zh: '缓慢模糊',
    en: 'Slow blur breathe',
    group: 'glass',
    tipZh: '模糊深度约 7 秒一轮，慢慢变深/变浅',
    tipEn: '~7s blur breathe, calm not twitchy',
  },
  {
    id: 'flip',
    zh: '倒过来',
    en: 'Upside down',
    group: 'hard',
    tipZh: '中文 180 倒置，阻力高、几乎无动效',
    tipEn: '180 flip - high friction, no motion noise',
  },
  {
    id: 'shade_wave',
    zh: '明暗呼吸',
    en: 'Shade wave',
    group: 'motion',
    tipZh: '有的地方暗有的地方漏，会慢慢变换',
    tipEn: 'Some dark, some leak - drifts over time',
  },
  {
    id: 'soft_void',
    zh: '柔和虚空',
    en: 'Soft void',
    group: 'motion',
    tipZh: '中心挡、边缘漏，干净不丑',
    tipEn: 'Center cover, soft edge leak',
  },
  {
    id: 'smoke',
    zh: '烟雾游走',
    en: 'Smoke drift',
    group: 'motion',
    tipZh: '团状暗雾缓慢移动',
    tipEn: 'Soft smoke blobs drifting',
  },
  {
    id: 'veil',
    zh: '薄纱呼吸',
    en: 'Breathing veil',
    group: 'motion',
    tipZh: '整层半透明纱，透明度微动',
    tipEn: 'Translucent film, subtle pulse',
  },
  {
    id: 'ripple',
    zh: '水波热浪',
    en: 'Ripple / heat',
    group: 'motion',
    tipZh: '横向微波 + 柔糊',
    tipEn: 'Horizontal ripple + soft blur',
  },
  {
    id: 'prism',
    zh: '棱镜色散',
    en: 'Prism split',
    group: 'motion',
    tipZh: '轻微 RGB 错位 + 糊',
    tipEn: 'Soft RGB split',
  },
  {
    id: 'mosaic',
    zh: '真马赛克',
    en: 'True mosaic',
    group: 'hard',
    tipZh: '视频像素块，阻力约 7-8',
    tipEn: 'Pixelate video, resistance ~7-8',
  },
  {
    id: 'glitch',
    zh: '故障切片',
    en: 'Glitch slices',
    group: 'hard',
    tipZh: '横条错位干扰',
    tipEn: 'Slice offset interference',
  },
  {
    id: 'solid',
    zh: '纯黑遮罩',
    en: 'Solid matte',
    group: 'hard',
    tipZh: '完全挡住',
    tipEn: 'Full blackout',
  },
  {
    id: 'blackhole',
    zh: '引力黑洞',
    en: 'Gravity lens black hole',
    group: 'hard',
    tipZh: '光学引力透镜扭曲，保留色彩、不阴沉',
    tipEn: 'Optical gravity lens warp - keeps color, not gloomy',
  },
]

export const MASK_EFFECT_GROUP_LABELS: Record<
  MaskEffectGroup,
  { zh: string; en: string }
> = {
  glass: { zh: '玻璃 / 磨砂', en: 'Glass / frost' },
  motion: { zh: '动态 / 局部', en: 'Motion / partial' },
  hard: { zh: '强遮挡', en: 'Hard cover' },
  cover: { zh: '遮罩', en: 'Cover' },
}

/** Visual treatment on Chinese line — must be *obvious* in demo. */
export type ZhEffect =
  | 'none'
  | 'soft'
  | 'mosaic'
  | 'glitch'
  | 'warp'
  | 'blackhole'
  | 'scramble'

export interface FreedomPreset {
  level: FreedomLevel
  id: string
  enShow: boolean
  zhMode: 'clear' | 'soft' | 'delayed_blur' | 'hidden' | 'pause_only'
  zhDelayMs: number
  zhBlurPx: number
  zhOpacity: number
  enScale: number
  zhScale: number
  capture: 'none' | 'longpress' | 'hover' | 'click' | 'pause'
  allowMirror: boolean
  /** Primary decelerate effect for Chinese (shown before flash-clear) */
  zhEffect: ZhEffect
}

export const FREEDOM_PRESETS: FreedomPreset[] = [
  {
    level: 0,
    id: 'watch',
    enShow: false,
    zhMode: 'clear',
    zhDelayMs: 0,
    zhBlurPx: 0,
    zhOpacity: 1,
    enScale: 1,
    zhScale: 1,
    capture: 'none',
    allowMirror: false,
    zhEffect: 'none',
  },
  {
    level: 1,
    id: 'light',
    enShow: true,
    zhMode: 'soft',
    zhDelayMs: 200,
    zhBlurPx: 1,
    zhOpacity: 0.5,
    enScale: 1.05,
    zhScale: 0.95,
    capture: 'longpress',
    allowMirror: false,
    zhEffect: 'soft',
  },
  {
    level: 2,
    id: 'standard',
    enShow: true,
    zhMode: 'delayed_blur',
    zhDelayMs: 900,
    zhBlurPx: 6,
    zhOpacity: 0.85,
    enScale: 1.14,
    zhScale: 0.9,
    capture: 'hover',
    allowMirror: false,
    /** Default demo level: mosaic 鈥?impossible to glance-read Chinese */
    zhEffect: 'mosaic',
  },
  {
    level: 3,
    id: 'strict',
    enShow: true,
    zhMode: 'hidden',
    zhDelayMs: 0,
    zhBlurPx: 0,
    zhOpacity: 0,
    enScale: 1.15,
    zhScale: 0.9,
    capture: 'click',
    allowMirror: true,
    zhEffect: 'blackhole',
  },
  {
    level: 4,
    id: 'dictation',
    enShow: false,
    zhMode: 'pause_only',
    zhDelayMs: 0,
    zhBlurPx: 0,
    zhOpacity: 0,
    enScale: 1.1,
    zhScale: 0.9,
    capture: 'pause',
    allowMirror: false,
    zhEffect: 'warp',
  },
]
