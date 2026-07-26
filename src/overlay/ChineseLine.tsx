import React, { useMemo } from 'react'
import type { ZhEffect } from '../shared/types'
import clsx from 'clsx'

function scrambleText(s: string): string {
  // Keep CJK length, scramble order in chunks so it's unreadable at a glance
  const chars = [...s]
  for (let i = chars.length - 1; i > 0; i--) {
    if (i % 2 === 0) continue
    const j = Math.max(0, i - 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/**
 * Chinese decelerate visuals — intentionally heavy so learners cannot free-ride CN.
 * Click / flash clears to real text.
 */
export default function ChineseLine({
  text,
  effect,
  clear,
  onNeedClear,
  style,
}: {
  text: string
  effect: ZhEffect
  clear: boolean
  onNeedClear: () => void
  style?: React.CSSProperties
}) {
  const scrambled = useMemo(() => scrambleText(text), [text])
  const display = !clear && effect === 'scramble' ? scrambled : text

  if (clear || effect === 'none') {
    return (
      <div className="text-center mt-1.5 text-mist-100 leading-snug" style={style}>
        {text}
      </div>
    )
  }

  if (effect === 'soft') {
    return (
      <div
        className="text-center mt-1.5 text-mist-200 leading-snug cursor-pointer"
        style={{ ...style, opacity: 0.45, filter: 'blur(1.2px)' }}
        onClick={onNeedClear}
        title="Click to clear Chinese"
      >
        {text}
      </div>
    )
  }

  if (effect === 'mosaic') {
    return (
      <div
        className="text-center mt-1.5 cursor-pointer relative inline-block w-full"
        onClick={onNeedClear}
        title="Mosaic Chinese — click to reveal"
      >
        <div
          className="leading-snug select-none"
          style={{
            ...style,
            // pixelate: huge blur + hard contrast + tiny scale dance via image-rendering trick
            filter: 'blur(7px) contrast(1.6) saturate(0.2)',
            transform: 'scale(1.02)',
            opacity: 0.9,
            letterSpacing: '0.12em',
          }}
        >
          {text}
        </div>
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.35) 3px, rgba(0,0,0,0.35) 4px), repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.25) 3px, rgba(0,0,0,0.25) 4px)',
            mixBlendMode: 'multiply',
          }}
        />
        <div className="text-[10px] text-amber-soft/80 mt-0.5">▣ mosaic · click</div>
      </div>
    )
  }

  if (effect === 'glitch') {
    return (
      <div
        className="text-center mt-1.5 cursor-pointer relative"
        onClick={onNeedClear}
        title="Glitch Chinese — click to reveal"
      >
        <div className="zh-glitch leading-snug select-none" data-text={text} style={style}>
          {text}
        </div>
        <div className="text-[10px] text-amber-soft/80 mt-0.5">⚡ glitch · click</div>
      </div>
    )
  }

  if (effect === 'warp') {
    return (
      <div
        className="text-center mt-1.5 cursor-pointer"
        onClick={onNeedClear}
        title="Warp Chinese — click to reveal"
      >
        <div
          className="leading-snug select-none zh-warp"
          style={{
            ...style,
            filter: 'blur(3px) contrast(1.3)',
          }}
        >
          {text}
        </div>
        <div className="text-[10px] text-amber-soft/80 mt-0.5">〰 warp · click</div>
      </div>
    )
  }

  if (effect === 'blackhole') {
    return (
      <div
        className="text-center mt-1.5 cursor-pointer relative overflow-hidden py-1"
        onClick={onNeedClear}
        title="Blackhole Chinese — click to reveal"
      >
        <div
          className="leading-snug select-none zh-blackhole inline-block max-w-full"
          style={style}
        >
          {text}
        </div>
        <div className="text-[10px] text-amber-soft/80 mt-0.5">◉ blackhole · click</div>
      </div>
    )
  }

  // scramble
  return (
    <div
      className={clsx('text-center mt-1.5 cursor-pointer leading-snug select-none')}
      style={{ ...style, opacity: 0.75, letterSpacing: '0.08em' }}
      onClick={onNeedClear}
      title="Scrambled Chinese — click to reveal"
    >
      {display}
      <div className="text-[10px] text-amber-soft/80 mt-0.5">ϟ scramble · click</div>
    </div>
  )
}
