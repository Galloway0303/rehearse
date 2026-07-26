import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../../shared/i18n'
import { useAppStore, showToast } from '../../shared/store'
import type { Exercise, ExerciseResult } from '../../shared/types'
import clsx from 'clsx'

const typeKey: Record<Exercise['type'], string> = {
  situation: 'typeSituation',
  cloze: 'typeCloze',
  ban_literal: 'typeBanLiteral',
  role: 'typeRole',
  contrast: 'typeContrast',
}

export default function PracticePage() {
  const navigate = useNavigate()
  const locale = useAppStore((s) => s.settings.locale)
  const settleSession = useAppStore((s) => s.settleSession)
  const sessions = useAppStore((s) => s.sessions)
  const vocab = useAppStore((s) => s.vocab)
  const exercises = useAppStore((s) => s.exercises)
  const results = useAppStore((s) => s.results)
  const practiceSource = useAppStore((s) => s.practiceSource)
  const setPractice = useAppStore((s) => s.setPractice)
  const addResult = useAppStore((s) => s.addResult)
  const setSettle = useAppStore((s) => s.setSettle)
  const settings = useAppStore((s) => s.settings)

  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [idx, setIdx] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<ExerciseResult | null>(null)
  const [showHint, setShowHint] = useState(false)

  const session = settleSession || sessions[0] || null
  const sessionWords = useMemo(
    () => (session ? vocab.filter((v) => v.sessionId === session.id) : []),
    [session, vocab],
  )

  const current = exercises[idx]
  // Finished only after user advances past the last card (not merely after grading)
  const done = exercises.length > 0 && idx >= exercises.length

  /** Clear settle + drills and leave practice (fixes “做完退不出去”). */
  const leavePractice = (to: '/' | '/sessions' | '/vocab' = '/') => {
    setPractice([], null)
    setSettle(null)
    setIdx(0)
    setAnswer('')
    setFeedback(null)
    setShowHint(false)
    setChecking(false)
    navigate(to)
  }

  const generate = async () => {
    if (!session) {
      showToast(t(locale, 'emptySessions'))
      return
    }
    setLoading(true)
    setFeedback(null)
    setAnswer('')
    setIdx(0)
    try {
      const res = (await window.rehearse.generatePractice(session.id)) as {
        exercises: Exercise[]
        source: 'ai' | 'fallback'
      }
      setPractice(res.exercises, res.source)
      if (res.source === 'fallback') showToast(t(locale, 'fallbackDrills'))
      const aiReady = useAppStore.getState().aiReady
      if (!settings.ai.apiKey && !aiReady) {
        showToast(t(locale, 'noApiKey'))
      }
    } catch {
      showToast(t(locale, 'errorGeneric'))
    } finally {
      setLoading(false)
    }
  }

  const check = async () => {
    if (!current || checking || feedback) return
    setChecking(true)
    try {
      const r = (await window.rehearse.submitAnswer({
        exercise: current,
        userAnswer: answer,
        results,
      })) as ExerciseResult
      setFeedback(r)
      addResult(r)
    } catch {
      showToast(t(locale, 'errorGeneric'))
    } finally {
      setChecking(false)
    }
  }

  const next = () => {
    setFeedback(null)
    setAnswer('')
    setShowHint(false)
    setIdx((i) => i + 1)
  }

  const score = results.filter((r) => r.correct).length
  const progressLabel =
    exercises.length > 0
      ? `${Math.min(idx + 1, exercises.length)}/${exercises.length}`
      : '0/0'

  return (
    <div className="p-8 space-y-6 animate-fade-in max-w-3xl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'practice')}</h1>
          <p className="text-sm text-mist-400 mt-1">{t(locale, 'settleSubtitle')}</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => leavePractice('/')}
          title={locale === 'zh' ? '离开练习，回到首页' : 'Leave practice'}
        >
          {locale === 'zh' ? '离开练习' : 'Leave'}
        </button>
      </header>

      {session && (
        <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-mist-400">{t(locale, 'settleTitle')}</div>
            <div className="font-medium">{session.title}</div>
            <div className="text-xs text-mist-400 mt-1">
              {sessionWords.length} {t(locale, 'words')} · {t(locale, 'suggestedPractice')}{' '}
              {Math.max(3, Math.min(8, sessionWords.length || 5))} {t(locale, 'minutes')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={loading} onClick={() => void generate()}>
              {loading ? t(locale, 'generating') : t(locale, 'generateDrills')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => leavePractice('/')}>
              {locale === 'zh' ? '先不练了' : 'Skip for now'}
            </button>
          </div>
        </div>
      )}

      {!session && (
        <div className="card p-10 text-center space-y-3">
          <div className="text-mist-400">{t(locale, 'emptySessions')}</div>
          <button type="button" className="btn-primary" onClick={() => leavePractice('/')}>
            {locale === 'zh' ? '回首页' : 'Back home'}
          </button>
        </div>
      )}

      {session && sessionWords.length === 0 && exercises.length === 0 && (
        <div className="text-sm text-mist-400 space-y-2">
          <p>{t(locale, 'noWordsSettle')}</p>
          <button type="button" className="btn-ghost" onClick={() => leavePractice('/')}>
            {locale === 'zh' ? '离开' : 'Leave'}
          </button>
        </div>
      )}

      {practiceSource && exercises.length > 0 && !done && (
        <div className="text-xs text-mist-400">
          {practiceSource === 'fallback' ? t(locale, 'fallbackDrills') : 'AI'} · {progressLabel}
          {results.length > 0 && (
            <span className="ml-2">
              {t(locale, 'score')}: {score}/{results.length}
            </span>
          )}
        </div>
      )}

      {current && !done && (
        <div className="card p-6 space-y-4">
          <div className="chip bg-amber-glow/15 text-amber-soft border border-amber-glow/20">
            {t(locale, typeKey[current.type])}
          </div>
          <div className="text-base leading-relaxed text-mist-100 whitespace-pre-wrap">
            {locale === 'zh' ? current.promptZh : current.promptEn}
          </div>
          {locale === 'zh' && (
            <div className="text-sm text-mist-400 whitespace-pre-wrap">{current.promptEn}</div>
          )}
          {locale === 'en' && (
            <div className="text-sm text-mist-400 whitespace-pre-wrap">{current.promptZh}</div>
          )}

          {!feedback && (
            <>
              <input
                className="input"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t(locale, 'yourAnswer')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void check()
                }}
                autoFocus
                disabled={checking}
              />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={checking} onClick={() => void check()}>
                  {checking ? '…' : t(locale, 'check')}
                </button>
                <button className="btn-ghost" type="button" onClick={() => setShowHint(true)}>
                  {t(locale, 'hint')}
                </button>
                <button className="btn-ghost" type="button" onClick={() => leavePractice('/')}>
                  {locale === 'zh' ? '退出' : 'Exit'}
                </button>
              </div>
              {showHint && current.hint && (
                <div className="text-sm text-amber-soft/90 font-mono">{current.hint}</div>
              )}
            </>
          )}

          {feedback && (
            <div
              className={clsx(
                'rounded-xl border p-4 space-y-2',
                feedback.correct
                  ? 'border-emerald-500/30 bg-emerald-500/10'
                  : 'border-red-500/30 bg-red-500/10',
              )}
            >
              <div className="font-medium">
                {feedback.correct ? t(locale, 'correct') : t(locale, 'incorrect')}
                {!feedback.correct && (
                  <span className="ml-2 text-amber-soft">{current.answer}</span>
                )}
              </div>
              <div className="text-sm">
                <span className="text-mist-400">{t(locale, 'reveal')}: </span>
                {current.revealSentence}
              </div>
              <div className="text-sm text-mist-300">
                <span className="text-mist-400">{t(locale, 'why')}: </span>
                {current.why}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    if (idx + 1 >= exercises.length) {
                      setIdx(exercises.length)
                    } else next()
                  }}
                >
                  {idx + 1 >= exercises.length
                    ? t(locale, 'finishPractice')
                    : t(locale, 'nextQuestion')}
                </button>
                <button className="btn-ghost" type="button" onClick={() => leavePractice('/')}>
                  {locale === 'zh' ? '退出练习' : 'Exit practice'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="card p-8 text-center space-y-3">
          <div className="text-3xl font-semibold text-amber-soft">
            {t(locale, 'score')}: {score}/{exercises.length}
          </div>
          <p className="text-sm text-mist-300">{t(locale, 'settleSubtitle')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => leavePractice('/')}
            >
              {locale === 'zh' ? '完成并回首页' : 'Done — home'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => void generate()}>
              {t(locale, 'continuePractice')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => leavePractice('/sessions')}>
              {locale === 'zh' ? '去本集列表' : 'Sessions'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
