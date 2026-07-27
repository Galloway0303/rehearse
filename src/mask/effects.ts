/**
 * Extensible live-video cover effects for CN strip.
 * High-standard materials:
 *  - liquid_glass: Apple UIVisualEffect / liquid glass stack (refraction + vibrancy + Fresnel)
 *  - blackhole: gravitational lens / force-field warp (inverse-square + event horizon + photon ring)
 */

export type CoverEffect =
  | 'solid'
  | 'mosaic'
  | 'liquid_glass'
  | 'frost'
  | 'glass'
  | 'shade_wave'
  | 'soft_void'
  | 'veil'
  | 'glitch'
  | 'prism'
  | 'smoke'
  | 'ripple'
  | 'blackhole'
  | 'flip' // 倒过来 — upside-down video strip
  | 'slow_blur' // 缓慢模糊 — gently drifting blur depth
  | 'blur'

/** Design score: 1 free · 7 hard-but-glyphs-remain · 10 gone. */
export const TARGET_FRICTION = 7.0

/**
 * Global animation tempo. Previous speeds were ~3–4× too fast for subtitle viewing.
 * 0.28 ≈ calm, readable motion (several seconds per cycle).
 */
export const ANIM_TEMPO = 0.28

/** Slow time for all effect animation (seconds-scale, not twitchy). */
export function animT(timeMs: number, speed = 1): number {
  return timeMs * 0.001 * ANIM_TEMPO * speed
}

export function blocksPerGlyphForFriction(friction = TARGET_FRICTION): number {
  const f = Math.min(10, Math.max(1, friction))
  return 4.1 - ((f - 1) / 9) * 3.4
}

export function blockSizeForFriction(height: number, friction = TARGET_FRICTION): number {
  const h = Math.max(8, height)
  const glyph = Math.max(12, h * 0.9)
  // Mosaic clarity: use slightly lower friction so tiles are smaller / sharper
  const mosaicF = Math.max(1, friction - 1.2)
  const bpg = Math.max(0.55, blocksPerGlyphForFriction(mosaicF))
  const block = Math.round(glyph / bpg)
  const minBlock = Math.max(8, Math.round(h * 0.22))
  return Math.max(minBlock, Math.min(56, block))
}

export function estimateFriction(stripHeight: number, block: number): number {
  const glyph = Math.max(12, stripHeight * 0.9)
  const bpg = glyph / Math.max(1, block)
  const f = 1 + ((4.1 - bpg) / 3.4) * 9
  return Math.round(Math.min(10, Math.max(1, f)) * 10) / 10
}

export function effectFrictionHint(effect: CoverEffect, stripH = 60): number {
  switch (effect) {
    case 'mosaic':
      return estimateFriction(stripH, blockSizeForFriction(stripH, TARGET_FRICTION))
    case 'solid':
      return 10
    case 'liquid_glass':
    case 'frost':
      return 7.0
    case 'glass':
    case 'blur':
      return 6.0
    case 'shade_wave':
      return 7.0
    case 'soft_void':
      return 7.0
    case 'veil':
      return 6.5
    case 'smoke':
      return 6.8
    case 'glitch':
      return 7.0
    case 'prism':
      return 6.6
    case 'ripple':
      return 7.0
    case 'blackhole':
      return 7.5
    case 'flip':
      return 7.0
    case 'slow_blur':
      return 6.5
    default:
      return 6
  }
}

function ensureTmp(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

function blurPass(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  down = 8,
) {
  const sw = Math.max(2, Math.floor(w / down))
  const sh = Math.max(2, Math.floor(h / down))
  const tmp = ensureTmp(sw, sh)
  const tctx = tmp.getContext('2d')!
  tctx.imageSmoothingEnabled = true
  tctx.drawImage(src, 0, 0, sw, sh)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(tmp, 0, 0, w, h)
}

/** Draw source filling canvas without nonuniform stretch (fixes “字幕变小错位”). */
export function drawImageContainFill(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
) {
  const any = src as HTMLImageElement &
    HTMLCanvasElement & { videoWidth?: number; videoHeight?: number }
  const iw =
    any.naturalWidth || any.videoWidth || any.width || (src as HTMLCanvasElement).width || w
  const ih =
    any.naturalHeight || any.videoHeight || any.height || (src as HTMLCanvasElement).height || h
  if (!iw || !ih) {
    ctx.drawImage(src, 0, 0, w, h)
    return
  }
  // cover: fill bounds, crop overflow — preserves aspect (no squash/stretch)
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (w - dw) / 2
  const dy = (h - dh) / 2
  ctx.drawImage(src, dx, dy, dw, dh)
}

export function drawSolid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#030406'
  ctx.fillRect(0, 0, w, h)
}

export function drawMosaic(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  blockSize?: number,
  friction = TARGET_FRICTION,
) {
  const block = blockSize ?? blockSizeForFriction(h, friction)
  const tw = Math.max(1, Math.floor(w / block))
  const th = Math.max(1, Math.floor(h / block))
  const tiny = ensureTmp(tw, th)
  const tctx = tiny.getContext('2d')!
  tctx.imageSmoothingEnabled = true
  // fill tiny from source with cover so aspect stays honest
  drawImageContainFill(tctx, src, tw, th)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(tiny, 0, 0, tw, th, 0, 0, w, h)
  // no dark plate / grid — crisp mosaic, clarity from smaller tiles
}

/**
 * Frosted glass (磨砂玻璃) — what people mean by Apple glass in UI:
 * heavy backdrop blur + soft translucent plate. NOT glossy, NOT bright specular.
 * Mental model: CSS `backdrop-filter: blur(24px) saturate(1.05)` +
 * `background: rgba(255,255,255,0.12)` on dark video → milky soft, not flashy.
 */
/** 0..1 slow drift for regional soft plates (2D approximation). */
function field01(timeMs: number, phase = 0): number {
  const t = animT(timeMs, 0.4) + phase
  return 0.5 + 0.5 * Math.sin(t)
}

/**
 * Mild regional frost: base image stays mostly sharp, soft lobes add blur
 * via low-alpha soft plates — NOT a strip-wide soup.
 */
function mildRegionalFrost(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs: number,
  blurSoft = 5,
) {
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  // one light global frost (clearable)
  blurPass(ctx, ctx.canvas, w, h, 2)
  // softer regional lobes via dark-milk gradients (reads as partial frost)
  const t = animT(timeMs, 0.45)
  for (let i = 0; i < 3; i++) {
    const cx = ((Math.sin(t + i * 1.7) * 0.5 + 0.5) * 0.8 + 0.1) * w
    const rw = w * (0.22 + (i % 2) * 0.08)
    const g = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0)
    const a = 0.08 + field01(timeMs, i) * 0.10
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.5, `rgba(30,32,38,${a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  // second light pass only where soft — approximate with medium blur at low alpha
  const tmp = ensureTmp(w, h)
  const tctx = tmp.getContext('2d')!
  tctx.clearRect(0, 0, w, h)
  tctx.drawImage(ctx.canvas, 0, 0)
  blurPass(tctx, tmp, w, h, blurSoft)
  ctx.globalAlpha = 0.35 + field01(timeMs) * 0.2
  ctx.drawImage(tmp, 0, 0)
  ctx.globalAlpha = 1
}

export function drawLiquidGlass(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  // soft frost — see shapes, not blackout
  mildRegionalFrost(ctx, src, w, h, timeMs, 6)
  ctx.fillStyle = `rgba(18,20,26,${0.10 + field01(timeMs) * 0.06})`
  ctx.fillRect(0, 0, w, h)
}

export function drawFrost(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  mildRegionalFrost(ctx, src, w, h, timeMs, 7)
  ctx.fillStyle = `rgba(16,18,24,${0.12 + field01(timeMs, 0.5) * 0.06})`
  ctx.fillRect(0, 0, w, h)
}

export function drawGlass(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  mildRegionalFrost(ctx, src, w, h, timeMs, 5)
  ctx.fillStyle = `rgba(14,16,20,${0.08 + field01(timeMs, 1.1) * 0.05})`
  ctx.fillRect(0, 0, w, h)
}

export function drawShadeWave(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  // 可见动态：横移 + 呼吸幅度（animT 已含 0.28 全局减速）
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  const tMove = animT(timeMs, 3.6)
  const tBreath = animT(timeMs, 2.4)
  const breath = 0.5 + 0.5 * Math.sin(tBreath)
  const floor = 0.4 + breath * 0.12
  const peak = 0.9 + breath * 0.08
  ctx.fillStyle = `rgba(0,0,0,${floor})`
  ctx.fillRect(0, 0, w, h)
  const cx = ((Math.sin(tMove) * 0.5 + 0.5) * 0.55 + 0.22) * w
  const rw = w * (0.36 + breath * 0.08)
  const g = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(0.32, `rgba(0,0,0,${(peak - floor) * 0.55})`)
  g.addColorStop(0.5, `rgba(0,0,0,${peak - floor})`)
  g.addColorStop(0.68, `rgba(0,0,0,${(peak - floor) * 0.55})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export function drawSoftVoid(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  blurPass(ctx, ctx.canvas, w, h, 2)
  ctx.fillStyle = 'rgba(0,0,0,0.30)'
  ctx.fillRect(0, 0, w, h)
  const pulse = 0.98 + Math.sin(animT(timeMs, 0.2)) * 0.02
  const cx = w * 0.5
  const cy = h * 0.5
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(w * 0.65, h) * pulse)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export function drawVeil(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  blurPass(ctx, ctx.canvas, w, h, 2)
  const a = 0.48 + Math.sin(animT(timeMs, 0.2)) * 0.06
  ctx.fillStyle = `rgba(0,0,0,${a})`
  ctx.fillRect(0, 0, w, h)
}

export function drawSmoke(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  blurPass(ctx, ctx.canvas, w, h, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, 0, w, h)
  const t = animT(timeMs, 0.24)
  for (let i = 0; i < 3; i++) {
    const x = ((i / 3 + Math.sin(t + i) * 0.08 + 1) % 1) * w
    const y = h * (0.4 + 0.2 * Math.sin(t * 0.5 + i))
    const r = h * (0.65 + 0.2 * Math.sin(t + i))
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, 'rgba(0,0,0,0.45)')
    g.addColorStop(0.55, 'rgba(0,0,0,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
}

export function drawPrism(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  const shift = 2.5 + Math.sin(animT(timeMs, 0.6)) * 1.2
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = 0.55
  ctx.drawImage(src, -shift, 0, w, h)
  ctx.fillStyle = 'rgba(255,40,60,0.25)'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(src, shift, 0, w, h)
  ctx.fillStyle = 'rgba(40,120,255,0.25)'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  blurPass(ctx, ctx.canvas, w, h, 4)
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 0, w, h)
}

export function drawRipple(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  const amp = 2.5 + Math.sin(animT(timeMs, 0.5)) * 0.8
  const slices = Math.max(8, Math.floor(h / 3))
  for (let i = 0; i < slices; i++) {
    const sy = (i / slices) * h
    const sh = h / slices + 1
    const dx = Math.sin(animT(timeMs, 0.55) + i * 0.55) * amp
    ctx.drawImage(src, 0, sy, w, sh, dx, sy, w, sh)
  }
  blurPass(ctx, ctx.canvas, w, h, 3)
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.fillRect(0, 0, w, h)
}

export function drawGlitch(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  ctx.clearRect(0, 0, w, h)
  drawImageContainFill(ctx, src, w, h)
  const slices = 12
  for (let i = 0; i < slices; i++) {
    const sh = h / slices
    const sy = i * sh
    const dx = Math.sin(animT(timeMs, 0.7) + i * 1.9) * (6 + (i % 3) * 3)
    ctx.drawImage(src, 0, sy, w, sh, dx, sy, w, sh)
  }
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, 0, w, h)
}

/**
 * 倒过来 — flip the live strip 180°.
 * Friction = inverted glyphs (hard to read), NOT fog. Keep sharp at score ~7.
 */
export function drawFlip(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(Math.PI)
  ctx.translate(-w / 2, -h / 2)
  drawImageContainFill(ctx, src, w, h)
  ctx.restore()
  // almost no plate — friction is the inversion itself
  ctx.fillStyle = 'rgba(0,0,0,0.04)'
  ctx.fillRect(0, 0, w, h)
}

/**
 * 缓慢模糊 — regional soft/clear field that drifts (not strip-wide soup).
 */
export function drawSlowBlur(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  mildRegionalFrost(ctx, src, w, h, timeMs, 6)
  ctx.fillStyle = `rgba(12,14,18,${0.05 + field01(timeMs) * 0.06})`
  ctx.fillRect(0, 0, w, h)
}

/**
 * Optical gravity lens — warp force field, NOT a horror black void.
 * Keeps color; soft center compression; light photon ring; minimal gloom.
 */
export function drawBlackhole(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  timeMs = 0,
) {
  const sw = Math.min(Math.max(160, w), 400)
  const sh = Math.min(Math.max(48, h), 110)
  const tmp = ensureTmp(sw, sh)
  const tctx = tmp.getContext('2d', { willReadFrequently: true })!
  drawImageContainFill(tctx, src, sw, sh)
  // pre-blur slightly so warp feels optical, not harsh
  blurPass(tctx, tmp, sw, sh, 3)
  const srcData = tctx.getImageData(0, 0, sw, sh)
  const out = tctx.createImageData(sw, sh)

  const cx = sw * 0.5
  const cy = sh * 0.5
  // smaller core — less “死黑一团”
  const rs = Math.min(sw, sh) * 0.1
  const mass = rs * rs * (1.1 + Math.sin(animT(timeMs, 0.35)) * 0.04)
  const soft = rs * 0.25
  const maxR = Math.hypot(cx, cy) || 1
  const spin = 0.28 + Math.sin(animT(timeMs, 0.3)) * 0.03

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const dx = x - cx
      const dy = y - cy
      const r = Math.hypot(dx, dy) + 1e-4
      const di = (y * sw + x) * 4

      const ux = dx / r
      const uy = dy / r
      const invR2 = 1 / (r * r + soft * soft)
      const defl = mass * invR2
      // gentle pinch toward center (readable warp, not swallowed)
      let rSample = r + defl * r * 0.55
      rSample += (mass * 0.2) / (r + soft)

      const ang = spin * (rs / (r + soft))
      const cosA = Math.cos(ang)
      const sinA = Math.sin(ang)
      const rx = ux * cosA - uy * sinA
      const ry = ux * sinA + uy * cosA

      let sx = Math.round(cx + rx * rSample)
      let sy = Math.round(cy + ry * rSample)
      sx = Math.max(0, Math.min(sw - 1, sx))
      sy = Math.max(0, Math.min(sh - 1, sy))
      const si = (sy * sw + sx) * 4

      // keep most luminance — only soft dim near core (not pure black)
      const nr = Math.min(1, r / (maxR * 0.9))
      const dark = 0.55 + 0.45 * Math.pow(nr, 0.7)

      // soft bright ring (optical, not lava)
      const ringDist = Math.abs(r - rs * 2.1)
      let ring = 0
      if (ringDist < rs * 0.55) {
        ring = Math.pow(1 - ringDist / (rs * 0.55), 1.2) * 0.22
      }

      // soft core: blend toward mid-grey blur, never pure black
      const core = r < rs * 1.15 ? 1 - r / (rs * 1.15) : 0
      let rC = srcData.data[si] * dark * (1 - core * 0.35) + core * 40
      let gC = srcData.data[si + 1] * dark * (1 - core * 0.35) + core * 42
      let bC = srcData.data[si + 2] * dark * (1 - core * 0.35) + core * 48
      rC += ring * 180
      gC += ring * 190
      bC += ring * 200

      out.data[di] = Math.min(255, rC)
      out.data[di + 1] = Math.min(255, gC)
      out.data[di + 2] = Math.min(255, bC)
      out.data[di + 3] = 255
    }
  }

  tctx.putImageData(out, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(tmp, 0, 0, w, h)
  // light outer frost so text still hard to read, without gothic vignette
  ctx.fillStyle = 'rgba(20, 24, 32, 0.12)'
  ctx.fillRect(0, 0, w, h)
}

export function normalizeEffect(id: string): CoverEffect {
  const e = String(id || 'liquid_glass')
  if (e === 'blur' || e === 'gaussian') return 'glass'
  if (e === 'apple' || e === 'big_glass') return 'liquid_glass'
  if (e === 'partial' || e === 'breath' || e === 'wave') return 'shade_wave'
  if (e === 'void' || e === 'feather') return 'soft_void'
  if (e === 'upside_down' || e === 'invert' || e === 'dao') return 'flip'
  if (e === 'slowblur' || e === 'fade_blur') return 'slow_blur'
  return e as CoverEffect
}

export function drawCoverEffect(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource | null,
  w: number,
  h: number,
  effect: CoverEffect | string,
  timeMs = 0,
  friction = TARGET_FRICTION,
) {
  const eff = normalizeEffect(String(effect))
  if (eff === 'solid' || !src) {
    drawSolid(ctx, w, h)
    return
  }
  switch (eff) {
    case 'mosaic':
      drawMosaic(ctx, src, w, h, undefined, friction)
      break
    case 'liquid_glass':
      drawLiquidGlass(ctx, src, w, h, timeMs)
      break
    case 'frost':
      drawFrost(ctx, src, w, h, timeMs)
      break
    case 'glass':
      drawGlass(ctx, src, w, h, timeMs)
      break
    case 'shade_wave':
      drawShadeWave(ctx, src, w, h, timeMs)
      break
    case 'soft_void':
      drawSoftVoid(ctx, src, w, h, timeMs)
      break
    case 'veil':
      drawVeil(ctx, src, w, h, timeMs)
      break
    case 'smoke':
      drawSmoke(ctx, src, w, h, timeMs)
      break
    case 'prism':
      drawPrism(ctx, src, w, h, timeMs)
      break
    case 'ripple':
      drawRipple(ctx, src, w, h, timeMs)
      break
    case 'glitch':
      drawGlitch(ctx, src, w, h, timeMs)
      break
    case 'blackhole':
      drawBlackhole(ctx, src, w, h, timeMs)
      break
    case 'flip':
      drawFlip(ctx, src, w, h)
      break
    case 'slow_blur':
      drawSlowBlur(ctx, src, w, h, timeMs)
      break
    default:
      drawLiquidGlass(ctx, src, w, h, timeMs)
  }
}

export function effectNeedsAnimation(effect: CoverEffect | string): boolean {
  const e = normalizeEffect(String(effect))
  // All blur materials breathe — must keep painting even when video freezes
  return (
    e === 'liquid_glass' ||
    e === 'frost' ||
    e === 'glass' ||
    e === 'blur' ||
    e === 'shade_wave' ||
    e === 'soft_void' ||
    e === 'veil' ||
    e === 'smoke' ||
    e === 'prism' ||
    e === 'ripple' ||
    e === 'glitch' ||
    e === 'blackhole' ||
    e === 'slow_blur'
  )
}
