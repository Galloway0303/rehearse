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
    zh: '鑻规灉澶х幓鐠?,
    en: 'Apple liquid glass',
    group: 'glass',
    tipZh: '纾ㄧ爞鐜荤拑锛氶噸妯＄硦+鍗婇€忔槑闆鹃潰锛屼笉鍙戜寒',
    tipEn: 'Matte frosted glass 鈥?heavy blur, not glossy',
  },
  {
    id: 'frost',
    zh: '鍘氶湝纾ㄧ爞',
    en: 'Heavy frost',
    group: 'glass',
    tipZh: '鏇寸硦鐨勯浘闈㈢（鐮?,
    tipEn: 'Denser matte frost',
  },
  {
    id: 'glass',
    zh: '鏌旂劍妯＄硦',
    en: 'Soft blur',
    group: 'glass',
    tipZh: '杞婚珮鏂紝鍋忓厠鍒?,
    tipEn: 'Light Gaussian',
  },
  {
    id: 'slow_blur',
    zh: '缂撴參妯＄硦',
    en: 'Slow blur breathe',
    group: 'glass',
    tipZh: '妯＄硦娣卞害绾?7 绉掍竴杞紝鎱㈡參鍙樻繁/鍙樻祬',
    tipEn: '~7s blur breathe, calm not twitchy',
  },
  {
    id: 'flip',
    zh: '鍊掕繃鏉?,
    en: 'Upside down',
    group: 'hard',
    tipZh: '涓枃 180掳 鍊掔疆锛岄樆鍔涢珮銆佸嚑涔庢棤鍔ㄦ晥',
    tipEn: '180掳 flip 鈥?high friction, no motion noise',
  },
  {
    id: 'shade_wave',
    zh: '鏄庢殫鍛煎惛',
    en: 'Shade wave',
    group: 'motion',
    tipZh: '鏈夌殑鍦版柟鏆楁湁鐨勫湴鏂规紡锛屼細鎱㈡參鍙樻崲',
    tipEn: 'Some dark, some leak 鈥?drifts over time',
  },
  {
    id: 'soft_void',
    zh: '鏌斿拰铏氱┖',
    en: 'Soft void',
    group: 'motion',
    tipZh: '涓績鎸°€佽竟缂樻紡锛屽共鍑€涓嶄笐',
    tipEn: 'Center cover, soft edge leak',
  },
  {
    id: 'smoke',
    zh: '鐑熼浘娓歌蛋',
    en: 'Smoke drift',
    group: 'motion',
    tipZh: '鍥㈢姸鏆楅浘缂撴參绉诲姩',
    tipEn: 'Soft smoke blobs drifting',
  },
  {
    id: 'veil',
    zh: '钖勭罕鍛煎惛',
    en: 'Breathing veil',
    group: 'motion',
    tipZh: '鏁村眰鍗婇€忔槑绾憋紝閫忔槑搴﹀井鍔?,
    tipEn: 'Translucent film, subtle pulse',
  },
  {
    id: 'ripple',
    zh: '姘存尝鐑氮',
    en: 'Ripple / heat',
    group: 'motion',
    tipZh: '妯悜寰尝 + 鏌旂硦',
    tipEn: 'Horizontal ripple + soft blur',
  },
  {
    id: 'prism',
    zh: '妫遍暅鑹叉暎',
    en: 'Prism split',
    group: 'motion',
    tipZh: '杞诲井 RGB 閿欎綅 + 绯?,
    tipEn: 'Soft RGB split',
  },
  {
    id: 'mosaic',
    zh: '鐪熼┈璧涘厠',
    en: 'True mosaic',
    group: 'hard',
    tipZh: '瑙嗛鍍忕礌鍧楋紝闃诲姏绾?7鈥?',
    tipEn: 'Pixelate video, resistance ~7鈥?',
  },
  {
    id: 'glitch',
    zh: '鏁呴殰鍒囩墖',
    en: 'Glitch slices',
    group: 'hard',
    tipZh: '妯潯閿欎綅骞叉壈',
    tipEn: 'Slice offset interference',
  },
  {
    id: 'solid',
    zh: '绾粦閬僵',
    en: 'Solid matte',
    group: 'hard',
    tipZh: '瀹屽叏鎸′綇',
    tipEn: 'Full blackout',
  },
  {
    id: 'blackhole',
    zh: '寮曞姏榛戞礊',
    en: 'Gravity lens black hole',
    group: 'hard',
    tipZh: '鍏夊寮曞姏閫忛暅鎵洸锛屼繚鐣欒壊褰┿€佷笉闃存矇',
    tipEn: 'Optical gravity lens warp 鈥?keeps color, not gloomy',
  },
]

export const MASK_EFFECT_GROUP_LABELS: Record<
  MaskEffectGroup,
  { zh: string; en: string }
> = {
  glass: { zh: '鐜荤拑 / 纾ㄧ爞', en: 'Glass / frost' },
  motion: { zh: '鍔ㄦ€?/ 灞€閮?, en: 'Motion / partial' },
  hard: { zh: '寮洪伄鎸?, en: 'Hard cover' },
  cover: { zh: '閬僵', en: 'Cover' },
}

/** Visual treatment on Chinese line 鈥?must be *obvious* in demo. */
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
