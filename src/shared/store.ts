import { create } from 'zustand'
import type {
  AppSettings,
  Exercise,
  ExerciseResult,
  Session,
  SubtitleLine,
  VocabItem,
  FreedomLevel,
} from './types'
import { DEFAULT_SETTINGS } from './types'

export interface Snapshot {
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
  pausedForDictation?: boolean
  lastExercises?: Exercise[]
  lastResults?: ExerciseResult[]
  lastSettleSessionId?: string | null
  aiReady?: boolean
  aiProvider?: string
  aiModel?: string
  aiSource?: 'settings' | 'env' | 'grok-build' | 'none'
  pinMode?: 'idle' | 'await_tl' | 'await_br'
  pinTl?: { x: number; y: number } | null
  pinCursor?: { x: number; y: number } | null
  wordAssistVisible?: boolean
}

interface AppStore extends Snapshot {
  toast: string | null
  settleSession: Session | null
  exercises: Exercise[]
  results: ExerciseResult[]
  practiceSource: 'ai' | 'fallback' | null
  hydrated: boolean
  setSnapshot: (s: Partial<Snapshot>) => void
  setToast: (msg: string | null) => void
  setSettle: (s: Session | null) => void
  setPractice: (exercises: Exercise[], source: 'ai' | 'fallback' | null) => void
  addResult: (r: ExerciseResult) => void
  clearResults: () => void
  setHydrated: (v: boolean) => void
}

export const useAppStore = create<AppStore>((set) => ({
  settings: DEFAULT_SETTINGS,
  activeSession: null,
  currentSubtitle: null,
  vocab: [],
  sessions: [],
  ocrRunning: false,
  demoMode: false,
  chineseRevealUntil: 0,
  selectModeUntil: 0,
  pendingUndoWordId: null,
  chineseClarityClicks: 0,
  pausedForDictation: false,
  lastExercises: [],
  lastResults: [],
  lastSettleSessionId: null,
  aiReady: false,
  aiProvider: 'xAI',
  aiModel: 'grok-4.5',
  aiSource: 'none',
  pinMode: 'idle',
  pinTl: null,
  pinCursor: null,
  wordAssistVisible: false,
  toast: null,
  settleSession: null,
  exercises: [],
  results: [],
  practiceSource: null,
  hydrated: false,
  setSnapshot: (s) => set((state) => ({ ...state, ...s })),
  setToast: (toast) => set({ toast }),
  setSettle: (settleSession) => set({ settleSession }),
  setPractice: (exercises, practiceSource) => set({ exercises, practiceSource, results: [] }),
  addResult: (r) => set((st) => ({ results: [...st.results, r] })),
  clearResults: () => set({ results: [] }),
  setHydrated: (hydrated) => set({ hydrated }),
}))

export function freedomOf(level: FreedomLevel) {
  return level
}

export async function hydrateFromMain() {
  if (!window.rehearse) return
  const state = (await window.rehearse.getState()) as Snapshot
  useAppStore.getState().setSnapshot(state)
  useAppStore.getState().setHydrated(true)
  window.rehearse.onState((s) => {
    useAppStore.getState().setSnapshot(s as Snapshot)
  })
  window.rehearse.onSessionEnded((session) => {
    useAppStore.getState().setSettle(session)
  })
}

export function showToast(msg: string, ms = 2200) {
  useAppStore.getState().setToast(msg)
  window.setTimeout(() => {
    if (useAppStore.getState().toast === msg) useAppStore.getState().setToast(null)
  }, ms)
}
