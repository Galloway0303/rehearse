import screenshot from 'screenshot-desktop'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import type { ScreenRect } from '../src/shared/types'

let worker: Worker | null = null
let workerLang = ''

async function getWorker(lang: string): Promise<Worker> {
  if (worker && workerLang === lang) return worker
  if (worker) {
    await worker.terminate()
    worker = null
  }
  worker = await createWorker(lang, 1, {
    // quieter
    logger: () => undefined,
  })
  // Subtitle strip: prefer single line; falls back okay for 2-line dual subs
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  })
  workerLang = lang
  return worker
}

/**
 * Capture screen region in **physical pixels**.
 * `region` must already be scaled (DIP × scaleFactor) if coming from Electron UI.
 * Includes OCR contrast pass (B/W stretch).
 */
export async function captureRegion(region: ScreenRect): Promise<Buffer> {
  const img = await screenshot({ format: 'png' })
  return cropAndEnhance(img, region)
}

/**
 * Color crop only — for true mosaic / blackhole (AE pixelate needs real video colors).
 * No OCR contrast. Mask windows must be WDA_EXCLUDEFROMCAPTURE so this sees video, not cover.
 */
export async function captureRegionColor(region: ScreenRect): Promise<Buffer> {
  const img = await screenshot({ format: 'png' })
  const { nativeImage } = await import('electron')
  const image = nativeImage.createFromBuffer(img)
  const size = image.getSize()
  const x = Math.max(0, Math.min(Math.round(region.x), size.width - 1))
  const y = Math.max(0, Math.min(Math.round(region.y), size.height - 1))
  const width = Math.max(4, Math.min(Math.round(region.width), size.width - x))
  const height = Math.max(4, Math.min(Math.round(region.height), size.height - y))
  return image.crop({ x, y, width, height }).toPNG()
}

/** Capture only the English strip (top portion) — mask can stay on Chinese, zero flash. */
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

async function cropAndEnhance(buf: Buffer, region: ScreenRect): Promise<Buffer> {
  const { nativeImage } = await import('electron')
  let image = nativeImage.createFromBuffer(buf)
  const size = image.getSize()

  const x = Math.max(0, Math.min(Math.round(region.x), size.width - 1))
  const y = Math.max(0, Math.min(Math.round(region.y), size.height - 1))
  const width = Math.max(8, Math.min(Math.round(region.width), size.width - x))
  const height = Math.max(8, Math.min(Math.round(region.height), size.height - y))

  let cropped = image.crop({ x, y, width, height })

  // modest upscale — big 3× was too heavy / laggy
  const scale = height < 40 ? 2 : height < 90 ? 1.6 : 1.35
  const tw = Math.round(width * scale)
  const th = Math.round(height * scale)
  cropped = cropped.resize({ width: tw, height: th, quality: 'good' })

  // Mild contrast pass via bitmap — boost white-on-dark subtitles
  try {
    const bmp = cropped.toBitmap()
    const out = Buffer.from(bmp)
    for (let i = 0; i < out.length; i += 4) {
      // BGRA
      const b = out[i]
      const g = out[i + 1]
      const r = out[i + 2]
      // luminance
      let yv = 0.299 * r + 0.587 * g + 0.114 * b
      // stretch contrast
      yv = (yv - 40) * 1.45
      yv = Math.max(0, Math.min(255, yv))
      // soft threshold toward pure B/W for cleaner OCR
      const v = yv > 140 ? 255 : yv < 70 ? 0 : Math.round(yv)
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
  return text
    .replace(/[|]/g, 'I')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
}

/** Drop garbage lines that look like noise, not dialogue */
function filterNoise(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => {
      if (l.length < 2) return false
      const alnum = (l.match(/[A-Za-z0-9\u4e00-\u9fff']/g) || []).length
      return alnum / l.length >= 0.45
    })
  return lines.join('\n')
}

export async function ocrImage(
  png: Buffer,
  lang: 'eng' | 'chi_sim' | 'eng+chi_sim',
): Promise<string> {
  const tessLang = lang === 'eng+chi_sim' ? 'eng+chi_sim' : lang
  const w = await getWorker(tessLang)
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

  // Same line mixed: split by CJK runs
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

export async function disposeOcr() {
  if (worker) {
    await worker.terminate()
    worker = null
    workerLang = ''
  }
}
