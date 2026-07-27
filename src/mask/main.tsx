/**
 * Live CN cover — CLAUDE VERSION.
 *
 * Old pipeline (grok): main process BitBlt screenshot → JPEG → IPC → 2D canvas.
 * Real-world result: ~2fps, effects painted on stuttering stills.
 *
 * New pipeline: mask window opens a native screen stream (desktopCapturer +
 * getUserMedia, 30–60fps, GPU) of the display under the strip, crops the CN
 * strip 1:1 in physical pixels, and renders every effect as a WebGL2 shader.
 * The mask window stays WDA_EXCLUDEFROMCAPTURE → the stream shows clean video
 * under the cover. Never hides, never flashes.
 *
 * Fallback ladder (automatic):
 *   LIVE·GL  — screen stream + WebGL2 shaders (target)
 *   LIVE·2D  — screen stream + old canvas-2D effects (if WebGL2 missing)
 *   IPC      — legacy main-process frame loop (if stream fails / no exclusion)
 */
import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  drawCoverEffect,
  blockSizeForFriction,
  effectFrictionHint,
  effectNeedsAnimation,
  normalizeEffect,
  TARGET_FRICTION,
  type CoverEffect,
} from './effects'
import { MaskGlEngine } from './gl-engine'
import {
  acquireScreenStream,
  cropForStrip,
  liveApi,
  playStream,
  type CaptureInfo,
  type CropRect,
} from './live-stream'

type MaskPayload = {
  effect: string
  clear: boolean
  frame?: string | null
  friction?: number
  meta?: {
    captureOk?: boolean
    excludeOk?: boolean
    fps?: number
    frictionTarget?: number
  }
}

type Mode = 'starting' | 'live-gl' | 'live-2d' | 'legacy'

function toDataUrl(frame: string): string {
  if (frame.startsWith('data:')) return frame
  if (frame.startsWith('/9j/')) return `data:image/jpeg;base64,${frame}`
  return `data:image/png;base64,${frame}`
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number
}

function MaskApp() {
  const [effect, setEffect] = useState<CoverEffect>('liquid_glass')
  const [clear, setClear] = useState(false)
  const [friction, setFriction] = useState(TARGET_FRICTION)
  const [meta, setMeta] = useState<MaskPayload['meta']>({})
  const [mode, setMode] = useState<Mode>('starting')
  const [hud, setHud] = useState({ block: 0, est: 7.2, fps: 0 })
  const [badgeOn, setBadgeOn] = useState(true)

  const glCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const c2dCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const stateRef = useRef({
    effect: 'liquid_glass' as CoverEffect,
    friction: TARGET_FRICTION,
    clear: false,
    excludeOk: undefined as boolean | undefined,
  })
  const modeRef = useRef<Mode>('starting')
  const engineRef = useRef<MaskGlEngine | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const infoRef = useRef<CaptureInfo | null>(null)
  const cropRef = useRef<CropRect | null>(null)
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const newFrameRef = useRef(false)
  const liveStartedRef = useRef(false)
  const restartingRef = useRef(false)
  const liveGenRef = useRef(0)
  const lastPaintAtRef = useRef(performance.now())
  const lastRestartAtRef = useRef(0)
  const lastEffectRef = useRef<string>('liquid_glass')
  const mountedAtRef = useRef(performance.now())

  // legacy IPC frame state
  const lastBitmap = useRef<HTMLImageElement | null>(null)
  const frameGen = useRef(0)
  const bootWaitRef = useRef(0)
  const tryBootRef = useRef<(() => void) | null>(null)
  const aliveRef = useRef(true)

  const fpsCount = useRef(0)
  const fpsWindow = useRef(performance.now())
  const last2dTick = useRef(0)

  const setModeBoth = (m: Mode) => {
    modeRef.current = m
    setMode(m)
  }

  const updateHud = () => {
    const s = stateRef.current
    const h = Math.max(8, window.innerHeight || 60)
    setHud((prev) => ({
      block: normalizeEffect(s.effect) === 'mosaic' ? blockSizeForFriction(h, s.friction) : 0,
      est: effectFrictionHint(normalizeEffect(s.effect), h),
      fps: prev.fps,
    }))
  }

  const countFrame = () => {
    fpsCount.current += 1
    lastPaintAtRef.current = performance.now()
    const now = performance.now()
    if (now - fpsWindow.current >= 1000) {
      const fps = fpsCount.current
      fpsCount.current = 0
      fpsWindow.current = now
      setHud((prev) => ({ ...prev, fps }))
    }
  }

  /* ---------- legacy 2D painting (IPC mode) ---------- */
  const paintLegacy = (src: CanvasImageSource | null) => {
    const canvas = c2dCanvasRef.current
    if (!canvas) return
    const w = Math.max(4, window.innerWidth || 400)
    const h = Math.max(4, window.innerHeight || 60)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const s = stateRef.current
    const source = src || lastBitmap.current
    drawCoverEffect(ctx, source, w, h, source ? s.effect : 'solid', performance.now(), s.friction)
    countFrame()
  }

  /* ---------- live crop → GL / 2D ---------- */
  const drawLive = (force: boolean) => {
    const s = stateRef.current
    if (s.clear) return
    const video = videoRef.current
    const info = infoRef.current
    const crop = cropRef.current
    if (!video || !info || !crop) return

    const isNew = newFrameRef.current
    const animated = effectNeedsAnimation(s.effect)
    if (!isNew && !animated && !force) return
    newFrameRef.current = false

    let cc = cropCanvasRef.current
    if (!cc) {
      cc = document.createElement('canvas')
      cropCanvasRef.current = cc
    }
    if (cc.width !== crop.sw || cc.height !== crop.sh) {
      cc.width = crop.sw
      cc.height = crop.sh
    }
    if (isNew || force) {
      const cctx = cc.getContext('2d', { alpha: false, desynchronized: true })
      if (!cctx) return
      cctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)
    }

    const cssW = Math.max(4, window.innerWidth || 400)
    const cssH = Math.max(4, window.innerHeight || 60)
    const dpr = window.devicePixelRatio || 1

    if (modeRef.current === 'live-gl' && engineRef.current) {
      const eng = engineRef.current
      if (isNew || force) eng.upload(cc, cc.width, cc.height)
      eng.draw({
        effect: s.effect,
        timeMs: performance.now(),
        cssW,
        cssH,
        dpr,
        friction: s.friction,
      })
      countFrame()
    } else if (modeRef.current === 'live-2d') {
      // throttle 2D live path to ~30fps to keep CPU calm
      const now = performance.now()
      if (!force && now - last2dTick.current < 30) return
      last2dTick.current = now
      const canvas = c2dCanvasRef.current
      if (!canvas) return
      if (canvas.width !== cssW || canvas.height !== cssH) {
        canvas.width = cssW
        canvas.height = cssH
      }
      const ctx = canvas.getContext('2d', { alpha: false })
      if (!ctx) return
      drawCoverEffect(ctx, cc, cssW, cssH, s.effect, now, s.friction)
      countFrame()
    }
  }

  /* ---------- live startup / recovery ---------- */
  const stopLive = () => {
    liveGenRef.current += 1 // invalidate in-flight startLive
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    } catch {
      /* noop */
    }
    streamRef.current = null
    videoRef.current = null
    cropRef.current = null
    infoRef.current = null
  }

  /** Drop GL engine so next startLive recompiles shaders (HMR / material retune). */
  const dropEngine = () => {
    try {
      engineRef.current?.dispose()
    } catch {
      /* noop */
    }
    engineRef.current = null
  }

  const startLive = async (): Promise<boolean> => {
    const api = liveApi()
    if (!api) return false
    const gen = liveGenRef.current
    try {
      const info = await api.getCaptureInfo()
      if (gen !== liveGenRef.current || !aliveRef.current) return false
      if (!info.ok) throw new Error(info.reason)
      const stream = await acquireScreenStream(info)
      if (gen !== liveGenRef.current || !aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return false
      }
      const video = await playStream(stream)
      if (gen !== liveGenRef.current || !aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return false
      }
      infoRef.current = info
      streamRef.current = stream
      videoRef.current = video
      cropRef.current = cropForStrip(info, video.videoWidth, video.videoHeight)

      const track = stream.getVideoTracks()[0]
      if (track) {
        track.onended = () => {
          if (!aliveRef.current) return
          void liveApi()?.reportStatus({ active: false, error: 'track-ended' })
          void restartLiveHard('track-ended')
        }
      }

      // frame pacing: prefer requestVideoFrameCallback
      const v = video as VideoWithRvfc
      if (typeof v.requestVideoFrameCallback === 'function') {
        const onFrame = () => {
          newFrameRef.current = true
          if (videoRef.current === video) v.requestVideoFrameCallback!(onFrame)
        }
        v.requestVideoFrameCallback(onFrame)
      } else {
        newFrameRef.current = true
        const mark = () => {
          newFrameRef.current = true
          if (videoRef.current === video) requestAnimationFrame(mark)
        }
        requestAnimationFrame(mark)
      }

      // choose GL or 2D — recreate engine if canvas was resized after re-pick
      if (!engineRef.current && glCanvasRef.current) {
        try {
          engineRef.current = new MaskGlEngine(glCanvasRef.current)
        } catch (e) {
          console.warn('[mask-claude] WebGL2 unavailable, live-2d fallback', e)
        }
      }
      const m: Mode = engineRef.current ? 'live-gl' : 'live-2d'
      setModeBoth(m)
      liveStartedRef.current = true
      void api.reportStatus({ active: true, mode: m })
      newFrameRef.current = true
      drawLive(true)
      lastPaintAtRef.current = performance.now()
      return true
    } catch (e) {
      console.warn('[mask-claude] live start failed → legacy IPC', e)
      if (gen === liveGenRef.current) {
        stopLive()
        void liveApi()?.reportStatus({ active: false, error: String(e) })
      }
      return false
    }
  }

  /**
   * Hard rebind after freeform re-pick / dead stream.
   * Soft crop updates are not enough; also guard against hang so we never
   * sit on the black "starting" plate forever (that is the "点一下就黑" bug).
   */
  const restartLiveHard = async (reason: string) => {
    if (restartingRef.current) return
    // avoid restart thrash (boot + region + watchdog colliding)
    if (performance.now() - lastRestartAtRef.current < 1200 && reason === 'watchdog') return
    restartingRef.current = true
    lastRestartAtRef.current = performance.now()
    console.log('[mask-claude] restartLiveHard', reason)
    try {
      stopLive()
      // recompile shaders on hard restart (material retunes / canvas resize)
      if (
        reason === 'region-changed' ||
        reason === 'watchdog' ||
        reason === 'track-ended' ||
        reason === 'shader-reload'
      ) {
        dropEngine()
      }
      void liveApi()?.reportStatus({ active: false, error: reason })
      // Stay on last mode visually if possible — never force a black plate.
      // Only mark starting if we have nothing to show.
      if (!lastBitmap.current) setModeBoth('starting')
      const ok = await Promise.race([
        startLive(),
        new Promise<boolean>((resolve) => {
          window.setTimeout(() => resolve(false), 4500)
        }),
      ])
      if (!ok) {
        console.warn('[mask-claude] restart failed/timeout → legacy', reason)
        setModeBoth('legacy')
        void liveApi()?.reportStatus({ active: false, error: `${reason}-failed` })
        liveStartedRef.current = false
      }
    } finally {
      restartingRef.current = false
    }
  }

  /** Region/display may change → verify mapping, re-acquire if needed. */
  const refreshMapping = async () => {
    if (restartingRef.current) return
    const api = liveApi()
    if (!api) return

    // Live mode claims to run but the video is gone → hard restart
    if (
      (modeRef.current === 'live-gl' || modeRef.current === 'live-2d') &&
      (!videoRef.current || videoRef.current.readyState < 2)
    ) {
      await restartLiveHard('stale-video')
      return
    }

    if (modeRef.current !== 'live-gl' && modeRef.current !== 'live-2d') return
    const video = videoRef.current
    if (!video) return
    try {
      const info = await api.getCaptureInfo()
      if (!info.ok) return
      const prev = infoRef.current
      if (!prev || info.sourceId !== prev.sourceId) {
        await restartLiveHard('display-changed')
        return
      }
      infoRef.current = info
      cropRef.current = cropForStrip(info, video.videoWidth, video.videoHeight)
      newFrameRef.current = true
      drawLive(true)
    } catch {
      /* keep current mapping */
    }
  }

  /* ---------- render loop ---------- */
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = stateRef.current
      if (!s.clear) {
        if (modeRef.current === 'live-gl' || modeRef.current === 'live-2d') {
          drawLive(false)
        } else if (modeRef.current === 'legacy') {
          // legacy animated repaint (~18fps like before)
          if (effectNeedsAnimation(s.effect) && lastBitmap.current) {
            const now = performance.now()
            if (now - last2dTick.current >= 55) {
              last2dTick.current = now
              paintLegacy(lastBitmap.current)
            }
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- boot: wait for first mask:update (has excludeOk), then go live ---------- */
  useEffect(() => {
    const w = window as unknown as {
      rehearseMask?: {
        onUpdate: (cb: (p: MaskPayload) => void) => () => void
        onRegionChanged?: (cb: (rect: unknown) => void) => () => void
      }
      rehearse?: { onMask?: (cb: (p: MaskPayload) => void) => () => void; flashChinese?: () => Promise<void> }
    }

    const tryBoot = () => {
      if (liveStartedRef.current) return
      const s = stateRef.current
      if (s.excludeOk === false) {
        // Exclusion not confirmed yet (it is asserted asynchronously after the
        // window shows). A live stream now would capture the mask itself, so
        // wait — the legacy loop keeps pushing updates with fresh excludeOk.
        bootWaitRef.current += 1
        if (bootWaitRef.current > 40 && modeRef.current === 'starting') setModeBoth('legacy')
        return
      }
      liveStartedRef.current = true
      void startLive().then((ok) => {
        if (!ok) {
          liveStartedRef.current = false
          setModeBoth('legacy')
        }
      })
    }
    tryBootRef.current = tryBoot

    const apply = (p: MaskPayload) => {
      const e = normalizeEffect(String(p.effect || 'liquid_glass'))
      const fr = typeof p.friction === 'number' ? p.friction : TARGET_FRICTION
      const isClear = Boolean(p.clear)
      const effectChanged = e !== lastEffectRef.current
      lastEffectRef.current = e
      stateRef.current = {
        effect: e,
        friction: fr,
        clear: isClear,
        excludeOk: p.meta?.excludeOk ?? stateRef.current.excludeOk,
      }
      setEffect(e)
      setClear(isClear)
      setFriction(fr)
      if (p.meta) setMeta(p.meta)
      updateHud()
      tryBoot()

      if (isClear) return

      if (modeRef.current === 'live-gl' || modeRef.current === 'live-2d') {
        // Effect switch: force remapping (this is why "换特效又好了").
        // Do NOT refresh on every IPC tick — that thrashes restart and freezes black.
        if (effectChanged) void refreshMapping()
        else drawLive(true)
        return
      }

      // legacy IPC frames
      if (p.frame) {
        const gen = ++frameGen.current
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          if (gen !== frameGen.current) return
          lastBitmap.current = img
          if (!stateRef.current.clear) paintLegacy(img)
        }
        img.onerror = () => {
          if (gen !== frameGen.current) return
          paintLegacy(lastBitmap.current)
        }
        img.src = toDataUrl(p.frame)
      } else {
        paintLegacy(lastBitmap.current)
      }
    }

    let off: (() => void) | undefined
    if (w.rehearseMask?.onUpdate) off = w.rehearseMask.onUpdate(apply)
    else if (w.rehearse?.onMask) off = w.rehearse.onMask(apply)

    const offRegion = w.rehearseMask?.onRegionChanged?.(() => {
      // let setBounds settle before rebinding stream/crop
      window.setTimeout(() => {
        void restartLiveHard('region-changed')
      }, 120)
    })

    // don't wait forever if no mask:update arrives (e.g. preview edge case)
    const bootTimer = window.setTimeout(tryBoot, 1200)

    const onBeforeUnload = () => {
      void liveApi()?.reportStatus({ active: false })
      stopLive()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    aliveRef.current = true
    return () => {
      off?.()
      offRegion?.()
      window.clearTimeout(bootTimer)
      window.removeEventListener('beforeunload', onBeforeUnload)
      // StrictMode double-mount / real unmount: never leak a screen stream
      aliveRef.current = false
      liveStartedRef.current = false
      stopLive()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---------- keep mapping fresh + paint watchdog ---------- */
  useEffect(() => {
    const onResize = () => {
      updateHud()
      void refreshMapping()
      if (modeRef.current === 'legacy' && !stateRef.current.clear) {
        paintLegacy(lastBitmap.current)
      }
    }
    window.addEventListener('resize', onResize)
    const iv = window.setInterval(() => {
      if (!liveStartedRef.current) tryBootRef.current?.()
      else void refreshMapping()
    }, 4000)
    // If nothing painted for ~2s while cover is on, stream is dead → recover.
    // This is the automatic version of "换特效又好了". Skip first 3s after mount.
    const wd = window.setInterval(() => {
      if (stateRef.current.clear || restartingRef.current) return
      if (!aliveRef.current) return
      if (performance.now() - mountedAtRef.current < 3000) return
      const idle = performance.now() - lastPaintAtRef.current
      if (idle > 2000) {
        console.warn('[mask-claude] paint watchdog fired', Math.round(idle), 'ms')
        void restartLiveHard('watchdog')
      }
    }, 1000)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearInterval(iv)
      window.clearInterval(wd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flash = () => void (window as unknown as { rehearse?: { flashChinese?: () => Promise<void> } }).rehearse?.flashChinese?.()

  /* ---------- badge: show briefly on change, then get out of the way ---------- */
  useEffect(() => {
    setBadgeOn(true)
    const t = window.setTimeout(() => setBadgeOn(false), 2400)
    return () => window.clearTimeout(t)
  }, [effect, mode, friction])

  const showGl = mode === 'live-gl'
  const show2d = mode === 'live-2d' || mode === 'legacy' || mode === 'starting'
  const modeBadge =
    mode === 'live-gl' ? 'LIVE·GL' : mode === 'live-2d' ? 'LIVE·2D' : mode === 'legacy' ? 'IPC' : '…'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        // NEVER opaque black plate during reconnect — that is the "点一下就黑" bug.
        // GL feathers its own edges; 2D/legacy paint their own content.
        background: 'transparent',
      }}
      onClick={flash}
      title="click peek Chinese"
    >
      <canvas
        ref={glCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          visibility: clear || !showGl ? 'hidden' : 'visible',
          position: 'absolute',
          inset: 0,
        }}
      />
      <canvas
        ref={c2dCanvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          visibility: clear || !show2d ? 'hidden' : 'visible',
          position: 'absolute',
          inset: 0,
          imageRendering: effect === 'mosaic' ? 'pixelated' : 'auto',
        }}
      />
      {/* Telemetry used to be pinned over the video for the whole session.
          It only ever answers "which effect is this / did GL start", so it now
          appears for 2.4s after a change and fades out. */}
      {!clear && badgeOn && (
        <div
          style={{
            position: 'absolute',
            right: 4,
            top: 2,
            fontSize: 9,
            fontFamily: 'ui-monospace, Consolas, monospace',
            color: 'rgba(226,214,196,0.42)',
            pointerEvents: 'none',
            userSelect: 'none',
            transition: 'opacity 600ms ease',
          }}
        >
          {effect} · R{hud.est.toFixed(1)}
          {hud.block ? ` · b${hud.block}` : ''}
          {` · ${modeBadge}`}
          {meta?.excludeOk === false ? ' · NO-EXCL' : ''}
        </div>
      )}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MaskApp />
  </React.StrictMode>,
)
