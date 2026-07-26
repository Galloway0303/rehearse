import { useState } from 'react'
import { t } from '../../shared/i18n'
import { useAppStore, showToast } from '../../shared/store'
import FreedomPicker from '../components/FreedomPicker'
import type { FreedomLevel } from '../../shared/types'

export default function Onboarding() {
  const locale = useAppStore((s) => s.settings.locale)
  const settings = useAppStore((s) => s.settings)
  const [step, setStep] = useState(0)
  const [level, setLevel] = useState<FreedomLevel>(2)
  const [baseUrl, setBaseUrl] = useState(settings.ai.baseUrl)
  const [apiKey, setApiKey] = useState(settings.ai.apiKey)
  const [model, setModel] = useState(settings.ai.model)

  const finish = async (skipAi = false) => {
    await window.rehearse.updateSettings({
      onboardingDone: true,
      freedomLevel: level,
      ai: skipAi
        ? settings.ai
        : { baseUrl, apiKey, model },
    })
    showToast(t(locale, 'finish'))
  }

  return (
    <div className="h-full flex items-center justify-center bg-ink-950 p-8">
      <div className="w-full max-w-2xl card p-8 animate-fade-in">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="text-amber-soft font-semibold text-xl">Rehearse</div>
            <div className="text-sm text-mist-400 mt-1">{t(locale, 'onboardingTitle')}</div>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-ghost text-xs"
              onClick={() =>
                window.rehearse.updateSettings({
                  locale: locale === 'en' ? 'zh' : 'en',
                })
              }
            >
              {locale === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-amber-glow' : 'bg-ink-600'}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t(locale, 'step1')}</h2>
            <p className="text-sm text-mist-300 leading-relaxed">{t(locale, 'step1Desc')}</p>
            <p className="text-xs text-mist-400">{t(locale, 'demoModeDesc')}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => window.rehearse.openRegionPicker()}>
                {t(locale, 'selectRegion')}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  showToast(t(locale, 'demoMode'))
                  setStep(1)
                }}
              >
                {t(locale, 'demoMode')} →
              </button>
            </div>
            {settings.region && (
              <div className="text-xs text-amber-soft">
                {t(locale, 'regionSaved')}: {Math.round(settings.region.width)}×
                {Math.round(settings.region.height)}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t(locale, 'step2')}</h2>
            <p className="text-sm text-mist-300">{t(locale, 'step2Desc')}</p>
            <FreedomPicker value={level} onChange={setLevel} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">{t(locale, 'step3')}</h2>
            <p className="text-sm text-mist-300">
              {locale === 'zh'
                ? '可选：配置 xAI API Key。也可跳过，离线模板题仍可用。'
                : 'Optional: add an xAI API key. Or skip — offline template drills still work.'}
            </p>
            <div>
              <label className="label">{t(locale, 'apiBaseUrl')}</label>
              <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <div>
              <label className="label">XAI_API_KEY</label>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xai-…"
              />
            </div>
            <div>
              <label className="label">{t(locale, 'model')}</label>
              <input
                className="input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="grok-4.5"
              />
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t(locale, 'back')}
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button className="btn-ghost" onClick={() => finish(true)}>
                {t(locale, 'skip')}
              </button>
            )}
            {step < 2 ? (
              <button className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                {t(locale, 'next')}
              </button>
            ) : (
              <button className="btn-primary" onClick={() => finish(false)}>
                {t(locale, 'finish')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
