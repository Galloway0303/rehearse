/**
 * Pip — lively amber fox. Idle motion is ONE coordinated loop (body + tail + breath).
 * Click to chat / look up words.
 */
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

type PetState = {
  locale: 'en' | 'zh'
  recentWords: string[]
  contextEn: string
  open: boolean
}

function FoxSvg({ mode }: { mode: 'idle' | 'think' | 'still' }) {
  // one shared period so nothing fights
  const period = mode === 'think' ? '0.9s' : '2.4s'
  const anim = mode === 'still' ? 'none' : undefined

  return (
    <div
      style={{
        width: 72,
        height: 72,
        position: 'relative',
        animation: anim ?? `pip-float ${period} ease-in-out infinite`,
        willChange: 'transform',
      }}
    >
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <filter id="pipSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
          </filter>
        </defs>
        <g filter="url(#pipSoft)">
          {/* body — slight breath scale from center of body */}
          <g
            style={{
              transformOrigin: '36px 44px',
              animation: anim ?? `pip-breath ${period} ease-in-out infinite`,
            }}
          >
            <ellipse cx="36" cy="44" rx="18" ry="14" fill="#f0a83a" />
            <ellipse cx="36" cy="46" rx="12" ry="9" fill="#f5d9a8" />
          </g>
          {/* head follows same float (parent) — no extra bounce */}
          <circle cx="36" cy="28" r="14" fill="#f0a83a" />
          <ellipse cx="36" cy="32" rx="8" ry="6" fill="#f5d9a8" />
          {/* ears */}
          <path d="M24 20 L20 8 L30 16 Z" fill="#f0a83a" />
          <path d="M48 20 L52 8 L42 16 Z" fill="#f0a83a" />
          <path d="M24 18 L22 11 L28 16 Z" fill="#2a1a10" />
          <path d="M48 18 L50 11 L44 16 Z" fill="#2a1a10" />
          {/* eyes + soft blink (long idle, not twitchy) */}
          <g
            style={{
              transformOrigin: '36px 27px',
              animation: mode === 'still' ? 'none' : 'pip-blink 4.8s ease-in-out infinite',
            }}
          >
            <circle cx="30" cy="27" r="2.2" fill="#1a1208" />
            <circle cx="42" cy="27" r="2.2" fill="#1a1208" />
            <circle cx="30.7" cy="26.4" r="0.7" fill="#fff" />
            <circle cx="42.7" cy="26.4" r="0.7" fill="#fff" />
          </g>
          <ellipse cx="36" cy="32" rx="2" ry="1.4" fill="#1a1208" />
          <path
            d="M32 35 Q36 38 40 35"
            stroke="#1a1208"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          {/* tail — same period, pivot at hip, phase matches float */}
          <g
            style={{
              transformOrigin: '50px 46px',
              animation: anim ?? `pip-tail ${period} ease-in-out infinite`,
            }}
          >
            <path
              d="M50 46 Q62 42 58 30"
              stroke="#f0a83a"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M57 32 Q59 28 56 27"
              stroke="#f5d9a8"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
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
    { role: 'pip', text: '嗨！点我或点单词，我告诉你什么意思～' },
  ])

  useEffect(() => {
    const style = document.createElement('style')
    // One choreography: float up while tail arcs the same way, soft breath, rare blink
    style.textContent = `
      @keyframes pip-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
      }
      @keyframes pip-breath {
        0%, 100% { transform: scale(1, 1); }
        50% { transform: scale(1.03, 0.97); }
      }
      @keyframes pip-tail {
        0%, 100% { transform: rotate(-6deg); }
        50% { transform: rotate(10deg); }
      }
      @keyframes pip-blink {
        0%, 44%, 48%, 100% { transform: scaleY(1); }
        46% { transform: scaleY(0.12); }
      }
    `
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, [])

  useEffect(() => {
    const api = window.rehearse as typeof window.rehearse & {
      onPetState?: (cb: (s: PetState) => void) => () => void
      petLookup?: (word: string) => Promise<string>
      petSetOpen?: (open: boolean) => Promise<void>
    }
    const off = api.onPetState?.((s) => setSt((prev) => ({ ...prev, ...s })))
    return () => off?.()
  }, [])

  const ask = async (word: string) => {
    const w = word.trim()
    if (!w || loading) return
    setLoading(true)
    setMsgs((m) => [...m, { role: 'me', text: w }])
    setInput('')
    try {
      const api = window.rehearse as typeof window.rehearse & {
        petLookup?: (word: string) => Promise<string>
      }
      const text = (await api.petLookup?.(w)) || `「${w}」…`
      setMsgs((m) => [...m, { role: 'pip', text }])
    } finally {
      setLoading(false)
    }
  }

  const toggle = async () => {
    const next = !st.open
    setSt((s) => ({ ...s, open: next }))
    const api = window.rehearse as typeof window.rehearse & {
      petSetOpen?: (open: boolean) => Promise<void>
    }
    await api.petSetOpen?.(next)
  }

  const zh = st.locale === 'zh'
  const foxMode = loading ? 'think' : 'idle'

  if (!st.open) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: 'transparent',
          cursor: 'pointer',
        }}
        onClick={() => void toggle()}
        title={zh ? '点 Pip 查词' : 'Click Pip for words'}
      >
        <div style={{ textAlign: 'center' }}>
          <FoxSvg mode={foxMode} />
          <div
            style={{
              fontSize: 10,
              color: '#f5b942',
              fontWeight: 700,
              textShadow: '0 1px 3px #000',
              marginTop: 0,
            }}
          >
            Pip
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        padding: 10,
        background: 'rgba(12,14,20,0.94)',
        border: '1px solid rgba(245,185,66,0.35)',
        borderRadius: 16,
        color: '#f4f1ea',
        fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          onClick={() => void toggle()}
          style={{ cursor: 'pointer', transform: 'scale(0.72)', transformOrigin: 'left center' }}
        >
          <FoxSvg mode={foxMode} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#f5b942', fontSize: 14 }}>Pip</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            {zh ? '点词或输入，我来讲意思' : 'Tap a word or type'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      {st.recentWords.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {st.recentWords.slice(0, 8).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => void ask(w)}
              style={{
                border: '1px solid rgba(245,185,66,0.35)',
                background: 'rgba(245,185,66,0.1)',
                color: '#f5b942',
                borderRadius: 999,
                padding: '4px 10px',
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
          overflowY: 'auto',
          background: 'rgba(0,0,0,0.25)',
          borderRadius: 10,
          padding: 8,
          fontSize: 12,
          lineHeight: 1.45,
          minHeight: 100,
        }}
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: m.role === 'me' ? 'right' : 'left',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                maxWidth: '92%',
                padding: '6px 10px',
                borderRadius: 10,
                background: m.role === 'me' ? 'rgba(245,185,66,0.2)' : 'rgba(255,255,255,0.06)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.text}
            </span>
          </div>
        ))}
        {loading && <div style={{ opacity: 0.6, fontSize: 11 }}>{zh ? 'Pip 想一下…' : 'Pip thinking…'}</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
        style={{ display: 'flex', gap: 6 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={zh ? '输入英文词…' : 'Type a word…'}
          style={{
            flex: 1,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(0,0,0,0.35)',
            color: '#fff',
            padding: '8px 10px',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            border: 'none',
            borderRadius: 10,
            background: '#f0a83a',
            color: '#1a1208',
            fontWeight: 700,
            padding: '0 12px',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {zh ? '问' : 'Ask'}
        </button>
      </form>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PetApp />
  </React.StrictMode>,
)
