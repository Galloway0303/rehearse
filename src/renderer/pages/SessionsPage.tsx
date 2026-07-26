import { useNavigate } from 'react-router-dom'
import { t, levelLabel } from '../../shared/i18n'
import { useAppStore } from '../../shared/store'

export default function SessionsPage() {
  const locale = useAppStore((s) => s.settings.locale)
  const sessions = useAppStore((s) => s.sessions)
  const vocab = useAppStore((s) => s.vocab)
  const navigate = useNavigate()
  const setSettle = useAppStore((s) => s.setSettle)

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-semibold">{t(locale, 'sessions')}</h1>
      </header>

      {sessions.length === 0 ? (
        <div className="card p-10 text-center text-mist-400">{t(locale, 'emptySessions')}</div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const words = vocab.filter((v) => v.sessionId === s.id)
            const mins = s.endedAt
              ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60000))
              : null
            return (
              <li key={s.id} className="card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-xs text-mist-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span>{new Date(s.startedAt).toLocaleString()}</span>
                    {s.showName && <span>{s.showName}</span>}
                    {s.episode && <span>{s.episode}</span>}
                    <span>{levelLabel(locale, s.freedomLevel)}</span>
                    {mins != null && (
                      <span>
                        {mins} {t(locale, 'minutes')}
                      </span>
                    )}
                    <span>
                      {words.length} {t(locale, 'words')}
                    </span>
                    {s.demoMode && <span className="text-amber-soft">{t(locale, 'demoMode')}</span>}
                  </div>
                </div>
                <button
                  className="btn-primary shrink-0"
                  onClick={() => {
                    setSettle(s)
                    navigate('/practice')
                  }}
                >
                  {t(locale, 'openPractice')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
