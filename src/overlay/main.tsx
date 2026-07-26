/**
 * English assist HUD only.
 * Does NOT draw fake Chinese over the movie.
 * Chinese is handled by the mask window sitting on REAL subtitle pixels.
 */
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { hydrateFromMain, showToast, useAppStore } from '../shared/store'
import { t } from '../shared/i18n'
import '../styles.css'

void hydrateFromMain()

function tokenize(en: string): string[] {
  return en.split(/(\s+|[^A-Za-z0-9'’-]+)/).filter(Boolean)
}

function OverlayApp() {
  const settings = useAppStore((s) => s.settings)
  const locale = settings.locale
  const sub = useAppStore((s) => s.currentSubtitle)
  const activeSession = useAppStore((s) => s.activeSession)
  const toast = useAppStore((s) => s.toast)
  const selectModeUntil = useAppStore((s) => s.selectModeUntil)
  const [pendingUndo, setPendingUndo] = useState<string | null>(null)
  const selectMode = Date.now() < selectModeUntil

  useEffect(() => {
    void window.rehearse?.setClickThrough(!selectMode)
  }, [selectMode])

  const capture = async (word: string) => {
    if (!word.trim()) return
    const item = (await window.rehearse.captureWord({
      word: word.trim(),
      kind: 'word',
      contextEn: sub?.en,
      contextZh: sub?.zh,
    })) as { id: string }
    setPendingUndo(item.id)
    showToast(`${t(locale, 'captured')}: ${word.trim()}`)
    window.setTimeout(() => setPendingUndo(null), 3000)
  }

  if (!activeSession && !sub) return null

  return (
    <div
      className="w-full h-full pointer-events-none"
      style={{ background: 'transparent' }}
      onMouseEnter={() => window.rehearse.setClickThrough(false)}
      onMouseLeave={() => {
        if (Date.now() >= selectModeUntil) window.rehearse.setClickThrough(true)
      }}
    >
      <div className="pointer-events-auto mx-auto mt-1 max-w-full">
        <div className="rounded-xl bg-black/70 border border-white/10 px-3 py-2 shadow-panel">
          <div className="flex items-center justify-between gap-2 text-[10px] text-mist-400 mb-1">
            <span>
              {locale === 'zh' ? '点词（低阻力）' : 'Tap words'} · CN mask:
              <span className="text-amber-soft"> {settings.maskEffect || 'solid'}</span>
            </span>
            <button
              className="btn-ghost !py-0.5 !px-2 !text-[10px]"
              onClick={() => window.rehearse.flashChinese()}
            >
              {locale === 'zh' ? '偷看中文 1.2s' : 'Peek CN 1.2s'}
            </button>
          </div>
          {sub?.en ? (
            <div className="text-center text-mist-100 font-semibold leading-snug" style={{ fontSize: '1.05rem' }}>
              {tokenize(sub.en).map((tok, i) => {
                const isWord = /[A-Za-z]/.test(tok)
                if (!isWord) {
                  return (
                    <span key={i} className="whitespace-pre">
                      {tok}
                    </span>
                  )
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className="rounded px-0.5 hover:bg-amber-glow/30 hover:text-amber-soft cursor-pointer"
                    onClick={() => void capture(tok)}
                  >
                    {tok}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="text-center text-xs text-mist-500 py-1">
              {locale === 'zh'
                ? '英文用原片；这里是 OCR 辅助点词（可点）'
                : 'EN is on the video; OCR assist for low-friction capture'}
            </div>
          )}
        </div>
      </div>

      {pendingUndo && (
        <div className="pointer-events-auto flex justify-center mt-2">
          <button
            className="rounded-full bg-ink-700 border border-amber-glow/30 px-3 py-1 text-xs"
            onClick={async () => {
              await window.rehearse.removeVocab(pendingUndo)
              setPendingUndo(null)
            }}
          >
            {t(locale, 'undoCapture')}
          </button>
        </div>
      )}
      {toast && (
        <div className="text-center mt-2 text-xs text-mist-200 pointer-events-none">{toast}</div>
      )}
      <FlashTicker />
    </div>
  )
}

function FlashTicker() {
  const [, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
)
