/// <reference types="vite/client" />

import type { RehearseApi } from '../electron/preload'

declare global {
  interface Window {
    rehearse: RehearseApi & {
      onMask?: (cb: (payload: unknown) => void) => () => void
      pinRegionAtCursor?: () => Promise<unknown>
      countdownPin?: (corner: 'tl' | 'br', seconds?: number) => Promise<unknown>
      previewMask?: () => Promise<boolean>
      hideMask?: () => Promise<boolean>
      verifyMaskDump?: () => Promise<unknown>
      setWordAssist?: (on: boolean) => Promise<unknown>
      toggleWordAssist?: () => Promise<boolean>
      petSetOpen?: (open: boolean) => Promise<unknown>
      petLookup?: (word: string) => Promise<string>
      onPetState?: (cb: (s: unknown) => void) => () => void
      onRegionCursor?: (cb: (p: { x: number; y: number }) => void) => () => void
      onRegionCountdown?: (cb: (p: unknown) => void) => () => void
    }
    rehearseMask?: {
      onUpdate: (cb: (payload: unknown) => void) => () => void
    }
  }
}

export {}
