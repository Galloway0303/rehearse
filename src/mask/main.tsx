/**
 * Live CN cover — video-pixel effects + animated styles.
 * Mask excluded from capture → realtime frames, no opacity flash.
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

function toDataUrl(frame: string): string {
  if (frame.startsWith('data:')) return frame
  if (frame.startsWith('/9j/')) return `data:image/jpeg;base64,${frame}`
  return `data:image/png;base64,${frame}`
}

function MaskApp() {
  const [effect, setEffect] = useState<CoverEffect>('liquid_glass')
  const [clear, setClear] = useState(false)
  const [friction, setFriction] = useState(TARGET_FRICTION)
  const [meta, setMeta] = useState<MaskPayload['meta']>({})
  const [hud, setHud] = useState({ block: 0, est: 7.2 })
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const lastBitmap = useRef<HTMLImageElement | null>(null)
  const frameGen = useRef(0)
  const stateRef = useRef({
    effect: 'liquid_glass' as CoverEffect,
    friction: TARGET_FRICTION,
    clear: false,
  })
  const rafRef = useRef(0)

  const paint = (src: CanvasImageSource | null, isClear: boolean, eff: CoverEffect, fr: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    const w = Math.max(4, parent?.clientWidth || window.innerWidth || 400)
    const h = Math.max(4, parent?.clientHeight || window.innerHeight || 60)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    if (isClear) {
      ctx.clearRect(0, 0, w, h)
      return
    }

    const source = src || lastBitmap.current
    drawCoverEffect(ctx, source, w, h, source ? eff : 'solid', performance.now(), fr)
    const block = blockSizeForFriction(h, fr)
    setHud({
      block: eff === 'mosaic' ? block : 0,
      est: effectFrictionHint(eff, h),
    })
  }

  // rAF for animated effects — cap ~18fps so motion stays calm (not 60fps twitch)
  useEffect(() => {
    let last = 0
    const tick = (now: number) => {
      const s = stateRef.current
      if (!s.clear && effectNeedsAnimation(s.effect) && lastBitmap.current) {
        if (now - last >= 55) {
          last = now
          paint(lastBitmap.current, false, s.effect, s.friction)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    const w = window as unknown as {
      rehearseMask?: { onUpdate: (cb: (p: MaskPayload) => void) => () => void }
      rehearse?: { onMask?: (cb: (p: MaskPayload) => void) => () => void }
    }
    const apply = (p: MaskPayload) => {
      let e = normalizeEffect(String(p.effect || 'liquid_glass'))
      const fr = typeof p.friction === 'number' ? p.friction : TARGET_FRICTION
      const isClear = Boolean(p.clear)

      stateRef.current = { effect: e, friction: fr, clear: isClear }
      setEffect(e)
      setClear(isClear)
      setFriction(fr)
      if (p.meta) setMeta(p.meta)

      if (isClear) {
        paint(null, true, e, fr)
        return
      }

      if (p.frame) {
        const gen = ++frameGen.current
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => {
          if (gen !== frameGen.current) return
          lastBitmap.current = img
          imgRef.current = img
          const s = stateRef.current
          if (s.clear) return
          paint(img, false, s.effect, s.friction)
        }
        img.onerror = () => {
          if (gen !== frameGen.current) return
          paint(lastBitmap.current, false, e, fr)
        }
        img.src = toDataUrl(p.frame)
      } else {
        paint(lastBitmap.current, false, e, fr)
      }
    }
    if (w.rehearseMask?.onUpdate) return w.rehearseMask.onUpdate(apply)
    if (w.rehearse?.onMask) return w.rehearse.onMask(apply)
  }, [])

  useEffect(() => {
    const onResize = () => {
      const s = stateRef.current
      if (s.clear) {
        paint(null, true, s.effect, s.friction)
        return
      }
      if (lastBitmap.current) paint(lastBitmap.current, false, s.effect, s.friction)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (clear) {
    return (
      <div
        style={{ width: '100%', height: '100%', background: 'transparent', cursor: 'pointer' }}
        onClick={() => void window.rehearse?.flashChinese?.()}
      />
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        background: '#050608',
      }}
      onClick={() => void window.rehearse?.flashChinese?.()}
      title="click peek Chinese"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: effect === 'mosaic' ? 'pixelated' : 'auto',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 4,
          top: 2,
          fontSize: 9,
          fontFamily: 'ui-monospace, Consolas, monospace',
          color: 'rgba(255,200,120,0.9)',
          textShadow: '0 1px 2px #000',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {effect} · R{hud.est.toFixed(1)}
        {hud.block ? ` · b${hud.block}` : ''}
        {meta?.fps ? ` · ${meta.fps}fps` : ''}
        {meta?.excludeOk === false ? ' · NO-EXCL' : ''}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MaskApp />
  </React.StrictMode>,
)
