import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore, showToast } from '../shared/store'
import { t } from '../shared/i18n'
import HomePage from './pages/HomePage'
import VocabPage from './pages/VocabPage'
import SessionsPage from './pages/SessionsPage'
import PracticePage from './pages/PracticePage'
import SettingsPage from './pages/SettingsPage'
import Onboarding from './pages/Onboarding'
import Toast from './components/Toast'
import { useEffect, useRef } from 'react'

const nav = [
  { path: '/', key: 'home' },
  { path: '/vocab', key: 'vocab' },
  { path: '/sessions', key: 'sessions' },
  { path: '/practice', key: 'practice' },
  { path: '/settings', key: 'settings' },
] as const

export default function App() {
  const locale = useAppStore((s) => s.settings.locale)
  const onboardingDone = useAppStore((s) => s.settings.onboardingDone)
  const hydrated = useAppStore((s) => s.hydrated)
  const settleSession = useAppStore((s) => s.settleSession)
  const location = useLocation()
  const navigate = useNavigate()
  /** Only auto-open practice once per settled session — never trap user on /practice. */
  const autoNavSettleId = useRef<string | null>(null)

  useEffect(() => {
    if (!settleSession) {
      autoNavSettleId.current = null
      return
    }
    // Already auto-navigated for this settle → allow free navigation (Home / Vocab / …)
    if (autoNavSettleId.current === settleSession.id) return
    autoNavSettleId.current = settleSession.id
    showToast(t(locale, 'settleTitle'))
    navigate('/practice')
  }, [settleSession, locale, navigate])

  if (!hydrated) {
    return (
      <div className="h-full flex items-center justify-center bg-ink-950 text-mist-300">
        {t(locale, 'loading')}
      </div>
    )
  }

  if (!onboardingDone) {
    return (
      <>
        <Onboarding />
        <Toast />
      </>
    )
  }

  return (
    <div className="h-full flex bg-ink-950 text-mist-100">
      <aside className="w-56 shrink-0 border-r border-white/5 bg-ink-900/80 p-4 flex flex-col">
        <div className="mb-8 px-1">
          <div className="text-lg font-semibold tracking-tight text-amber-soft">Rehearse</div>
          <div className="text-[11px] text-mist-400 mt-0.5">{t(locale, 'slogan')}</div>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => {
            const active =
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            return (
              <button
                key={item.path}
                className={active ? 'nav-item-active' : 'nav-item'}
                onClick={() => navigate(item.path)}
              >
                {t(locale, item.key)}
              </button>
            )
          })}
        </nav>
        <div className="mt-auto pt-6">
          <div className="card p-3 text-[11px] text-mist-400 leading-relaxed">
            {t(locale, 'sidebarTip')}
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vocab" element={<VocabPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Toast />
    </div>
  )
}
