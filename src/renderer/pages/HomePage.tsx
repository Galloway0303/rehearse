import { useEffect, useState } from 'react'
import { t } from '../../shared/i18n'
import { useAppStore, showToast } from '../../shared/store'
import EffectPreview from '../components/EffectPreview'
import type { MaskEffectId } from '../../shared/types'

export default function HomePage() {
  const locale = useAppStore((s) => s.settings.locale)
  const settings = useAppStore((s) => s.settings)
  const activeSession = useAppStore((s) => s.activeSession)
  const vocab = useAppStore((s) => s.vocab)
  const sessions = useAppStore((s) => s.sessions)
  const ocrRunning = useAppStore((s) => s.ocrRunning)
  const demoMode = useAppStore((s) => s.demoMode)
  const currentSubtitle = useAppStore((s) => s.currentSubtitle)
  const pinMode = useAppStore((s) => s.pinMode || 'idle')
  const pinTl = useAppStore((s) => s.pinTl)
  const [liveCursor, setLiveCursor] = useState<{ x: number; y: number } | null>(null)
  const [countdown, setCountdown] = useState<string>('')

  useEffect(() => {
    const off = window.rehearse.onRegionCursor?.((p) => setLiveCursor(p))
    const off2 = window.rehearse.onRegionCountdown?.((p: unknown) => {
      const msg = p as { n?: number; corner?: string; done?: boolean; error?: string }
      if (msg.error === 'need_tl_first') {
        setCountdown(locale === 'zh' ? '请先标定左上角' : 'Pin top-left first')
        return
      }
      if (msg.done) {
        setCountdown(
          msg.corner === 'tl'
            ? locale === 'zh'
              ? '左上角已记录 ✓'
              : 'Top-left saved ✓'
            : locale === 'zh'
              ? '字幕区完成 ✓'
              : 'Region done ✓',
        )
        return
      }
      if (typeof msg.n === 'number' && msg.n > 0) {
        setCountdown(
          locale === 'zh'
            ? `${msg.corner === 'tl' ? '左上角' : '右下角'}倒计时 ${msg.n}… 鼠标别动到目标角`
            : `${msg.corner} in ${msg.n}… keep mouse on corner`,
        )
      }
    })
    return () => {
      off?.()
      off2?.()
    }
  }, [locale])

  const [title, setTitle] = useState('')
  const [showName, setShowName] = useState('')
  const [episode, setEpisode] = useState('')

  const due = vocab.filter((v) => v.status !== 'known' && v.kind === 'word')

  const start = async (demo: boolean) => {
    await window.rehearse.startSession({
      title: title || (demo ? 'Demo Episode' : `Episode ${new Date().toLocaleString()}`),
      showName: showName || undefined,
      episode: episode || undefined,
      demoMode: demo,
    })
    if (demo) await window.rehearse.startDemo()
    await window.rehearse.showOverlay()
    showToast(t(locale, 'startEpisode'))
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'home')}</h1>
          <p className="text-sm text-mist-400 mt-1 max-w-xl">{t(locale, 'productPitch')}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={() =>
              window.rehearse.updateSettings({ locale: locale === 'en' ? 'zh' : 'en' })
            }
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-xs text-mist-400">{t(locale, 'wordsCaptured')}</div>
          <div className="text-3xl font-semibold text-amber-soft mt-1">
            {vocab.filter((v) => v.kind === 'word').length}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-mist-400">{t(locale, 'dueReview')}</div>
          <div className="text-3xl font-semibold mt-1">{due.length}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs text-mist-400">{t(locale, 'activeSession')}</div>
          <div className="text-lg font-medium mt-1 truncate">
            {activeSession ? activeSession.title : t(locale, 'noSession')}
          </div>
          <div className="text-xs text-mist-400 mt-1">
            {ocrRunning
              ? demoMode
                ? t(locale, 'demoMode')
                : t(locale, 'ocrRunning')
              : t(locale, 'ocrStopped')}
          </div>
        </div>
      </div>

      {/* Core: increase CN friction, keep EN original */}
      <section className="card p-6 space-y-3 border border-amber-glow/25">
        <h2 className="font-medium text-lg">
          {locale === 'zh' ? '中心：只挡中文 · 英文原片保留' : 'Core: cover CN only · EN stays original'}
        </h2>
        <p className="text-sm text-mist-300 leading-relaxed">
          {locale === 'zh'
            ? '只挡中文。特效库开放：苹果大玻璃、明暗呼吸、柔和虚空、真马赛克、烟雾… 不限死几种。实时采样底层视频、不闪。英文用片内字幕。Pip 查词。'
            : 'CN only. Open effect catalog: Apple liquid glass, shade wave, soft void, true mosaic, smoke… Live video sample, no flash. EN on video. Pip for words.'}
        </p>
        <EffectPreview
          locale={locale}
          value={(settings.maskEffect as MaskEffectId) || 'liquid_glass'}
          onChange={(e) => {
            void window.rehearse.updateSettings({ maskEffect: e })
            showToast(locale === 'zh' ? `特效：${e}` : `Effect: ${e}`)
            void window.rehearse.previewMask?.()
          }}
        />
        <div>
          <div className="flex flex-wrap gap-2 mb-2">
            {(
              [
                ['top', locale === 'zh' ? '中文在上（默认）' : 'CN on top'],
                ['bottom', locale === 'zh' ? '中文在下' : 'CN on bottom'],
                ['full', locale === 'zh' ? '整框都挡' : 'Cover full box'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={
                  (settings.maskCnSide || 'top') === id
                    ? 'btn-primary !py-1 !text-xs'
                    : 'btn-ghost !py-1 !text-xs'
                }
                onClick={() => void window.rehearse.updateSettings({ maskCnSide: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {(settings.maskCnSide || 'top') !== 'full' && (
            <>
              <label className="label">
                {locale === 'zh'
                  ? `挡多高：${Math.round((settings.maskCoverRatio ?? 0.5) * 100)}%（从${(settings.maskCnSide || 'top') === 'top' ? '上' : '下'}往里）`
                  : `Cover ${Math.round((settings.maskCoverRatio ?? 0.5) * 100)}% from ${settings.maskCnSide || 'top'}`}
              </label>
              <input
                type="range"
                min={25}
                max={75}
                value={Math.round((settings.maskCoverRatio ?? 0.5) * 100)}
                className="w-full"
                onChange={(ev) => {
                  void window.rehearse.updateSettings({
                    maskCoverRatio: Number(ev.target.value) / 100,
                  })
                }}
              />
            </>
          )}
          <p className="text-[11px] text-mist-400 mt-2">
            {locale === 'zh'
              ? 'Ctrl+Shift+R 框选 · P 暂停选词 · W 点词条 · S 2秒选词 · F 偷看中文'
              : 'Ctrl+Shift+R region · P pause-pick · W word bar · S 2s select · F peek'}
          </p>
          <p className="text-[11px] text-mist-400 mt-1">
            {locale === 'zh'
              ? '常见是上中文下英文。你也可只框中文行并选「整框都挡」。'
              : 'Usually CN top / EN bottom. Or free-box only CN and choose full cover.'}
          </p>
        </div>
      </section>

      {/* Free select on frozen fullscreen snapshot — works with fullscreen movies */}
      <section className="card p-6 space-y-3 border border-amber-glow/30">
        <h2 className="font-medium text-lg">
          {locale === 'zh' ? '① 自由框选打码区（适合全屏电影）' : '① Free-box cover area (fullscreen OK)'}
        </h2>
        <p className="text-sm text-mist-300 leading-relaxed">
          {locale === 'zh'
            ? '先开全屏电影 → 点下面按钮 → 截一张当前画面 → 在截图上随意拖框（中文行/图中字都行）→ 松开确认。不是透明罩盖在视频上，所以不会黑屏。'
            : 'Fullscreen movie first → click below → freeze a snapshot → drag any box (CN line / in-picture) → release. Not a live transparent overlay, so no black video.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            onClick={() => {
              void window.rehearse.openRegionPicker()
              showToast(
                locale === 'zh'
                  ? '在截图上拖框选中文区域…'
                  : 'Drag a box on the snapshot…',
              )
            }}
          >
            {locale === 'zh' ? '截取当前画面并自由框选' : 'Snapshot + free select'}
          </button>
          {settings.region && (
            <button
              className="btn-ghost"
              onClick={() => void window.rehearse.openRegionPicker()}
            >
              {locale === 'zh' ? '重新框选' : 'Re-select'}
            </button>
          )}
        </div>
        {settings.region ? (
          <div className="text-sm text-emerald-300/90 font-mono">
            OK {Math.round(settings.region.width)}×{Math.round(settings.region.height)} @ (
            {Math.round(settings.region.x)},{Math.round(settings.region.y)})
          </div>
        ) : (
          <div className="text-xs text-mist-500">
            {locale === 'zh' ? '尚未选择打码区' : 'No cover area yet'}
          </div>
        )}
        <p className="text-[11px] text-mist-400">
          {locale === 'zh'
            ? '进阶：也可用「3s 角点」不截图标定（次要）。'
            : 'Advanced: 3s corner pin without snapshot (secondary).'}{' '}
          <button
            type="button"
            className="underline text-amber-soft/80"
            onClick={() => {
              void window.rehearse.countdownPin?.('tl', 3)
              showToast(locale === 'zh' ? '3s 角点 A' : '3s corner A')
            }}
          >
            {locale === 'zh' ? '角点 A' : 'Corner A'}
          </button>
          {' · '}
          <button
            type="button"
            className="underline text-amber-soft/80"
            onClick={() => {
              void window.rehearse.countdownPin?.('br', 3)
              showToast(locale === 'zh' ? '3s 角点 B' : '3s corner B')
            }}
          >
            {locale === 'zh' ? '角点 B' : 'Corner B'}
          </button>
        </p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="card p-6 space-y-4">
          <h2 className="font-medium">{t(locale, 'startEpisode')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">{t(locale, 'sessionTitle')}</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. S01E03 — The Negotiation"
              />
            </div>
            <div>
              <label className="label">{t(locale, 'showName')}</label>
              <input className="input" value={showName} onChange={(e) => setShowName(e.target.value)} />
            </div>
            <div>
              <label className="label">{t(locale, 'episodeLabel')}</label>
              <input className="input" value={episode} onChange={(e) => setEpisode(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {!activeSession ? (
              <>
                <button
                  className="btn-primary"
                  disabled={!settings.region}
                  onClick={() => start(false)}
                >
                  {locale === 'zh' ? '③ 开始学习（挡中文+点词）' : '③ Start (cover CN + words)'}
                </button>
                <button className="btn-ghost" onClick={() => start(true)}>
                  {t(locale, 'startDemo')}
                </button>
                <button
                  className="btn-ghost"
                  disabled={!settings.region}
                  onClick={async () => {
                    const ok = await window.rehearse.previewMask?.()
                    showToast(
                      ok
                        ? locale === 'zh'
                          ? '遮罩已盖上中文带（可调特效/比例）'
                          : 'CN cover on — tweak effect/ratio'
                        : locale === 'zh'
                          ? '请先完成角点标定'
                          : 'Pin region first',
                    )
                  }}
                >
                  {locale === 'zh' ? '仅预览遮罩' : 'Preview cover only'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => void window.rehearse.hideMask?.()}
                >
                  {locale === 'zh' ? '关掉遮罩' : 'Hide cover'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    const on = await window.rehearse.toggleWordAssist?.()
                    showToast(
                      on
                        ? locale === 'zh'
                          ? '点词条已开（Ctrl+Shift+W）'
                          : 'Word bar on (Ctrl+Shift+W)'
                        : locale === 'zh'
                          ? '点词条已关'
                          : 'Word bar off',
                    )
                  }}
                >
                  {locale === 'zh' ? '需要时开点词条' : 'Word bar when needed'}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn-primary"
                  onClick={async () => {
                    await window.rehearse.endSession()
                  }}
                >
                  {t(locale, 'endEpisode')}
                </button>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    const on = await window.rehearse.toggleWordAssist?.()
                    showToast(on ? (locale === 'zh' ? '点词条开' : 'Word bar on') : locale === 'zh' ? '点词条关' : 'Word bar off')
                  }}
                >
                  {locale === 'zh' ? '点词条 开/关' : 'Toggle word bar'}
                </button>
                {demoMode ? (
                  <button className="btn-ghost" onClick={() => window.rehearse.stopDemo()}>
                    {t(locale, 'stopDemo')}
                  </button>
                ) : ocrRunning ? (
                  <button className="btn-ghost" onClick={() => window.rehearse.stopOcr()}>
                    {t(locale, 'stopOcr')}
                  </button>
                ) : (
                  <button className="btn-ghost" onClick={() => window.rehearse.startOcr()}>
                    {t(locale, 'startOcr')}
                  </button>
                )}
              </>
            )}
          </div>

          {currentSubtitle && (
            <div className="rounded-xl bg-ink-900 border border-white/5 p-4 mt-2">
              <div className="text-xs text-mist-400 mb-1">
                {locale === 'zh' ? '点词辅助（OCR 英文）' : 'Word assist (OCR EN)'}
              </div>
              <div className="text-base text-mist-100">{currentSubtitle.en}</div>
            </div>
          )}
        </section>

        <section className="card p-6 space-y-4">
          <h2 className="font-medium">
            {locale === 'zh' ? '怎么用（3 步）' : 'How to use (3 steps)'}
          </h2>
          <ol className="text-sm text-mist-200 space-y-2 list-decimal list-inside leading-relaxed">
            <li>{locale === 'zh' ? '全屏电影先开着' : 'Start fullscreen movie'}</li>
            <li>{locale === 'zh' ? '截图自由框选中文/要打码的区域' : 'Snapshot + free-box the CN area'}</li>
            <li>{locale === 'zh' ? '选特效与遮挡比例，预览遮罩' : 'Pick effect/ratio, preview cover'}</li>
            <li>{locale === 'zh' ? '开始学习；点词条仅需要时打开' : 'Start; word bar only when needed'}</li>
          </ol>
          <p className="text-xs text-mist-400">
            {locale === 'zh'
              ? '暂停选词：Ctrl+Shift+P（抬遮罩+开点词）。偷看中文：F 或点遮罩。'
              : 'Pause-pick: Ctrl+Shift+P. Peek CN: F or click cover.'}
          </p>

          <div className="pt-2">
            <h3 className="text-sm font-medium mb-2">{t(locale, 'recentSessions')}</h3>
            {sessions.length === 0 ? (
              <p className="text-sm text-mist-400">{t(locale, 'homeEmptyBody')}</p>
            ) : (
              <ul className="space-y-2">
                {sessions.slice(0, 5).map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between text-sm rounded-lg bg-ink-900/80 px-3 py-2 border border-white/5"
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="text-mist-400 shrink-0 ml-2">
                      {s.wordIds.length} {t(locale, 'words')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
