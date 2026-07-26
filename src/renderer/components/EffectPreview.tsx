/**
 * Effect picker — open catalog grouped by vibe.
 * Live canvas preview uses same drawCoverEffect as the mask window.
 */
import React, { useEffect, useRef, useState, useMemo } from 'react'
import type { MaskEffectId, MaskEffectGroup } from '../../shared/types'
import { MASK_EFFECTS, MASK_EFFECT_GROUP_LABELS } from '../../shared/types'
import {
  drawCoverEffect,
  effectFrictionHint,
  TARGET_FRICTION,
  type CoverEffect,
} from '../../mask/effects'
import clsx from 'clsx'

const GROUP_ORDER: MaskEffectGroup[] = ['glass', 'motion', 'hard']

function buildDemoPlate(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#2a3348')
  g.addColorStop(1, '#12161f')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#e8ecf4'
  ctx.font = '600 15px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('I was reluctant to compromise.', w / 2, h * 0.32)
  ctx.fillStyle = '#f2f4f8'
  ctx.font = '600 16px "Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.fillText('我当时很不情愿做出妥协。', w / 2, h * 0.72)
  return c
}

function LiveCanvasPreview({ effect }: { effect: MaskEffectId }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const plateRef = useRef<HTMLCanvasElement | null>(null)
  const raf = useRef(0)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const w = canvas.clientWidth || 360
    const h = canvas.clientHeight || 96
    canvas.width = w
    canvas.height = h
    if (!plateRef.current || plateRef.current.width !== w) {
      plateRef.current = buildDemoPlate(w, h)
    }
    const plate = plateRef.current
    const bandY = Math.floor(h * 0.48)
    const bandH = h - bandY
    const band = document.createElement('canvas')
    band.width = w
    band.height = bandH
    const bctx = band.getContext('2d')!
    bctx.drawImage(plate, 0, bandY, w, bandH, 0, 0, w, bandH)

    const paint = (t: number) => {
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(plate, 0, 0)
      const tmp = document.createElement('canvas')
      tmp.width = w
      tmp.height = bandH
      const tctx = tmp.getContext('2d')!
      drawCoverEffect(tctx, band, w, bandH, effect as CoverEffect, t, TARGET_FRICTION)
      ctx.drawImage(tmp, 0, bandY)
    }

    const loop = (now: number) => {
      paint(now)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [effect])

  const est = effectFrictionHint(effect as CoverEffect, 50)

  return (
    <div className="relative rounded-xl overflow-hidden border border-amber-glow/30 h-24">
      <canvas ref={ref} className="w-full h-full block" />
      <div className="absolute left-2 top-1 text-[10px] font-mono text-amber-soft/90 z-10">
        {effect} · R≈{est.toFixed(1)}
      </div>
    </div>
  )
}

export default function EffectPreview({
  locale,
  value,
  onChange,
}: {
  locale: 'en' | 'zh'
  value: MaskEffectId
  onChange: (e: MaskEffectId) => void
}) {
  const [effect, setEffect] = useState<MaskEffectId>(value)
  useEffect(() => setEffect(value), [value])

  const grouped = useMemo(() => {
    const map = new Map<MaskEffectGroup, typeof MASK_EFFECTS>()
    for (const g of GROUP_ORDER) map.set(g, [])
    for (const e of MASK_EFFECTS) {
      const list = map.get(e.group) || []
      list.push(e)
      map.set(e.group, list)
    }
    return map
  }, [])

  const current = MASK_EFFECTS.find((e) => e.id === effect)

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map((g) => {
        const items = grouped.get(g) || []
        if (!items.length) return null
        const label = MASK_EFFECT_GROUP_LABELS[g]
        return (
          <div key={g} className="space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-mist-400 font-medium">
              {locale === 'zh' ? label.zh : label.en}
            </div>
            <div className="flex flex-wrap gap-2">
              {items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  title={locale === 'zh' ? e.tipZh : e.tipEn}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs border transition',
                    effect === e.id
                      ? 'border-amber-glow bg-amber-glow/15 text-amber-soft'
                      : 'border-white/10 bg-ink-900 text-mist-300 hover:border-white/25',
                  )}
                  onClick={() => {
                    setEffect(e.id)
                    onChange(e.id)
                  }}
                >
                  {locale === 'zh' ? e.zh : e.en}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <LiveCanvasPreview effect={effect} />

      <p className="text-[11px] text-mist-400 leading-relaxed">
        {locale === 'zh'
          ? `${current?.tipZh || ''} · 不限死几种：玻璃系 / 动态局部 / 强遮挡都能选。实时采样视频，不闪。`
          : `${current?.tipEn || ''} · Open catalog: glass, motion/partial, hard cover. Live video sample, no flash.`}
      </p>
    </div>
  )
}
