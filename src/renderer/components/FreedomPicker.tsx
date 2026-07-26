import type { FreedomLevel } from '../../shared/types'
import { FREEDOM_PRESETS } from '../../shared/types'
import { t, levelLabel, levelDesc } from '../../shared/i18n'
import { useAppStore } from '../../shared/store'
import clsx from 'clsx'

export default function FreedomPicker({
  value,
  onChange,
  compact,
}: {
  value: FreedomLevel
  onChange: (l: FreedomLevel) => void
  compact?: boolean
}) {
  const locale = useAppStore((s) => s.settings.locale)
  const levels: FreedomLevel[] = [0, 1, 2, 3, 4]

  return (
    <div className={clsx('grid gap-2', compact ? 'grid-cols-5' : 'grid-cols-1 sm:grid-cols-5')}>
      {levels.map((lv) => {
        const effect = FREEDOM_PRESETS[lv].zhEffect
        return (
          <button
            key={lv}
            type="button"
            onClick={() => onChange(lv)}
            className={clsx(
              'rounded-xl border p-3 text-left transition',
              value === lv
                ? 'border-amber-glow/50 bg-amber-glow/10 shadow-glow'
                : 'border-white/5 bg-ink-900/60 hover:border-white/15',
            )}
          >
            <div className="text-xs text-mist-400 mb-1">L{lv}</div>
            <div className="text-sm font-medium text-mist-100">{levelLabel(locale, lv)}</div>
            <div className="text-[10px] text-amber-soft/90 mt-1 font-mono">
              {effect === 'none' ? '—' : effect}
            </div>
            {!compact && (
              <div className="text-[11px] text-mist-400 mt-1 leading-snug">{levelDesc(locale, lv)}</div>
            )}
          </button>
        )
      })}
      {!compact && (
        <div className="sm:col-span-5 text-xs text-mist-400 mt-1">{t(locale, 'freedom')}</div>
      )}
    </div>
  )
}
