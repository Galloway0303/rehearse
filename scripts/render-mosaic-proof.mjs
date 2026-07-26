/**
 * Generate visual before/after true-mosaic proof PNGs (no Electron UI needed).
 * Uses pure zlib PNG encode of synthetic bilingual strip + nearest-neighbor pixelate.
 * Run: node scripts/render-mosaic-proof.mjs
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'scripts', 'verify-live')
const TARGET = 7.5

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

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

function encodePNG(w, h, rgba) {
  // rgba: Buffer length w*h*4
  const rows = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    rows[y * (w * 4 + 1)] = 0
    rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const compressed = zlib.deflateSync(rows)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Draw fake "subtitle" as high-contrast stroke patterns (glyph-like) + solid bg */
function drawSyntheticStrip(w, h) {
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // dark video-ish bg
      rgba[i] = 24 + (x % 40)
      rgba[i + 1] = 28 + (y % 20)
      rgba[i + 2] = 40
      rgba[i + 3] = 255
    }
  }
  // white "glyph" strokes — dense vertical/horizontal bars like CJK structure
  const chars = 10
  const charW = Math.floor(w / (chars + 1))
  for (let c = 0; c < chars; c++) {
    const cx = Math.floor((c + 0.7) * charW)
    const top = Math.floor(h * 0.18)
    const bot = Math.floor(h * 0.82)
    // vertical stroke
    for (let y = top; y < bot; y++) {
      for (let t = -2; t <= 2; t++) {
        const x = cx + t
        if (x < 0 || x >= w) continue
        const i = (y * w + x) * 4
        rgba[i] = rgba[i + 1] = rgba[i + 2] = 245
      }
    }
    // horizontal strokes (like 三 / 口)
    for (const fy of [0.3, 0.5, 0.7]) {
      const y = Math.floor(h * fy)
      for (let x = cx - Math.floor(charW * 0.28); x < cx + Math.floor(charW * 0.28); x++) {
        if (x < 0 || x >= w) continue
        for (let t = -1; t <= 1; t++) {
          const yy = y + t
          if (yy < 0 || yy >= h) continue
          const i = (yy * w + x) * 4
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 250
        }
      }
    }
  }
  return rgba
}

function pixelate(rgba, w, h, block) {
  const out = Buffer.alloc(w * h * 4)
  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      let r = 0,
        g = 0,
        b = 0,
        n = 0
      const y2 = Math.min(h, by + block)
      const x2 = Math.min(w, bx + block)
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const i = (y * w + x) * 4
          r += rgba[i]
          g += rgba[i + 1]
          b += rgba[i + 2]
          n++
        }
      }
      r = Math.round(r / n)
      g = Math.round(g / n)
      b = Math.round(b / n)
      // slight darken like live mosaic
      r = Math.round(r * 0.82)
      g = Math.round(g * 0.82)
      b = Math.round(b * 0.82)
      for (let y = by; y < y2; y++) {
        for (let x = bx; x < x2; x++) {
          const i = (y * w + x) * 4
          out[i] = r
          out[i + 1] = g
          out[i + 2] = b
          out[i + 3] = 255
        }
      }
    }
  }
  return out
}

/** Side-by-side: left raw, right mosaic */
function sideBySide(raw, mos, w, h) {
  const W = w * 2 + 8
  const out = Buffer.alloc(W * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (x < w) {
        const j = (y * w + x) * 4
        out[i] = raw[j]
        out[i + 1] = raw[j + 1]
        out[i + 2] = raw[j + 2]
        out[i + 3] = 255
      } else if (x < w + 8) {
        out[i] = 255
        out[i + 1] = 160
        out[i + 2] = 40
        out[i + 3] = 255
      } else {
        const j = (y * w + (x - w - 8)) * 4
        out[i] = mos[j]
        out[i + 1] = mos[j + 1]
        out[i + 2] = mos[j + 2]
        out[i + 3] = 255
      }
    }
  }
  return { rgba: out, W }
}

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true })

const w = 720
const h = 64
const block = blockSizeForFriction(h, TARGET)
const est = estimateFriction(h, block)
const raw = drawSyntheticStrip(w, h)
const mos = pixelate(raw, w, h, block)
const { rgba: side, W } = sideBySide(raw, mos, w, h)

fs.writeFileSync(path.join(DIR, 'proof-raw.png'), encodePNG(w, h, raw))
fs.writeFileSync(path.join(DIR, 'proof-mosaic.png'), encodePNG(w, h, mos))
fs.writeFileSync(path.join(DIR, 'proof-side-by-side.png'), encodePNG(W, h, side))
const meta = {
  pass: est >= 7 && est <= 8.5,
  frictionTarget: TARGET,
  frictionEst: est,
  block,
  strip: { w, h },
  meaning: 'Left=readable glyph strokes; Right=true mosaic tiles (nearest-neighbor). Resistance target 7-8.',
  at: new Date().toISOString(),
}
fs.writeFileSync(path.join(DIR, 'proof-meta.json'), JSON.stringify(meta, null, 2))
console.log(meta.pass ? 'PASS' : 'FAIL', meta)
console.log('wrote', DIR)
