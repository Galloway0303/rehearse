/**
 * Free-form pick on a frozen screenshot (works with fullscreen movies).
 * Fixed: uses refs for drag end (no stale React state), Confirm button, robust shot load.
 */
import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { hydrateFromMain, useAppStore } from '../shared/store'

void hydrateFromMain()

type ShotMeta = {
  dataUrl?: string
  filePath?: string
  width: number
  height: number
  originX: number
  originY: number
  scaleFactor: number
}

type Pt = { x: number; y: number }

function RegionApp() {
  const locale = useAppStore((s) => s.settings.locale)
  const [shot, setShot] = useState<ShotMeta | null>(null)
  const [error, setError] = useState<string>('')
  const [dragging, setDragging] = useState(false)
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  )
  const [busy, setBusy] = useState(false)

  const startRef = useRef<Pt | null>(null)
  const currentRef = useRef<Pt | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const shotRef = useRef<ShotMeta | null>(null)
  shotRef.current = shot

  useEffect(() => {
    const api = window.rehearse
    const off = api.onRegionShot?.((m) => {
      setShot(m as ShotMeta)
      setError('')
    })
    void api.getRegionShot?.().then((m) => {
      if (m) {
        setShot(m as ShotMeta)
        setError('')
      }
    })
    // poll once more after 300ms (race with did-finish-load)
    const t = window.setTimeout(() => {
      void api.getRegionShot?.().then((m) => {
        if (m) setShot(m as ShotMeta)
      })
    }, 300)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.rehearse.cancelRegion()
      if (e.key === 'Enter' && rect && rect.width >= 4) void confirmRect(rect)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off?.()
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [rect])

  const mapToPhysical = (cssX: number, cssY: number): Pt => {
    const s = shotRef.current
    const el = imgRef.current
    if (!s || !el) return { x: cssX, y: cssY }
    const br = el.getBoundingClientRect()
    const nw = s.width
    const nh = s.height
    if (nw < 1 || nh < 1) return { x: cssX, y: cssY }
    const scale = Math.min(br.width / nw, br.height / nh)
    const dispW = nw * scale
    const dispH = nh * scale
    const ox = br.left + (br.width - dispW) / 2
    const oy = br.top + (br.height - dispH) / 2
    const ix = (cssX - ox) / scale
    const iy = (cssY - oy) / scale
    const sf = s.scaleFactor || 1
    return {
      x: Math.round(s.originX * sf + ix),
      y: Math.round(s.originY * sf + iy),
    }
  }

  const confirmRect = async (r: { x: number; y: number; width: number; height: number }) => {
    if (busy) return
    if (!shotRef.current || r.width < 4 || r.height < 4) {
      setError(locale === 'zh' ? '请拖出一个有效矩形' : 'Drag a valid rectangle')
      return
    }
    setBusy(true)
    try {
      const p1 = mapToPhysical(r.x, r.y)
      const p2 = mapToPhysical(r.x + r.width, r.y + r.height)
      const x1 = Math.min(p1.x, p2.x)
      const y1 = Math.min(p1.y, p2.y)
      const x2 = Math.max(p1.x, p2.x)
      const y2 = Math.max(p1.y, p2.y)
      const payload = {
        x: x1,
        y: y1,
        width: Math.max(4, x2 - x1),
        height: Math.max(4, y2 - y1),
      }
      await window.rehearse.saveRegion(payload)
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  const imgSrc = shot?.dataUrl || (shot?.filePath ? `file:///${shot.filePath.replace(/\\/g, '/')}` : '')

  if (!shot) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          background: '#0c0e14',
          color: '#f4f1ea',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontFamily: 'Segoe UI, sans-serif',
        }}
      >
        <div>{locale === 'zh' ? '正在截取当前画面…' : 'Capturing screen…'}</div>
        {error && <div style={{ color: '#f88' }}>{error}</div>}
        <button
          type="button"
          onClick={() => void window.rehearse.cancelRegion()}
          style={{
            marginTop: 8,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #444',
            background: '#1a1f2e',
            color: '#eee',
            cursor: 'pointer',
          }}
        >
          Esc / Cancel
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        background: '#050608',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'crosshair',
        userSelect: 'none',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || busy) return
        const p = { x: e.clientX, y: e.clientY }
        startRef.current = p
        currentRef.current = p
        setDragging(true)
        setRect({ x: p.x, y: p.y, width: 0, height: 0 })
        setError('')
      }}
      onMouseMove={(e) => {
        if (!dragging || !startRef.current) return
        const c = { x: e.clientX, y: e.clientY }
        currentRef.current = c
        const s = startRef.current
        setRect({
          x: Math.min(s.x, c.x),
          y: Math.min(s.y, c.y),
          width: Math.abs(c.x - s.x),
          height: Math.abs(c.y - s.y),
        })
      }}
      onMouseUp={() => {
        if (!dragging) return
        setDragging(false)
        // do NOT auto-cancel on tiny drag — wait for Confirm
        const s = startRef.current
        const c = currentRef.current
        if (s && c) {
          setRect({
            x: Math.min(s.x, c.x),
            y: Math.min(s.y, c.y),
            width: Math.abs(c.x - s.x),
            height: Math.abs(c.y - s.y),
          })
        }
      }}
    >
      {imgSrc ? (
        <img
          ref={imgRef}
          src={imgSrc}
          alt="screen"
          draggable={false}
          onError={() => setError(locale === 'zh' ? '截图加载失败' : 'Failed to load snapshot')}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {rect && rect.width > 0 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              right: 0,
              height: rect.y,
              background: 'rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: rect.y + rect.height,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: rect.y,
              width: rect.x,
              height: rect.height,
              background: 'rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: rect.x + rect.width,
              top: rect.y,
              right: 0,
              height: rect.height,
              background: 'rgba(0,0,0,0.5)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              border: '2px solid #f5b942',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(12,14,20,0.94)',
          border: '1px solid rgba(245,185,66,0.5)',
          borderRadius: 14,
          padding: '10px 18px',
          color: '#f4f1ea',
          fontSize: 13,
          maxWidth: 560,
          textAlign: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div style={{ color: '#f5b942', fontWeight: 600, marginBottom: 4 }}>
          {locale === 'zh' ? '在截图上拖框 → 点「确认打码区」' : 'Drag on snapshot → Confirm'}
        </div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>
          {locale === 'zh'
            ? '静止画面上自由框选中文/任意区域。不会盖在直播的全屏视频上。'
            : 'Free box on frozen frame. Does not overlay live fullscreen video.'}
        </div>
        {rect && (
          <div style={{ marginTop: 6, fontFamily: 'monospace', color: '#f5b942' }}>
            {Math.round(rect.width)}×{Math.round(rect.height)}
          </div>
        )}
        {error && <div style={{ marginTop: 6, color: '#f88' }}>{error}</div>}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          zIndex: 20,
        }}
      >
        <button
          type="button"
          disabled={!rect || rect.width < 4 || busy}
          onClick={() => rect && void confirmRect(rect)}
          style={{
            padding: '12px 22px',
            borderRadius: 12,
            border: 'none',
            background: rect && rect.width >= 4 ? '#f5b942' : '#444',
            color: '#0c0e14',
            fontWeight: 700,
            fontSize: 14,
            cursor: rect && rect.width >= 4 ? 'pointer' : 'not-allowed',
          }}
        >
          {busy
            ? locale === 'zh'
              ? '保存中…'
              : 'Saving…'
            : locale === 'zh'
              ? '确认打码区'
              : 'Confirm cover area'}
        </button>
        <button
          type="button"
          onClick={() => {
            setRect(null)
            startRef.current = null
            currentRef.current = null
          }}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #555',
            background: '#1a1f2e',
            color: '#eee',
            cursor: 'pointer',
          }}
        >
          {locale === 'zh' ? '重画' : 'Redraw'}
        </button>
        <button
          type="button"
          onClick={() => void window.rehearse.cancelRegion()}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #555',
            background: '#1a1f2e',
            color: '#eee',
            cursor: 'pointer',
          }}
        >
          Esc
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RegionApp />
  </React.StrictMode>,
)
