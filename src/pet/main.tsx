/**
 * Pip — soot ball.
 *
 * Layout rule (user): coal stays bottom-RIGHT; open panel grows UP + LEFT.
 * No "拖动" chrome. Quiet drag on soot / empty chrome. Subtle top-left resize.
 * Scroll areas must allow pan-y; custom dark scrollbar (not OS white).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'

type PetState = {
  locale: 'en' | 'zh'
  recentWords: string[]
  contextEn: string
  open: boolean
}

type PetApi = {
  onPetState?: (cb: (s: PetState) => void) => () => void
  petLookup?: (word: string) => Promise<string>
  petSetOpen?: (open: boolean) => Promise<void>
  petMoveBy?: (dx: number, dy: number) => Promise<unknown>
  petResizeTo?: (width: number, height: number) => Promise<unknown>
}

function petApi(): PetApi {
  return window.rehearse as typeof window.rehearse & PetApi
}

function useQuietDrag(onClick?: () => void) {
  const dragRef = useRef<{
    active: boolean
    moved: boolean
    lastX: number
    lastY: number
  } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, input, textarea, a, [data-no-drag], [data-scroll]')) return
    dragRef.current = {
      active: true,
      moved: false,
      lastX: e.screenX,
      lastY: e.screenY,
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d?.active) return
    const dx = e.screenX - d.lastX
    const dy = e.screenY - d.lastY
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 5) return
      d.moved = true
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    d.lastX = e.screenX
    d.lastY = e.screenY
    void petApi().petMoveBy?.(dx, dy)
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
      if (d && !d.moved && onClick) onClick()
    },
    [onClick],
  )

  return { onPointerDown, onPointerMove, onPointerUp }
}

/** Top-left corner grip — panel grows opposite the coal (bottom-right). Very quiet. */
function ResizeCorner() {
  const start = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  return (
    <div
      data-no-drag
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()
        const root = document.getElementById('root')
        start.current = {
          x: e.screenX,
          y: e.screenY,
          w: root?.clientWidth || 320,
          h: root?.clientHeight || 420,
        }
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s) return
        const nw = s.w - (e.screenX - s.x)
        const nh = s.h - (e.screenY - s.y)
        void petApi().petResizeTo?.(nw, nh)
      }}
      onPointerUp={(e) => {
        start.current = null
        try {
          ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={() => {
        start.current = null
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 18,
        height: 18,
        cursor: 'nwse-resize',
        touchAction: 'none',
        zIndex: 20,
        opacity: 0.35,
      }}
      title="resize"
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M2 12 L2 2 L12 2" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function SootSvg({ mode, size = 76 }: { mode: 'idle' | 'think' | 'still'; size?: number }) {
  const period = mode === 'think' ? '1.7s' : '3.8s'
  const anim = mode === 'still' ? 'none' : undefined
  const eyeAnim =
    mode === 'still'
      ? 'none'
      : mode === 'think'
        ? 'soot-squint 1.7s ease-in-out infinite'
        : 'soot-blink 7.2s ease-in-out infinite'

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        animation: anim ?? `soot-float ${period} ease-in-out infinite`,
        willChange: 'transform',
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 76 76" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="sootBody" cx="37%" cy="31%" r="74%">
            <stop offset="0%" stopColor="#54545f" />
            <stop offset="40%" stopColor="#2c2c34" />
            <stop offset="76%" stopColor="#141419" />
            <stop offset="100%" stopColor="#08080b" />
          </radialGradient>
          <radialGradient id="sootBounce" cx="72%" cy="78%" r="46%">
            <stop offset="0%" stopColor="#3d3d49" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#3d3d49" stopOpacity="0" />
          </radialGradient>
          <filter id="sootFur" x="-40%" y="-40%" width="180%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="11" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="6.5" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="0.45" />
          </filter>
          <filter id="sootHaze" x="-70%" y="-70%" width="240%" height="240%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="1.7" />
          </filter>
          <filter id="sootEye" x="-160%" y="-160%" width="420%" height="420%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g style={{ transformOrigin: '38px 42px', animation: anim ?? `soot-breath ${period} ease-in-out infinite` }}>
          <g style={{ transformOrigin: '38px 38px', animation: anim ?? 'soot-drift 54s linear infinite' }}>
            <circle cx="38" cy="38" r="27" fill="#0b0b0f" opacity="0.55" filter="url(#sootHaze)" />
          </g>
          <circle cx="38" cy="38" r="24" fill="url(#sootBody)" filter="url(#sootFur)" />
          <circle cx="38" cy="38" r="24" fill="url(#sootBounce)" filter="url(#sootFur)" />
          <g style={{ transformOrigin: '38px 36px', animation: eyeAnim }} filter="url(#sootEye)">
            <ellipse cx="30.5" cy="36" rx="4" ry="4.4" fill="#ffce3d" />
            <ellipse cx="45.5" cy="36" rx="4" ry="4.4" fill="#ffce3d" />
            <ellipse cx="29.4" cy="34.6" rx="1.1" ry="1.3" fill="#fff3c4" />
            <ellipse cx="44.4" cy="34.6" rx="1.1" ry="1.3" fill="#fff3c4" />
          </g>
        </g>
      </svg>
    </div>
  )
}

function PetApp() {
  const [st, setSt] = useState<PetState>({
    locale: 'zh',
    recentWords: [],
    contextEn: '',
    open: false,
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msgs, setMsgs] = useState<{ role: 'pip' | 'me'; text: string }[]>([
    { role: 'pip', text: '嗨！点词查意思。' },
  ])
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      html, body, #root {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        overscroll-behavior: none;
      }
      @keyframes soot-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
      }
      @keyframes soot-breath {
        0%, 100% { transform: scale(1, 1); }
        50% { transform: scale(1.025, 0.975); }
      }
      @keyframes soot-drift {
        0%   { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes soot-blink {
        0%, 92%, 100% { transform: scaleY(1); }
        94%           { transform: scaleY(0.08); }
        96%           { transform: scaleY(1); }
      }
      @keyframes soot-squint {
        0%, 100% { transform: scaleY(0.55); }
        50%      { transform: scaleY(0.8); }
      }
      /* dark gold scrollbar — not OS default white */
      .pip-scroll {
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;
        touch-action: pan-y;
        scrollbar-width: thin;
        scrollbar-color: rgba(245,185,66,0.45) rgba(0,0,0,0.25);
      }
      .pip-scroll::-webkit-scrollbar {
        width: 7px;
      }
      .pip-scroll::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.22);
        border-radius: 8px;
        margin: 4px 0;
      }
      .pip-scroll::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(245,185,66,0.55), rgba(180,120,40,0.5));
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.25);
      }
      .pip-scroll::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(245,185,66,0.75), rgba(200,140,50,0.65));
      }
      .pip-scroll::-webkit-scrollbar-corner {
        background: transparent;
      }
    `
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  useEffect(() => {
    const off = petApi().onPetState?.((s) => {
      setSt((prev) => ({
        ...prev,
        ...s,
        // sticky: never wipe words if new payload is empty (main also sticky, belt+suspenders)
        recentWords:
          s.recentWords && s.recentWords.length > 0 ? s.recentWords : prev.recentWords,
        contextEn: s.contextEn || prev.contextEn,
        open: typeof s.open === 'boolean' ? s.open : prev.open,
      }))
    })
    return () => off?.()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [msgs, loading])

  const setOpen = async (next: boolean) => {
    setSt((s) => ({ ...s, open: next }))
    try {
      await petApi().petSetOpen?.(next)
      if (next) {
        // focus input after open animation frame
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    } catch {
      setSt((s) => ({ ...s, open: !next }))
    }
  }

  const ask = async (word: string) => {
    const w = word.trim()
    if (!w || loading) return
    if (!st.open) await setOpen(true)
    setLoading(true)
    setMsgs((m) => [...m, { role: 'me', text: w }])
    setInput('')
    try {
      const text = (await petApi().petLookup?.(w)) || `「${w}」…`
      setMsgs((m) => [...m, { role: 'pip', text }])
    } finally {
      setLoading(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const zh = st.locale === 'zh'
  const foxMode = loading ? 'think' : 'idle'
  const lineTokens = st.contextEn
    ? st.contextEn.split(/(\s+|[^A-Za-z0-9'’-]+)/).filter(Boolean)
    : []

  const collapseDrag = useQuietDrag(() => void setOpen(true))
  const openDrag = useQuietDrag()

  if (!st.open) {
    const chips = st.recentWords.slice(0, 6)
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 6,
          background: 'transparent',
          boxSizing: 'border-box',
          padding: chips.length ? '6px 8px 4px' : 0,
        }}
      >
        {chips.length > 0 && (
          <div
            data-no-drag
            data-scroll
            className="pip-scroll"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 4,
              maxWidth: '100%',
              maxHeight: 56,
              background: 'rgba(8,10,14,0.82)',
              border: '1px solid rgba(245,185,66,0.35)',
              borderRadius: 12,
              padding: '5px 7px',
            }}
          >
            {chips.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => void ask(w)}
                style={{
                  border: '1px solid rgba(245,185,66,0.4)',
                  background: 'rgba(245,185,66,0.12)',
                  color: '#f5b942',
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  lineHeight: 1.4,
                }}
              >
                {w}
              </button>
            ))}
          </div>
        )}
        <div {...collapseDrag} style={{ cursor: 'pointer', touchAction: 'none' }}>
          <SootSvg mode={foxMode} />
        </div>
      </div>
    )
  }

  // OPEN: content grows up-left; coal docked bottom-right of footer row
  return (
    <div
      {...openDrag}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: '14px 14px 12px',
        background: 'rgba(12,14,20,0.96)',
        border: '1px solid rgba(245,185,66,0.28)',
        borderRadius: 16,
        color: '#f4f1ea',
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        // do NOT set touch-action:none on whole panel — blocks scroll
        minHeight: 0,
      }}
    >
      <ResizeCorner />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, color: '#f5b942', fontSize: 14 }}>Pip</div>
        <button
          data-no-drag
          type="button"
          onClick={() => void setOpen(false)}
          style={{
            border: '1px solid rgba(245,185,66,0.4)',
            background: 'rgba(245,185,66,0.15)',
            color: '#f5b942',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: 8,
            padding: '5px 12px',
          }}
        >
          {zh ? '收起' : 'Close'}
        </button>
      </div>

      {/* scrollable body: sentence + chips + chat */}
      <div
        data-no-drag
        data-scroll
        className="pip-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingRight: 2,
        }}
      >
        {lineTokens.length > 0 && (
          <div
            style={{
              background: 'rgba(0,0,0,0.28)',
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 13,
              lineHeight: 1.6,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {lineTokens.map((tok, i) => {
              const isWord = /[A-Za-z]/.test(tok)
              if (!isWord) {
                return (
                  <span key={i} style={{ whiteSpace: 'pre' }}>
                    {tok}
                  </span>
                )
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => void ask(tok)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#f5b942',
                    cursor: 'pointer',
                    padding: '0 1px',
                    borderRadius: 4,
                    font: 'inherit',
                    fontWeight: 700,
                  }}
                >
                  {tok}
                </button>
              )
            })}
          </div>
        )}

        {st.recentWords.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              flexShrink: 0,
            }}
          >
            {st.recentWords.slice(0, 10).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => void ask(w)}
                style={{
                  border: '1px solid rgba(245,185,66,0.35)',
                  background: 'rgba(245,185,66,0.1)',
                  color: '#f5b942',
                  borderRadius: 999,
                  padding: '5px 11px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {w}
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            flex: 1,
            minHeight: 100,
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {msgs.map((m, i) => (
            <div key={i} style={{ marginBottom: 10, textAlign: m.role === 'me' ? 'right' : 'left' }}>
              <span
                style={{
                  display: 'inline-block',
                  maxWidth: '92%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: m.role === 'me' ? 'rgba(245,185,66,0.2)' : 'rgba(255,255,255,0.06)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
          {loading && (
            <div style={{ opacity: 0.6, fontSize: 12 }}>{zh ? 'Pip 想一下…' : 'Pip thinking…'}</div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* footer: input roomy; coal sits beside, not crushing the field */}
      <div
        data-no-drag
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexShrink: 0,
          paddingTop: 2,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void ask(input)
          }}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={zh ? '输入英文词…' : 'Type a word…'}
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(0,0,0,0.4)',
              color: '#fff',
              padding: '11px 14px',
              fontSize: 14,
              outline: 'none',
              lineHeight: 1.3,
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: 12,
              background: '#f0a83a',
              color: '#1a1208',
              fontWeight: 700,
              padding: '0 16px',
              height: 42,
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {zh ? '问' : 'Ask'}
          </button>
        </form>
        <div
          onClick={() => void setOpen(false)}
          style={{ cursor: 'pointer', flexShrink: 0 }}
          title={zh ? '收起' : 'Collapse'}
        >
          <SootSvg mode={foxMode} size={44} />
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>,
)
