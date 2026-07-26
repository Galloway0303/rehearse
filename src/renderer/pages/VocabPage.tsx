import { useMemo, useState } from 'react'
import { t } from '../../shared/i18n'
import { useAppStore, showToast } from '../../shared/store'

export default function VocabPage() {
  const locale = useAppStore((s) => s.settings.locale)
  const vocab = useAppStore((s) => s.vocab)
  const sessions = useAppStore((s) => s.sessions)
  const [q, setQ] = useState('')
  const [sessionFilter, setSessionFilter] = useState('all')

  const list = useMemo(() => {
    return vocab.filter((v) => {
      if (sessionFilter !== 'all' && v.sessionId !== sessionFilter) return false
      if (!q.trim()) return true
      const s = q.toLowerCase()
      return (
        v.word.toLowerCase().includes(s) ||
        v.contextEn.toLowerCase().includes(s) ||
        v.contextZh.includes(q)
      )
    })
  }, [vocab, q, sessionFilter])

  const exportFile = async (format: 'csv' | 'anki') => {
    const text = (await window.rehearse.exportVocab(format)) as string
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = format === 'csv' ? 'rehearse-vocab.csv' : 'rehearse-anki.txt'
    a.click()
    URL.revokeObjectURL(url)
    showToast(t(locale, 'saved'))
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'vocab')}</h1>
          <p className="text-sm text-mist-400 mt-1">
            {list.length} / {vocab.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => exportFile('csv')}>
            {t(locale, 'exportCsv')}
          </button>
          <button className="btn-ghost" onClick={() => exportFile('anki')}>
            {t(locale, 'exportAnki')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-sm"
          placeholder={t(locale, 'searchVocab')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-xs"
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
        >
          <option value="all">All sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-mist-400">{t(locale, 'emptyVocab')}</div>
      ) : (
        <ul className="space-y-3">
          {list.map((v) => (
            <li key={v.id} className="card p-4 flex flex-col sm:flex-row sm:items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold text-amber-soft">{v.word}</span>
                  <span className="chip bg-ink-700 text-mist-300">
                    {t(
                      locale,
                      v.status === 'new'
                        ? 'statusNew'
                        : v.status === 'known'
                          ? 'statusKnown'
                          : 'statusLearning',
                    )}
                  </span>
                  <span className="chip bg-ink-900 text-mist-400">{v.kind}</span>
                </div>
                <div className="text-sm text-mist-200 mt-2">{v.contextEn}</div>
                {v.contextZh && <div className="text-sm text-mist-400 mt-1">{v.contextZh}</div>}
                <div className="text-[11px] text-mist-400 mt-2">
                  ✓ {v.correctCount} · ✗ {v.wrongCount} · reviews {v.reviewCount}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  className="btn-ghost text-xs"
                  onClick={() => window.rehearse.patchVocab(v.id, { status: 'known' })}
                >
                  {t(locale, 'markKnown')}
                </button>
                <button
                  className="btn-danger text-xs"
                  onClick={() => window.rehearse.removeVocab(v.id)}
                >
                  {t(locale, 'delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
