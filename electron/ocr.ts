import screenshot from 'screenshot-desktop'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import type { ScreenRect } from '../src/shared/types'

let worker: Worker | null = null
let workerLang = ''
let workerPsm: string | null = null
let workerReady: Promise<Worker> | null = null

/** One full-screen grab shared by all bands in a tick (~200–400ms saved vs double grab). */
let screenCache: { buf: Buffer; at: number } | null = null
const SCREEN_CACHE_MS = 90

async function getWorker(lang: string, psm: PSM = PSM.SINGLE_BLOCK): Promise<Worker> {
  const psmKey = String(psm)
  if (worker && workerLang === lang && workerPsm === psmKey) return worker
  if (workerReady && workerLang === lang && workerPsm === psmKey) return workerReady

  if (worker) {
    try {
      await worker.terminate()
    } catch {
      /* ignore */
    }
    worker = null
  }

  workerReady = (async () => {
    const w = await createWorker(lang, 1, {
      logger: () => undefined,
    })
    const params: Record<string, string> = {
      tessedit_pageseg_mode: psmKey,
      // critical: without space in whitelist, words glue together
      preserve_interword_spaces: '1',
      user_defined_dpi: '180',
    }
    // eng-only: whitelist cuts CJK noise — MUST include space
    if (lang === 'eng') {
      params.tessedit_char_whitelist =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '’\".,?!-—:;"
    }
    await w.setParameters(params)
    worker = w
    workerLang = lang
    workerPsm = psmKey
    return w
  })()

  try {
    return await workerReady
  } finally {
    workerReady = null
  }
}

/** Warm OCR worker at app start so first subtitle isn't slow. */
export async function warmOcr(lang: 'eng' | 'chi_sim' | 'eng+chi_sim' = 'eng'): Promise<void> {
  try {
    const tessLang = lang === 'eng+chi_sim' ? 'eng+chi_sim' : lang
    const psm = lang === 'eng' ? PSM.SINGLE_LINE : PSM.AUTO
    await getWorker(tessLang, psm)
  } catch (e) {
    console.warn('[ocr] warm failed', e)
  }
}

export function invalidateScreenCache() {
  screenCache = null
}

export async function grabScreen(force = false): Promise<Buffer> {
  const now = Date.now()
  if (!force && screenCache && now - screenCache.at < SCREEN_CACHE_MS) return screenCache.buf
  const buf = await screenshot({ format: 'png' })
  screenCache = { buf, at: now }
  return buf
}

/**
 * Capture screen region in **physical pixels**.
 * Pads the crop slightly (esp. right) so end-of-line glyphs aren't clipped.
 */
export async function captureRegion(region: ScreenRect): Promise<Buffer> {
  const img = await grabScreen()
  return cropAndEnhance(img, region, true)
}

/** Crop + enhance from an already-grabbed full screen (no second desktop capture). */
export async function captureRegionFromScreen(screenBuf: Buffer, region: ScreenRect): Promise<Buffer> {
  return cropAndEnhance(screenBuf, region, true)
}

/**
 * Tiny fingerprint of a band — skip Tesseract when the strip hasn't changed.
 * Returns a short hex-ish string from downsampled luminance.
 */
export function regionFingerprint(screenBuf: Buffer, region: ScreenRect): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { nativeImage } = require('electron') as typeof import('electron')
    const image = nativeImage.createFromBuffer(screenBuf)
    const size = image.getSize()
    const x = Math.max(0, Math.min(Math.round(region.x), size.width - 1))
    const y = Math.max(0, Math.min(Math.round(region.y), size.height - 1))
    const width = Math.max(4, Math.min(Math.round(region.width), size.width - x))
    const height = Math.max(4, Math.min(Math.round(region.height), size.height - y))
    const tiny = image.crop({ x, y, width, height }).resize({ width: 48, height: 10, quality: 'good' })
    const bmp = tiny.toBitmap()
    // sample every 4th pixel → short stable hash
    let h1 = 0
    let h2 = 0
    let n = 0
    for (let i = 0; i < bmp.length; i += 16) {
      const yv = Math.round(0.299 * bmp[i + 2] + 0.587 * bmp[i + 1] + 0.114 * bmp[i])
      h1 = (h1 * 33 + yv) >>> 0
      h2 = (h2 + yv * (n + 1)) >>> 0
      n++
    }
    return `${h1.toString(16)}-${h2.toString(16)}-${n}`
  } catch {
    return `${Date.now()}`
  }
}

/**
 * Color crop only — for true mosaic / blackhole.
 */
export async function captureRegionColor(region: ScreenRect): Promise<Buffer> {
  const img = await grabScreen()
  const { nativeImage } = await import('electron')
  const image = nativeImage.createFromBuffer(img)
  const size = image.getSize()
  const x = Math.max(0, Math.min(Math.round(region.x), size.width - 1))
  const y = Math.max(0, Math.min(Math.round(region.y), size.height - 1))
  const width = Math.max(4, Math.min(Math.round(region.width), size.width - x))
  const height = Math.max(4, Math.min(Math.round(region.height), size.height - y))
  return image.crop({ x, y, width, height }).toPNG()
}

export async function captureRegionTop(region: ScreenRect, topRatio: number): Promise<Buffer> {
  const r = Math.min(0.95, Math.max(0.08, topRatio))
  const enRegion: ScreenRect = {
    x: region.x,
    y: region.y,
    width: region.width,
    height: Math.max(8, Math.round(region.height * r)),
  }
  return captureRegion(enRegion)
}

/** Expand OCR band so Tesseract sees full glyphs (esp. last word). */
export function padRegionForOcr(region: ScreenRect, screenW: number, screenH: number): ScreenRect {
  const padL = 8
  const padR = 18 // end-of-line safety
  const padY = 5
  const x = Math.max(0, region.x - padL)
  const y = Math.max(0, region.y - padY)
  const right = Math.min(screenW, region.x + region.width + padR)
  const bottom = Math.min(screenH, region.y + region.height + padY)
  return {
    x,
    y,
    width: Math.max(8, right - x),
    height: Math.max(8, bottom - y),
  }
}

async function cropAndEnhance(buf: Buffer, region: ScreenRect, forOcr: boolean): Promise<Buffer> {
  const { nativeImage } = await import('electron')
  const image = nativeImage.createFromBuffer(buf)
  const size = image.getSize()

  let x = Math.max(0, Math.min(Math.round(region.x), size.width - 1))
  let y = Math.max(0, Math.min(Math.round(region.y), size.height - 1))
  let width = Math.max(8, Math.min(Math.round(region.width), size.width - x))
  let height = Math.max(8, Math.min(Math.round(region.height), size.height - y))

  if (forOcr) {
    const padded = padRegionForOcr({ x, y, width, height }, size.width, size.height)
    x = padded.x
    y = padded.y
    width = padded.width
    height = padded.height
  }

  let cropped = image.crop({ x, y, width, height })

  // Target ~48–56px glyph height — enough for accuracy, not 3× bloat
  const targetH = 52
  const scale = Math.min(3.2, Math.max(1.5, targetH / Math.max(8, height)))
  const tw = Math.round(width * scale)
  const th = Math.round(height * scale)
  // 'good' is much faster than 'best' and fine for OCR
  cropped = cropped.resize({ width: tw, height: th, quality: 'good' })

  // Adaptive soft contrast: keep inter-word gaps, auto invert dark-on-light
  try {
    const bmp = cropped.toBitmap()
    const out = Buffer.from(bmp)
    let sum = 0
    let n = 0
    // sample every other pixel for mean (faster)
    for (let i = 0; i < out.length; i += 8) {
      sum += 0.299 * out[i + 2] + 0.587 * out[i + 1] + 0.114 * out[i]
      n++
    }
    const mean = sum / Math.max(1, n)

    // Subtitles are usually light-on-dark. If strip is bright overall (dark text
    // on light bar), invert so Tesseract sees dark glyphs on light bg… wait,
    // Tesseract handles both; we stretch either way into a readable range.
    // Prefer: text ends up dark-ish mid, background near white OR black with gap.
    const lightText = mean < 115 // dark video bg + bright letters

    // percentiles via coarse histogram
    const hist = new Uint32Array(256)
    for (let i = 0; i < out.length; i += 8) {
      const yv = Math.round(0.299 * out[i + 2] + 0.587 * out[i + 1] + 0.114 * out[i])
      hist[Math.max(0, Math.min(255, yv))]++
    }
    const total = Math.max(1, Array.from(hist).reduce((a, b) => a + b, 0))
    let lo = 20
    let hi = 235
    let acc = 0
    for (let i = 0; i < 256; i++) {
      acc += hist[i]
      if (acc >= total * 0.08) {
        lo = i
        break
      }
    }
    acc = 0
    for (let i = 255; i >= 0; i--) {
      acc += hist[i]
      if (acc >= total * 0.08) {
        hi = i
        break
      }
    }
    if (hi - lo < 28) {
      lo = Math.max(0, mean - 40)
      hi = Math.min(255, mean + 40)
    }

    const span = Math.max(24, hi - lo)
    for (let i = 0; i < out.length; i += 4) {
      let yv = 0.299 * out[i + 2] + 0.587 * out[i + 1] + 0.114 * out[i]
      yv = ((yv - lo) / span) * 255
      yv = Math.max(0, Math.min(255, yv))
      // light text on dark: keep as-is (bright letters). Dark text: leave as-is too.
      // mild gamma so mid grays (word gaps) survive
      if (lightText) {
        // boost bright letters slightly without crushing gaps to pure black
        yv = Math.pow(yv / 255, 0.85) * 255
      } else {
        yv = Math.pow(yv / 255, 1.05) * 255
      }
      const v = Math.round(yv)
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
    cropped = nativeImage.createFromBitmap(out, { width: tw, height: th })
  } catch {
    /* keep resized color crop */
  }

  return cropped.toPNG()
}

function cleanOcrText(text: string): string {
  let t = text
    .replace(/[|]/g, 'I')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u2019/g, "'")
    // common OCR confusions in subtitles
    .replace(/\brn\b/g, 'm')
    .replace(/\bvv\b/gi, 'w')
    .replace(/\b0f\b/g, 'of')
    .replace(/\bcl\b/gi, 'd')
    // frequent short glues from missing spaces
    .replace(/\bifi\b/gi, 'if I')
    .replace(/\bim\b/g, "I'm")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\byoure\b/gi, "you're")
    .replace(/\btheyre\b/gi, "they're")
    .replace(/\bthats\b/gi, "that's")
    .replace(/\bwhats\b/gi, "what's")
    .replace(/\blets\b/gi, "let's")
    // CamelCase leftovers from glued OCR
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // collapse runs of whitespace but keep single spaces
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
  t = reinsertMissingSpaces(t)
  return t
}

/**
 * Split glued English (e.g. "ifisought" → "if i sought").
 * Runs on any letter-run that is NOT itself a known single word.
 */
function reinsertMissingSpaces(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => {
      if (!/^[A-Za-z'’-]+$/.test(part)) return part
      if (part.length < 3) return part
      const lower = part.toLowerCase().replace(/'/g, '')
      // already a real single word → leave alone
      if (SEGMENT_LEXICON.has(lower) && lower.length <= 14) return part
      const segs = segmentGluedEnglish(part)
      return segs.length > 1 ? segs.join(' ') : part
    })
    .join('')
}

/**
 * Common English tokens for sticky-OCR recovery ONLY.
 * Not an exam list — just enough to unglue subtitle blobs.
 */
const SEGMENT_LEXICON = new Set(
  `
a an the and or but if so to of in on at by for with from as into onto over under
i me my we us our you your he him his she her it its they them their
is am are was were be been being do does did done have has had
can could will would shall should may might must
not no yes oh hell yeah okay alright please thank sorry hello
this that these those there here when what who how why which where
one two three four five six seven eight nine ten
get got go goes went gone come came give gave take took make made
know knew think thought want need look see saw say said tell told
let put run ran find found keep kept feel felt leave left call
try tried ask seem become became start started stop stopped
seek sought seeking seeker
about after again against all almost already also always among another
any anyone anything around away back because before being between both
each early enough ever every everyone everything few first
great hard high just large last late little long many more most much
never new next only other own same several since small some something
still such than then those through time too until very well while
without year years day days way ways man men woman women people life
world hand hands head eyes face place home room door house school
work money love right left good bad big small old young true false
really nothing someone everyone sometimes maybe fucking shit damn
gonna wanna gotta kinda sorta yep nope mean means meant like likes liked
even wait talk talking talked listen listening help helped helping
happen happened remember forget forgot believe
should would could might always
tell told telling show showed shown
hear heard hearing feel felt feeling
bring brought bring brought
catch caught teach taught buy bought
fight fought think thought
  `
    .trim()
    .split(/\s+/)
    .filter(Boolean),
)

function segmentGluedEnglish(blob: string): string[] {
  const s = blob
  const lower = s.toLowerCase()
  const n = lower.length
  const dp: (string[] | null)[] = Array(n + 1).fill(null)
  dp[0] = []
  for (let i = 0; i < n; i++) {
    if (!dp[i]) continue
    for (let len = Math.min(14, n - i); len >= 1; len--) {
      const piece = lower.slice(i, i + len)
      if (!SEGMENT_LEXICON.has(piece)) continue
      const next = dp[i]!.concat([s.slice(i, i + len)])
      if (!dp[i + len] || next.length < dp[i + len]!.length) {
        dp[i + len] = next
      }
    }
  }
  if (dp[n] && dp[n]!.length > 1) return dp[n]!
  // second pass: allow unknown chunks of 3–10 between lexicon words
  const dp2: (string[] | null)[] = Array(n + 1).fill(null)
  dp2[0] = []
  for (let i = 0; i < n; i++) {
    if (!dp2[i]) continue
    for (let len = Math.min(14, n - i); len >= 1; len--) {
      const piece = lower.slice(i, i + len)
      const inLex = SEGMENT_LEXICON.has(piece)
      const unknownOk = !inLex && len >= 3 && len <= 10 && hasVowel(piece)
      if (!inLex && !unknownOk) continue
      const next = dp2[i]!.concat([s.slice(i, i + len)])
      if (!dp2[i + len] || (inLex && next.length <= (dp2[i + len]?.length ?? 99))) {
        dp2[i + len] = next
      }
    }
  }
  if (dp2[n] && dp2[n]!.length > 1) return dp2[n]!
  return [blob]
}

function hasVowel(w: string): boolean {
  return /[aeiouy]/.test(w)
}

/** Keep dialogue-like lines; drop pure noise */
function filterNoise(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      if (l.length < 2) return false
      const letters = (l.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length
      return letters / l.length >= 0.35
    })
  return lines.join('\n')
}

export async function ocrImage(
  png: Buffer,
  lang: 'eng' | 'chi_sim' | 'eng+chi_sim',
): Promise<string> {
  const tessLang = lang === 'eng+chi_sim' ? 'eng+chi_sim' : lang
  // SINGLE_LINE preserves inter-word spaces better on subtitle strips
  const psm = lang === 'eng' ? PSM.SINGLE_LINE : PSM.AUTO
  const w = await getWorker(tessLang === 'eng+chi_sim' ? 'eng+chi_sim' : tessLang, psm)
  const { data } = await w.recognize(png)
  return cleanOcrText(filterNoise(data.text || ''))
}

export function splitBilingual(raw: string): { en: string; zh: string } {
  if (!raw) return { en: '', zh: '' }
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length >= 2) {
    const scored = lines.map((l) => ({
      l,
      zh: (l.match(/[\u4e00-\u9fff]/g) || []).length,
      en: (l.match(/[A-Za-z]/g) || []).length,
    }))
    const zhLine = [...scored].sort((a, b) => b.zh - a.zh)[0]
    const enLine = [...scored].sort((a, b) => b.en - a.en)[0]
    if (zhLine.zh > 0 && enLine.en > 0 && zhLine.l !== enLine.l) {
      return { en: enLine.l, zh: zhLine.l }
    }
  }

  const cjk = raw.match(/[\u4e00-\u9fff，。！？、；：""''（）]+/g)
  const latin = raw
    .replace(/[\u4e00-\u9fff，。！？、；：""''（）]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cjk && cjk.join('').length > 1 && latin.length > 2) {
    return { en: latin, zh: cjk.join('') }
  }

  const zhChars = (raw.match(/[\u4e00-\u9fff]/g) || []).length
  const enChars = (raw.match(/[A-Za-z]/g) || []).length
  if (zhChars > enChars * 0.6 && zhChars > 2) {
    return { en: '', zh: raw }
  }
  return { en: raw, zh: '' }
}

/**
 * Split one glued token (e.g. "whatthehell" → ["what","the","hell"]).
 * Used by pet chip extraction when OCR still sticks words.
 */
export function unglueToken(token: string): string[] {
  const t = token.replace(/^['’-]+|['’-]+$/g, '')
  if (t.length < 8) return [token]
  if (!/^[A-Za-z'’-]+$/.test(t)) return [token]
  const camel = t.replace(/([a-z])([A-Z])/g, '$1 $2')
  if (camel.includes(' ')) {
    return camel.split(/\s+/).filter(Boolean)
  }
  const segs = segmentGluedEnglish(t)
  return segs.length > 1 ? segs : [token]
}

export async function disposeOcr() {
  if (worker) {
    await worker.terminate()
    worker = null
    workerLang = ''
    workerPsm = null
  }
  screenCache = null
}
