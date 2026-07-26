import { useState } from 'react'
import { t } from '../../shared/i18n'
import { useAppStore, showToast } from '../../shared/store'
import type { MaskEffectId } from '../../shared/types'
import { MASK_EFFECTS } from '../../shared/types'

export default function SettingsPage() {
  const locale = useAppStore((s) => s.settings.locale)
  const settings = useAppStore((s) => s.settings)
  const aiReady = useAppStore((s) => s.aiReady)
  const aiModel = useAppStore((s) => s.aiModel)
  const aiSource = useAppStore((s) => s.aiSource)
  const [baseUrl, setBaseUrl] = useState(settings.ai.baseUrl)
  const [apiKey, setApiKey] = useState(settings.ai.apiKey)
  const [model, setModel] = useState(settings.ai.model)
  const [intervalMs, setIntervalMs] = useState(settings.ocr.intervalMs)
  const [testing, setTesting] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const saveAi = async () => {
    await window.rehearse.updateSettings({
      ai: { baseUrl, apiKey, model },
      ocr: { ...settings.ocr, intervalMs: Number(intervalMs) || 900 },
    })
    showToast(t(locale, 'saved'))
  }

  const test = async () => {
    await window.rehearse.updateSettings({ ai: { baseUrl, apiKey, model } })
    setTesting(true)
    const res = (await window.rehearse.testAi()) as { ok: boolean; message: string }
    setTesting(false)
    showToast(res.ok ? t(locale, 'testOk') : `${t(locale, 'testFail')}: ${res.message}`)
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">{t(locale, 'settings')}</h1>
      </header>

      <section className="card p-6 space-y-4">
        <h2 className="font-medium">{t(locale, 'locale')}</h2>
        <div className="flex gap-2">
          <button
            className={locale === 'en' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => window.rehearse.updateSettings({ locale: 'en' })}
          >
            English
          </button>
          <button
            className={locale === 'zh' ? 'btn-primary' : 'btn-ghost'}
            onClick={() => window.rehearse.updateSettings({ locale: 'zh' })}
          >
            中文
          </button>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="font-medium">
          {locale === 'zh' ? '中文遮罩（核心）' : 'Chinese cover (core)'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {MASK_EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              className={
                settings.maskEffect === e.id ? 'btn-primary !py-1.5 !text-xs' : 'btn-ghost !py-1.5 !text-xs'
              }
              onClick={() => window.rehearse.updateSettings({ maskEffect: e.id as MaskEffectId })}
            >
              {locale === 'zh' ? e.zh : e.en}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['top', locale === 'zh' ? '中文在上' : 'CN top'],
              ['bottom', locale === 'zh' ? '中文在下' : 'CN bottom'],
              ['full', locale === 'zh' ? '整框' : 'Full box'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={
                (settings.maskCnSide || 'top') === id ? 'btn-primary !py-1 !text-xs' : 'btn-ghost !py-1 !text-xs'
              }
              onClick={() => window.rehearse.updateSettings({ maskCnSide: id })}
            >
              {label}
            </button>
          ))}
        </div>
        {(settings.maskCnSide || 'top') !== 'full' && (
          <div>
            <label className="label">
              {locale === 'zh'
                ? `遮挡比例 ${Math.round((settings.maskCoverRatio ?? 0.5) * 100)}%`
                : `Cover ratio ${Math.round((settings.maskCoverRatio ?? 0.5) * 100)}%`}
            </label>
            <input
              type="range"
              min={25}
              max={75}
              className="w-full"
              value={Math.round((settings.maskCoverRatio ?? 0.5) * 100)}
              onChange={(e) =>
                window.rehearse.updateSettings({ maskCoverRatio: Number(e.target.value) / 100 })
              }
            />
          </div>
        )}
      </section>

      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-medium">
            {locale === 'zh' ? 'xAI API（可选）' : 'xAI API (optional)'}
          </h2>
          <span
            className={`chip ${aiReady ? 'bg-emerald-500/15 text-emerald-300' : 'bg-ink-700 text-mist-400'}`}
          >
            {aiReady
              ? `Ready · ${aiModel || 'grok-4.5'}${aiSource && aiSource !== 'none' ? ` · ${aiSource}` : ''}`
              : locale === 'zh'
                ? '未配置'
                : 'No key'}
          </span>
        </div>
        <p className="text-sm text-mist-300 leading-relaxed">
          {locale === 'zh'
            ? '用于翻译与写回练习出题。凭据只在主进程使用，不会写入前端包。也可在项目根目录 .env 设置 XAI_API_KEY。留空保存不会覆盖已有 Key。'
            : 'Used for translation and rehearse drills. The key stays in the main process and is never bundled into the UI. You can also set XAI_API_KEY in a local .env. Leaving the field blank keeps the saved key.'}
        </p>
        <div>
          <label className="label">{t(locale, 'apiBaseUrl')}</label>
          <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <p className="text-[11px] text-mist-400 mt-1">
            Default: https://api.x.ai/v1 · model: grok-4.5 ·{' '}
            <button
              type="button"
              className="text-amber-soft underline"
              onClick={() => window.rehearse.openExternal('https://console.x.ai')}
            >
              console.x.ai
            </button>
          </p>
        </div>
        <div>
          <label className="label">{t(locale, 'apiKey')}</label>
          <input
            className="input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              aiReady
                ? locale === 'zh'
                  ? '已配置 — 输入新 Key 可替换'
                  : 'Configured — enter a new key to replace'
                : 'xai-…'
            }
            autoComplete="off"
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
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              setBaseUrl('https://api.x.ai/v1')
              setModel('grok-4.5')
            }}
          >
            {locale === 'zh' ? '恢复默认端点' : 'Reset defaults'}
          </button>
          <button className="btn-primary" onClick={() => void saveAi()}>
            {t(locale, 'save')}
          </button>
          <button className="btn-ghost" disabled={testing} onClick={() => void test()}>
            {testing ? t(locale, 'loading') : t(locale, 'testConnection')}
          </button>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="font-medium">OCR</h2>
        <div>
          <label className="label">{t(locale, 'ocrInterval')}</label>
          <input
            className="input"
            type="number"
            value={intervalMs}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">{t(locale, 'ocrLang')}</label>
          <select
            className="input"
            value={settings.ocr.lang}
            onChange={(e) =>
              window.rehearse.updateSettings({
                ocr: {
                  ...settings.ocr,
                  lang: e.target.value as 'eng' | 'chi_sim' | 'eng+chi_sim',
                },
              })
            }
          >
            <option value="eng+chi_sim">English + 中文</option>
            <option value="eng">English</option>
            <option value="chi_sim">中文</option>
          </select>
        </div>
        <button className="btn-ghost" onClick={() => window.rehearse.openRegionPicker()}>
          {t(locale, 'reselectRegion')}
        </button>
        {settings.region && (
          <div className="text-xs text-mist-400">
            Region: {Math.round(settings.region.x)},{Math.round(settings.region.y)} ·{' '}
            {Math.round(settings.region.width)}×{Math.round(settings.region.height)}
          </div>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="font-medium">{t(locale, 'privacyTitle')}</h2>
        <p className="text-sm text-mist-300 leading-relaxed">{t(locale, 'privacyBody')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.adaptiveDecel}
            onChange={(e) =>
              window.rehearse.updateSettings({ adaptiveDecel: e.target.checked })
            }
          />
          {t(locale, 'adaptiveDecel')}
        </label>
        <p className="text-xs text-mist-400">{t(locale, 'adaptiveDecelDesc')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.notifyReview}
            onChange={(e) =>
              window.rehearse.updateSettings({ notifyReview: e.target.checked })
            }
          />
          {t(locale, 'notifyReview')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.chineseMirrorEffect}
            onChange={(e) =>
              window.rehearse.updateSettings({ chineseMirrorEffect: e.target.checked })
            }
          />
          {t(locale, 'mirrorEffect')}
        </label>
      </section>

      <section className="card p-6 space-y-3">
        <h2 className="font-medium text-red-300">{t(locale, 'clearAllData')}</h2>
        {!confirmClear ? (
          <button className="btn-danger" onClick={() => setConfirmClear(true)}>
            {t(locale, 'clearAllData')}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-mist-300">{t(locale, 'confirmClear')}</span>
            <button
              className="btn-danger"
              onClick={async () => {
                await window.rehearse.clearData()
                setConfirmClear(false)
                showToast(t(locale, 'saved'))
              }}
            >
              {t(locale, 'confirm')}
            </button>
            <button className="btn-ghost" onClick={() => setConfirmClear(false)}>
              {t(locale, 'cancel')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
