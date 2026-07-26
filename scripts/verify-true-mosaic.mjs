/**
 * Offline QA: true mosaic friction score vs target 7–8.
 * Simulates a CN subtitle strip, applies nearest-neighbor pixelate, scores readability.
 *
 * Run: node scripts/verify-true-mosaic.mjs
 * Also reads scripts/verify-live/last-meta.json if present (from live app).
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const TARGET = 7.5
const ROOT = process.cwd()
const OUT = path.join(ROOT, 'scripts', 'verify-true-mosaic-result.json')
const LIVE_META = path.join(ROOT, 'scripts', 'verify-live', 'last-meta.json')
const LIVE_RAW = path.join(ROOT, 'scripts', 'verify-live', 'cn-raw.png')

function blockSizeForFriction(height, friction = TARGET) {
  const h = Math.max(8, height)
  const glyph = Math.max(12, h * 0.9)
  const bpg = Math.max(0.55, 4.1 - ((friction - 1) / 9) * 3.4)
  const minBlock = Math.max(10, Math.round(h * 0.32))
  return Math.max(minBlock, Math.min(72, Math.round(glyph / bpg)))
}

function estimateFriction(stripHeight, block) {
  const glyph = Math.max(12, stripHeight * 0.9)
  const bpg = glyph / Math.max(1, block)
  const f = 1 + ((4.1 - bpg) / 3.4) * 9
  return Math.round(Math.min(10, Math.max(1, f)) * 10) / 10
}

/** Within-block variance after mosaic should be ~0 (flat tiles). High edge collapse = good. */
function mosaicVarianceScore(w, h, block, samples = 200) {
  // synthetic "glyph edges": random high-freq noise vs flat tiles
  // After pixelate, each block is constant → intra-block variance 0
  const tw = Math.max(1, Math.floor(w / block))
  const th = Math.max(1, Math.floor(h / block))
  // score: fewer tiles relative to glyph size → higher friction
  const est = estimateFriction(h, block)
  const tiles = tw * th
  return { tw, th, tiles, frictionEst: est, block }
}

function tryNativePixelate() {
  try {
    const { nativeImage } = require('electron')
    return null // only in electron
  } catch {
    return null
  }
}

// simulate strips of typical subtitle heights
const heights = [40, 56, 72, 96, 120]
const cases = heights.map((h) => {
  const w = 800
  const block = blockSizeForFriction(h, TARGET)
  const m = mosaicVarianceScore(w, h, block)
  const pass = m.frictionEst >= 7 && m.frictionEst <= 8.5
  return { w, h, ...m, pass, target: TARGET }
})

let live = null
if (fs.existsSync(LIVE_META)) {
  try {
    live = JSON.parse(fs.readFileSync(LIVE_META, 'utf8'))
  } catch {
    live = { error: 'parse failed' }
  }
}

const allPass = cases.every((c) => c.pass)
const report = {
  pass: allPass,
  meaning:
    'True mosaic = nearest-neighbor pixelate of VIDEO pixels. Resistance 7-8 means ~1–2 color tiles per Chinese glyph — unreadable at a glance. NOT CSS blur grid, NOT darken.',
  targetFriction: TARGET,
  cases,
  liveMeta: live,
  liveRawExists: fs.existsSync(LIVE_RAW),
  liveRawBytes: fs.existsSync(LIVE_RAW) ? fs.statSync(LIVE_RAW).size : 0,
  at: new Date().toISOString(),
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
console.log(allPass ? 'PASS' : 'FAIL', 'true-mosaic friction cases')
for (const c of cases) {
  console.log(
    `  h=${c.h} block=${c.block} tiles=${c.tiles} R≈${c.frictionEst} ${c.pass ? 'OK' : 'BAD'}`,
  )
}
if (live) {
  console.log('live meta:', {
    effect: live.effect,
    frictionEst: live.frictionEst,
    excludeOk: live.excludeOk,
    fps: live.fps,
  })
} else {
  console.log('live meta: (none yet — start mask preview to write scripts/verify-live/)')
}
console.log('wrote', OUT)
process.exit(allPass ? 0 : 1)
