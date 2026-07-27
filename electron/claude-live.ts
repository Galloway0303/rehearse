/**
 * Claude live-capture bridge (main process).
 *
 * Why: the grok pipeline captured the CN strip with a BitBlt screenshot loop at
 * ~2fps effective, JPEG'd it and pushed frames over IPC. Effects were painted on
 * stuttering stills. The user's hard requirements ("实时", "不能闪", 阻力 7–8)
 * need a真正的实时源.
 *
 * How: the mask renderer asks here for the desktopCapturer screen source that
 * contains the CN strip, then opens a native 30–60fps WebRTC screen stream via
 * getUserMedia(chromeMediaSourceId). The mask window is excluded from capture
 * (WDA_EXCLUDEFROMCAPTURE), so the stream shows the clean video under the mask —
 * no flash, no feedback loop. Effects are then rendered on GPU (WebGL) in the
 * mask renderer at display refresh rate.
 *
 * This module self-registers its IPC handlers on import (imported from main.ts
 * by scripts/claude-patch-main.mjs). When the renderer reports an active stream,
 * main.ts skips its legacy screenshot loop (CPU saved, zero regressions: if the
 * stream fails, the legacy loop keeps working as the fallback).
 */
import { ipcMain, screen, desktopCapturer } from 'electron'
import { loadDb } from './store'
import type { ScreenRect } from '../src/shared/types'

let streamActive = false
let lastStatus: Record<string, unknown> | null = null

/** main.ts consults this inside its frame loop tick (patched in). */
export function claudeStreamActive(): boolean {
  return streamActive
}

type PhysRect = { x: number; y: number; width: number; height: number }

function displayPhysRect(d: Electron.Display): PhysRect {
  const s = d.scaleFactor || 1
  return {
    x: Math.round(d.bounds.x * s),
    y: Math.round(d.bounds.y * s),
    width: Math.round(d.bounds.width * s),
    height: Math.round(d.bounds.height * s),
  }
}

/** Same semantics as main.ts cnStripPhysical — kept local so main.ts stays untouched. */
function cnStripPhysicalLocal(region: ScreenRect): ScreenRect {
  const db = loadDb()
  const side = db.settings.maskCnSide || 'top'
  const ratio = Math.min(0.85, Math.max(0.2, db.settings.maskCoverRatio ?? 0.5))
  if (side === 'full') {
    return { ...region, height: Math.max(6, region.height) }
  }
  const h = Math.max(6, Math.round(region.height * ratio))
  if (side === 'top') {
    return { x: region.x, y: region.y, width: region.width, height: h }
  }
  return { x: region.x, y: region.y + region.height - h, width: region.width, height: h }
}

export type ClaudeCaptureInfo =
  | {
      ok: true
      sourceId: string
      sourceName: string
      displayId: string
      /** Physical pixel rect of the display that contains the strip. */
      displayPhys: PhysRect
      /** Physical pixel rect of the CN strip (what the mask covers). */
      stripPhys: ScreenRect
      scaleFactor: number
    }
  | { ok: false; reason: string }

async function getCaptureInfo(): Promise<ClaudeCaptureInfo> {
  try {
    const db = loadDb()
    const region = db.settings.region
    if (!region) return { ok: false, reason: 'no-region' }
    const strip = cnStripPhysicalLocal(region)
    const cx = strip.x + strip.width / 2
    const cy = strip.y + strip.height / 2

    const displays = screen.getAllDisplays()
    let display = displays.find((d) => {
      const p = displayPhysRect(d)
      return cx >= p.x && cx < p.x + p.width && cy >= p.y && cy < p.y + p.height
    })
    if (!display) display = screen.getPrimaryDisplay()
    const dPhys = displayPhysRect(display)

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    })
    if (!sources.length) return { ok: false, reason: 'no-screen-sources' }

    // Prefer exact display match, then positional index, then first source.
    let source = sources.find((s) => s.display_id && s.display_id === String(display.id))
    if (!source) {
      const idx = displays.findIndex((d) => d.id === display.id)
      if (idx >= 0 && idx < sources.length) source = sources[idx]
    }
    if (!source) source = sources[0]

    return {
      ok: true,
      sourceId: source.id,
      sourceName: source.name,
      displayId: String(display.id),
      displayPhys: dPhys,
      stripPhys: strip,
      scaleFactor: display.scaleFactor || 1,
    }
  } catch (e) {
    return { ok: false, reason: String(e) }
  }
}

ipcMain.handle('maskLive:getCaptureInfo', async () => getCaptureInfo())

ipcMain.handle(
  'maskLive:status',
  (_e, status: { active?: boolean; mode?: string; fps?: number; error?: string } | null) => {
    streamActive = Boolean(status && status.active)
    lastStatus = (status as Record<string, unknown>) || null
    console.log('[claude-live] stream status:', JSON.stringify(status))
    return true
  },
)

ipcMain.handle('maskLive:lastStatus', () => lastStatus)

console.log('[claude-live] IPC registered (maskLive:getCaptureInfo / maskLive:status)')
