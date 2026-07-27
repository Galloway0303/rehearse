import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  Exercise,
  ExerciseResult,
  FreedomLevel,
  ScreenRect,
  Session,
  VocabItem,
} from '../src/shared/types'

const api = {
  getState: () => ipcRenderer.invoke('app:getState'),
  updateSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', partial),
  testAi: () => ipcRenderer.invoke('settings:testAi'),
  openRegionPicker: () => ipcRenderer.invoke('region:openPicker'),
  pinRegionAtCursor: () => ipcRenderer.invoke('region:pinClick'),
  countdownPin: (corner: 'tl' | 'br', seconds?: number) =>
    ipcRenderer.invoke('region:countdown', corner, seconds),
  saveRegion: (rect: ScreenRect) => ipcRenderer.invoke('region:save', rect),
  cancelRegion: () => ipcRenderer.invoke('region:cancel'),
  getRegionShot: () => ipcRenderer.invoke('region:getShot'),
  onRegionShot: (cb: (m: unknown) => void) => {
    const listener = (_: unknown, m: unknown) => cb(m)
    ipcRenderer.on('region:shot', listener)
    return () => ipcRenderer.removeListener('region:shot', listener)
  },
  onRegionCursor: (cb: (p: { x: number; y: number }) => void) => {
    const listener = (_: unknown, p: { x: number; y: number }) => cb(p)
    ipcRenderer.on('region:cursor', listener)
    return () => ipcRenderer.removeListener('region:cursor', listener)
  },
  onRegionCountdown: (cb: (p: unknown) => void) => {
    const listener = (_: unknown, p: unknown) => cb(p)
    ipcRenderer.on('region:countdown', listener)
    return () => ipcRenderer.removeListener('region:countdown', listener)
  },
  startSession: (meta?: Partial<Session>) => ipcRenderer.invoke('session:start', meta),
  endSession: () => ipcRenderer.invoke('session:end'),
  startOcr: () => ipcRenderer.invoke('ocr:start'),
  stopOcr: () => ipcRenderer.invoke('ocr:stop'),
  startDemo: () => ipcRenderer.invoke('demo:start'),
  stopDemo: () => ipcRenderer.invoke('demo:stop'),
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  previewMask: () => ipcRenderer.invoke('mask:preview'),
  hideMask: () => ipcRenderer.invoke('mask:hide'),
  verifyMaskDump: () => ipcRenderer.invoke('mask:verifyDump'),
  setWordAssist: (on: boolean) => ipcRenderer.invoke('assist:set', on),
  toggleWordAssist: () => ipcRenderer.invoke('assist:toggle'),
  setClickThrough: (ignore: boolean) => ipcRenderer.invoke('overlay:setClickThrough', ignore),
  setFreedom: (level: FreedomLevel) => ipcRenderer.invoke('freedom:set', level),
  flashChinese: () => ipcRenderer.invoke('chinese:flash'),
  clarityClick: () => ipcRenderer.invoke('chinese:clarityClick'),
  captureWord: (payload: {
    word: string
    kind?: 'word' | 'sentence' | 'unclear'
    contextEn?: string
    contextZh?: string
  }) => ipcRenderer.invoke('vocab:capture', payload),
  removeVocab: (id: string) => ipcRenderer.invoke('vocab:remove', id),
  patchVocab: (id: string, patch: Partial<VocabItem>) => ipcRenderer.invoke('vocab:patch', id, patch),
  exportVocab: (format: 'csv' | 'anki') => ipcRenderer.invoke('vocab:export', format),
  generatePractice: (sessionId?: string) => ipcRenderer.invoke('practice:generate', sessionId),
  submitAnswer: (payload: {
    exercise: Exercise
    userAnswer: string
    results: ExerciseResult[]
  }) => ipcRenderer.invoke('practice:submit', payload),
  clearData: () => ipcRenderer.invoke('data:clear'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onState: (cb: (state: unknown) => void) => {
    const listener = (_: unknown, state: unknown) => cb(state)
    ipcRenderer.on('state:update', listener)
    return () => ipcRenderer.removeListener('state:update', listener)
  },
  onSessionEnded: (cb: (session: Session) => void) => {
    const listener = (_: unknown, session: Session) => cb(session)
    ipcRenderer.on('session:ended', listener)
    return () => ipcRenderer.removeListener('session:ended', listener)
  },
  onClarity: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('chinese:clarity', listener)
    return () => ipcRenderer.removeListener('chinese:clarity', listener)
  },
  onMask: (cb: (payload: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('mask:update', listener)
    return () => ipcRenderer.removeListener('mask:update', listener)
  },
  petSetOpen: (open: boolean) => ipcRenderer.invoke('pet:setOpen', open),
  petMoveBy: (dx: number, dy: number) => ipcRenderer.invoke('pet:moveBy', dx, dy),
  petResizeTo: (width: number, height: number) => ipcRenderer.invoke('pet:resizeTo', width, height),
  petLookup: (word: string) => ipcRenderer.invoke('pet:lookup', word),
  onPetState: (cb: (s: unknown) => void) => {
    const listener = (_: unknown, s: unknown) => cb(s)
    ipcRenderer.on('pet:state', listener)
    return () => ipcRenderer.removeListener('pet:state', listener)
  },
}

contextBridge.exposeInMainWorld('rehearse', api)
contextBridge.exposeInMainWorld('rehearseMask', {
  onUpdate: (cb: (payload: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('mask:update', listener)
    return () => ipcRenderer.removeListener('mask:update', listener)
  },
  /** Fired after freeform region re-save so the live crop/stream rebinds. */
  onRegionChanged: (cb: (rect: unknown) => void) => {
    const listener = (_: unknown, rect: unknown) => cb(rect)
    ipcRenderer.on('mask:regionChanged', listener)
    return () => ipcRenderer.removeListener('mask:regionChanged', listener)
  },
})

/**
 * Claude version: realtime capture bridge for the mask window.
 * getCaptureInfo → which screen to stream + exact CN strip rect (physical px).
 * reportStatus  → tells main to pause its legacy 8fps screenshot loop.
 */
contextBridge.exposeInMainWorld('rehearseMaskLive', {
  getCaptureInfo: () => ipcRenderer.invoke('maskLive:getCaptureInfo'),
  reportStatus: (status: { active: boolean; mode?: string; fps?: number; error?: string }) =>
    ipcRenderer.invoke('maskLive:status', status),
})

export type RehearseApi = typeof api
