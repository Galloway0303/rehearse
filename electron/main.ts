import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  Notification,
  shell,
} from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import {
  loadDb,
  updateSettings,
  upsertSession,
  addVocab,
  removeVocab,
  patchVocab,
  clearAll,
  savePractice,
  hasAiCredentials,
  settingsForRenderer,
  mergeSettingsFromRenderer,
} from './store'
import screenshot from 'screenshot-desktop'
import { captureRegion, captureRegionColor, captureRegionTop, ocrImage, splitBilingual, disposeOcr } from './ocr'
import { excludeWindowFromCapture } from './win-affinity'
import {
  testAi,
  translateEnToZh,
  explainWord,
  generateExercises,
  gradeAnswer,
  buildFallbackExercises,
  resolveAiSettings,
  aiSource,
} from './ai'
import type {
  AppSettings,
  FreedomLevel,
  ScreenRect,
  Session,
  SubtitleLine,
  VocabItem,
  Exercise,
  ExerciseResult,
  MaskEffectId,
} from '../src/shared/types'
import { DEMO_LINES } from '../src/shared/demo-script'

const isDev = !app.isPackaged

/** Load git-ignored .env so XAI_API_KEY works without pasting into UI. */
function loadDotEnv() {
  try {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(app.getAppPath(), '.env'),
      path.join(__dirname, '../.env'),
    ]
    for (const p of candidates) {
      if (!fs.existsSync(p)) continue
      const text = fs.readFileSync(p, 'utf-8')
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
        if (!m) continue
        const key = m[1]
        let val = m[2]
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (process.env[key] === undefined) process.env[key] = val
      }
      break
    }
  } catch {
    /* ignore */
  }
}

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let regionWindow: BrowserWindow | null = null
/** Sits ON the real subtitle pixels — masks Chinese, does not invent subtitles */
let maskWindow: BrowserWindow | null = null

let ocrTimer: NodeJS.Timeout | null = null
let ocrRunning = false
let lastOcrText = ''
let demoTimer: NodeJS.Timeout | null = null
let demoIndex = 0
let demoMode = false
let activeSession: Session | null = null
let currentSubtitle: SubtitleLine | null = null
let chineseRevealUntil = 0
let selectModeUntil = 0
let pausedForDictation = false
let translationCache = new Map<string, string>()
/** Pin-region flow: never put a window over the video */
let pinMode: 'idle' | 'await_tl' | 'await_br' = 'idle'
let pinTl: { x: number; y: number } | null = null
let pinCursorTimer: NodeJS.Timeout | null = null
let pinCursorDip: { x: number; y: number } | null = null
/** EN assist HUD — OFF by default (user has real EN subs); on only when needed for word tap */
let wordAssistVisible = false
let petWindow: BrowserWindow | null = null
let lastMaskFrameB64: string | null = null
let maskFrameTimer: NodeJS.Timeout | null = null
let maskFrameBusy = false
let maskExcludeOk = false
let maskFrameFps = 0
let maskFrameCount = 0
let maskFpsWindowStart = Date.now()
let maskVerifyTick = 0
/** Target Chinese reading resistance 1–10 (mosaic block sizing). User wants 7–8. */
const MASK_FRICTION = 7.5
const MASK_FRAME_MS = 120 // target ~8 fps; full-screen shot is the bottleneck

function preloadPath() {
  return path.join(__dirname, 'preload.js')
}

function pageUrl(name: 'index' | 'overlay' | 'region' | 'mask' | 'pet') {
  if (isDev) {
    const base = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
    if (name === 'index') return base
    return `${base}/${name}.html`
  }
  const file = name === 'index' ? 'index.html' : `${name}.html`
  return path.join(__dirname, '../dist', file)
}

/** Scale factor for a physical-pixel point (multi-monitor safe). */
function scaleAtPhysical(px: number, py: number): number {
  for (const d of screen.getAllDisplays()) {
    const s = d.scaleFactor || 1
    const b = d.bounds
    // bounds are DIP; convert display rect to physical
    const left = Math.round(b.x * s)
    const top = Math.round(b.y * s)
    const right = Math.round((b.x + b.width) * s)
    const bottom = Math.round((b.y + b.height) * s)
    if (px >= left && px < right && py >= top && py < bottom) return s
  }
  return screen.getPrimaryDisplay().scaleFactor || 1
}

function physicalToDip(region: ScreenRect): ScreenRect {
  const s = scaleAtPhysical(region.x + region.width / 2, region.y + region.height / 2)
  return {
    x: Math.round(region.x / s),
    y: Math.round(region.y / s),
    width: Math.max(8, Math.round(region.width / s)),
    height: Math.max(6, Math.round(region.height / s)),
  }
}

function currentMaskEffect(): MaskEffectId {
  const db = loadDb()
  // do not swap effect while peeking — clear flag handles visibility
  let e = (db.settings.maskEffect || 'liquid_glass') as string
  // migrate / aliases
  if (e === 'blur' || e === 'gaussian') e = 'glass'
  if (e === 'apple' || e === 'big_glass') e = 'liquid_glass'
  if (e === 'partial' || e === 'breath' || e === 'wave') e = 'shade_wave'
  if (e === 'void' || e === 'feather') e = 'soft_void'
  return e as MaskEffectId
}

/**
 * Cover strip inside free-selected box.
 * Default: Chinese on TOP, English on BOTTOM → cover top half.
 */
function cnStripPhysical(region: ScreenRect): ScreenRect {
  const db = loadDb()
  const side = db.settings.maskCnSide || 'top'
  const ratio = Math.min(0.85, Math.max(0.2, db.settings.maskCoverRatio ?? 0.5))

  if (side === 'full') {
    return { ...region, height: Math.max(6, region.height) }
  }
  const h = Math.max(6, Math.round(region.height * ratio))
  if (side === 'top') {
    // 中文在上
    return { x: region.x, y: region.y, width: region.width, height: h }
  }
  // 中文在下（少见，可选手动）
  return {
    x: region.x,
    y: region.y + region.height - h,
    width: region.width,
    height: h,
  }
}

/** English strip for OCR only (opposite of CN). */
function enStripPhysical(region: ScreenRect): ScreenRect | null {
  const db = loadDb()
  const side = db.settings.maskCnSide || 'top'
  if (side === 'full') return null // no separate EN band
  const ratio = Math.min(0.85, Math.max(0.2, db.settings.maskCoverRatio ?? 0.5))
  const cnH = Math.max(6, Math.round(region.height * ratio))
  if (side === 'top') {
    // EN is bottom
    return {
      x: region.x,
      y: region.y + cnH,
      width: region.width,
      height: Math.max(6, region.height - cnH),
    }
  }
  // CN bottom → EN top
  return {
    x: region.x,
    y: region.y,
    width: region.width,
    height: Math.max(6, region.height - cnH),
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07080c',
    title: 'Rehearse',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (isDev) mainWindow.loadURL(pageUrl('index'))
  else mainWindow.loadFile(pageUrl('index'))

  // Keep learning session alive: hide control panel instead of quitting
  mainWindow.on('close', (e) => {
    if (ocrRunning || demoMode || (maskWindow && !maskWindow.isDestroyed() && maskWindow.isVisible())) {
      e.preventDefault()
      mainWindow?.hide()
      try {
        new Notification({
          title: 'Rehearse',
          body: '控制台已隐藏，遮罩仍在工作。托盘/任务栏再点可打开。',
        }).show()
      } catch {
        /* ignore */
      }
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createOverlayWindow() {
  // Compact English assist HUD only — NOT a full-screen blackout, NOT fake dual subtitles
  overlayWindow = new BrowserWindow({
    width: 720,
    height: 120,
    x: 80,
    y: 40,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.webContents.once('did-finish-load', () => {
    excludeWindowFromCapture(overlayWindow)
  })
  setTimeout(() => excludeWindowFromCapture(overlayWindow), 200)

  if (isDev) overlayWindow.loadURL(pageUrl('overlay'))
  else overlayWindow.loadFile(pageUrl('overlay'))

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

function positionMaskOverRegion(region: ScreenRect) {
  if (!maskWindow || maskWindow.isDestroyed()) return
  // Mask ONLY Chinese strip — EN on real video never covered
  // No padding: pad caused 1–2px misalignment / “字幕错位”
  const cn = cnStripPhysical(region)
  const dip = physicalToDip(cn)
  const next = {
    x: dip.x,
    y: dip.y,
    width: Math.max(8, dip.width),
    height: Math.max(6, dip.height),
  }
  const cur = maskWindow.getBounds()
  // avoid thrashing setBounds every frame if unchanged (prevents jitter / shrink)
  if (
    cur.x === next.x &&
    cur.y === next.y &&
    cur.width === next.width &&
    cur.height === next.height
  ) {
    return
  }
  maskWindow.setBounds(next)
}

function createMaskWindow() {
  if (maskWindow && !maskWindow.isDestroyed()) return
  maskWindow = new BrowserWindow({
    width: 400,
    height: 80,
    x: 100,
    y: 100,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  maskWindow.setIgnoreMouseEvents(false)
  maskWindow.setAlwaysOnTop(true, 'screen-saver')
  maskWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // Critical: mask must NOT appear in screenshots, or capture would thrash opacity (flash).
  maskWindow.webContents.once('did-finish-load', () => {
    maskExcludeOk = excludeWindowFromCapture(maskWindow)
    console.log('[mask] exclude-from-capture:', maskExcludeOk)
  })
  // also try immediately (handle may already exist)
  setTimeout(() => {
    maskExcludeOk = excludeWindowFromCapture(maskWindow) || maskExcludeOk
  }, 200)
  if (isDev) maskWindow.loadURL(pageUrl('mask'))
  else maskWindow.loadFile(pageUrl('mask'))
  maskWindow.on('closed', () => {
    maskWindow = null
    stopMaskFrameLoop()
  })
}

/**
 * Push effect + latest clean video frame to mask renderer.
 * Frame is color PNG of CN strip with mask EXCLUDED from capture → true mosaic, no flash.
 */
function pushMaskUpdate(frameB64?: string | null) {
  if (!maskWindow || maskWindow.isDestroyed()) return
  const clear = Date.now() < chineseRevealUntil
  const effect = currentMaskEffect()
  if (frameB64) lastMaskFrameB64 = frameB64
  maskWindow.webContents.send('mask:update', {
    effect,
    clear,
    frame: clear ? null : lastMaskFrameB64,
    friction: MASK_FRICTION,
    meta: {
      captureOk: Boolean(lastMaskFrameB64),
      excludeOk: maskExcludeOk,
      fps: maskFrameFps,
      frictionTarget: MASK_FRICTION,
    },
  })
}

async function captureCnFrameForMask(): Promise<string | null> {
  const db = loadDb()
  const region = db.settings.region
  if (!region) return null
  // Peek: do not burn CPU while user is reading Chinese
  if (Date.now() < chineseRevealUntil) return null
  try {
    // Keep mask locked to region (no drift / wrong scale)
    positionMaskOverRegion(region)

    // Re-assert exclusion every few frames (HWND can change after show)
    if (!maskExcludeOk && maskWindow && !maskWindow.isDestroyed()) {
      maskExcludeOk = excludeWindowFromCapture(maskWindow)
    }
    const cn = cnStripPhysical(region)
    const png = await captureRegionColor(cn)
    const { nativeImage } = await import('electron')
    let img = nativeImage.createFromBuffer(png)
    const size = img.getSize()
    /**
     * Scale for IPC only — MUST preserve aspect ratio exactly.
     * Cap width, never change height independently (that was “字幕变小/错位”).
     * Prefer matching mask DIP width * scale so 1:1 feel.
     */
    const dip = physicalToDip(cn)
    const targetW = Math.min(1280, Math.max(dip.width, Math.min(size.width, 960)))
    if (size.width > targetW + 8) {
      const nh = Math.max(4, Math.round((size.height * targetW) / size.width))
      img = img.resize({ width: targetW, height: nh, quality: 'better' })
    }
    // Higher JPEG quality — low quality made glyphs look soft/shrunken
    const jpeg = img.toJPEG(90)
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch (e) {
    console.warn('[mask] capture frame failed', e)
    return null
  }
}

/**
 * Capture what the USER sees on the mask window (not desktop BitBlt).
 * WDA_EXCLUDEFROMCAPTURE hides mask from screenshots, so this is the only reliable QA path.
 */
async function captureMaskWindowShot() {
  try {
    if (!maskWindow || maskWindow.isDestroyed() || !maskWindow.isVisible()) return
    const img = await maskWindow.webContents.capturePage()
    if (img.isEmpty()) return
    const dir = path.join(process.cwd(), 'scripts', 'verify-live')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'mask-window.png'), img.toPNG())
  } catch (e) {
    console.warn('[mask] capturePage failed', e)
  }
}

/** Dump raw + (optional) note for agent QA: scripts/verify-live/ */
async function writeMaskVerifyArtifacts(rawB64: string) {
  try {
    const dir = path.join(process.cwd(), 'scripts', 'verify-live')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const rawPath = path.join(dir, 'cn-raw.png')
    const mosaicPath = path.join(dir, 'cn-mosaic.png')
    const sidePath = path.join(dir, 'cn-side-by-side.png')
    const metaPath = path.join(dir, 'last-meta.json')
    const rawBuf = Buffer.from(rawB64, 'base64')
    fs.writeFileSync(rawPath, rawBuf)

    // Apply true mosaic in main process so agent can read the result even when
    // WDA_EXCLUDEFROMCAPTURE hides the mask from desktop screenshots.
    const { nativeImage } = await import('electron')
    const img = nativeImage.createFromBuffer(rawBuf)
    const size = img.getSize()
    const w = size.width
    const h = size.height
    const glyph = Math.max(12, h * 0.9)
    const bpgTarget = 4.1 - ((MASK_FRICTION - 1) / 9) * 3.4
    const minBlock = Math.max(10, Math.round(h * 0.32))
    const block = Math.max(minBlock, Math.min(72, Math.round(glyph / Math.max(0.55, bpgTarget))))
    const tw = Math.max(1, Math.floor(w / block))
    const th = Math.max(1, Math.floor(h / block))
    const tiny = img.resize({ width: tw, height: th, quality: 'better' })
    // nearest upscale = AE mosaic tiles
    let mosaiced = tiny.resize({ width: w, height: h, quality: 'nearest' })
    // slight darken for residual glyph contrast kill
    try {
      const bmp = mosaiced.toBitmap()
      const out = Buffer.from(bmp)
      for (let i = 0; i < out.length; i += 4) {
        out[i] = Math.round(out[i] * 0.82)
        out[i + 1] = Math.round(out[i + 1] * 0.82)
        out[i + 2] = Math.round(out[i + 2] * 0.82)
      }
      mosaiced = nativeImage.createFromBitmap(out, { width: w, height: h })
    } catch {
      /* keep */
    }
    const mosBuf = mosaiced.toPNG()
    fs.writeFileSync(mosaicPath, mosBuf)

    // side-by-side for agent visual QA
    try {
      const gap = 6
      const W = w * 2 + gap
      const canvas = Buffer.alloc(W * h * 4, 0)
      const rawBmp = img.toBitmap()
      const mosBmp = mosaiced.toBitmap()
      // electron bitmap is BGRA
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < W; x++) {
          const di = (y * W + x) * 4
          if (x < w) {
            const si = (y * w + x) * 4
            canvas[di] = rawBmp[si]
            canvas[di + 1] = rawBmp[si + 1]
            canvas[di + 2] = rawBmp[si + 2]
            canvas[di + 3] = 255
          } else if (x < w + gap) {
            canvas[di] = 40
            canvas[di + 1] = 160
            canvas[di + 2] = 255
            canvas[di + 3] = 255
          } else {
            const si = (y * w + (x - w - gap)) * 4
            canvas[di] = mosBmp[si]
            canvas[di + 1] = mosBmp[si + 1]
            canvas[di + 2] = mosBmp[si + 2]
            canvas[di + 3] = 255
          }
        }
      }
      const side = nativeImage.createFromBitmap(canvas, { width: W, height: h })
      fs.writeFileSync(sidePath, side.toPNG())
    } catch (e) {
      console.warn('[mask] side-by-side failed', e)
    }

    const db = loadDb()
    const cn = db.settings.region ? cnStripPhysical(db.settings.region) : null
    const bpg = glyph / Math.max(1, block)
    const frictionEst = Math.round(Math.min(10, Math.max(1, 1 + ((4.1 - bpg) / 3.4) * 9)) * 10) / 10
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          at: new Date().toISOString(),
          effect: currentMaskEffect(),
          frictionTarget: MASK_FRICTION,
          frictionEst,
          block,
          strip: cn,
          excludeOk: maskExcludeOk,
          fps: maskFrameFps,
          rawBytes: rawBuf.length,
          mosaicBytes: mosBuf.length,
          files: {
            raw: 'cn-raw.png',
            mosaic: 'cn-mosaic.png',
            side: 'cn-side-by-side.png',
          },
          note:
            'cn-raw = clean video (mask excluded from capture). cn-mosaic = true nearest-neighbor pixelate same pixels. Target resistance 7–8. NOT dimming / NOT CSS grid.',
        },
        null,
        2,
      ),
    )
  } catch (e) {
    console.warn('[mask] verify write failed', e)
  }
}

/**
 * Realtime frame loop: capture video under CN strip WITHOUT hiding the mask.
 * Requires WDA_EXCLUDEFROMCAPTURE. Never touches opacity for capture.
 */
function startMaskFrameLoop() {
  stopMaskFrameLoop()
  pushMaskUpdate()
  const tick = async () => {
    if (maskFrameBusy) return
    if (!maskWindow || maskWindow.isDestroyed() || !maskWindow.isVisible()) return
    if (Date.now() < chineseRevealUntil) {
      pushMaskUpdate(null)
      return
    }
    maskFrameBusy = true
    try {
      const b64 = await captureCnFrameForMask()
      if (b64) {
        maskFrameCount += 1
        const now = Date.now()
        if (now - maskFpsWindowStart >= 1000) {
          maskFrameFps = maskFrameCount
          maskFrameCount = 0
          maskFpsWindowStart = now
        }
        maskVerifyTick += 1
        // every ~1.5s write QA artifacts (raw PNG + mosaiced + mask window capturePage)
        if (maskVerifyTick % 12 === 1) {
          void (async () => {
            try {
              const db = loadDb()
              if (!db.settings.region) return
              const png = await captureRegionColor(cnStripPhysical(db.settings.region))
              await writeMaskVerifyArtifacts(png.toString('base64'))
              await captureMaskWindowShot()
            } catch (e) {
              console.warn('[mask] verify tick failed', e)
            }
          })()
        }
        pushMaskUpdate(b64)
      } else {
        pushMaskUpdate()
      }
    } finally {
      maskFrameBusy = false
    }
  }
  void tick()
  maskFrameTimer = setInterval(() => {
    void tick()
  }, MASK_FRAME_MS)
}

function stopMaskFrameLoop() {
  if (maskFrameTimer) {
    clearInterval(maskFrameTimer)
    maskFrameTimer = null
  }
  maskFrameBusy = false
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return
  const d = screen.getPrimaryDisplay()
  petWindow = new BrowserWindow({
    width: 100,
    height: 110,
    x: d.bounds.x + d.bounds.width - 120,
    y: d.bounds.y + d.bounds.height - 160,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  petWindow.setAlwaysOnTop(true, 'screen-saver')
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  petWindow.webContents.once('did-finish-load', () => {
    excludeWindowFromCapture(petWindow)
  })
  setTimeout(() => excludeWindowFromCapture(petWindow), 200)
  if (isDev) petWindow.loadURL(pageUrl('pet'))
  else petWindow.loadFile(pageUrl('pet'))
  petWindow.on('closed', () => {
    petWindow = null
  })
}

function pushPetState() {
  if (!petWindow || petWindow.isDestroyed()) return
  const db = loadDb()
  const words = (currentSubtitle?.en || '')
    .split(/[^A-Za-z']+/)
    .filter((w) => w.length > 2)
    .slice(0, 10)
  petWindow.webContents.send('pet:state', {
    locale: db.settings.locale,
    recentWords: words,
    contextEn: currentSubtitle?.en || '',
  })
}

function showPet() {
  createPetWindow()
  petWindow?.showInactive()
  pushPetState()
}

function hidePet() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide()
}

function setPetOpen(open: boolean) {
  if (!petWindow || petWindow.isDestroyed()) createPetWindow()
  if (!petWindow) return
  const d = screen.getPrimaryDisplay()
  if (open) {
    petWindow.setBounds({
      width: 300,
      height: 380,
      x: d.bounds.x + d.bounds.width - 320,
      y: Math.max(40, d.bounds.y + d.bounds.height - 420),
    })
    petWindow.setIgnoreMouseEvents(false)
    petWindow.show()
    petWindow.focus()
  } else {
    petWindow.setBounds({
      width: 100,
      height: 110,
      x: d.bounds.x + d.bounds.width - 120,
      y: d.bounds.y + d.bounds.height - 160,
    })
    petWindow.showInactive()
  }
  pushPetState()
}

function showMaskForSession() {
  const db = loadDb()
  if (!db.settings.region && !demoMode) return
  createMaskWindow()
  if (db.settings.region) positionMaskOverRegion(db.settings.region)
  if (maskWindow && !maskWindow.isDestroyed()) {
    maskWindow.setOpacity(1)
    maskWindow.showInactive()
  }
  pushMaskUpdate()
  startMaskFrameLoop()
  showPet()
}

function hideMask() {
  stopMaskFrameLoop()
  if (maskWindow && !maskWindow.isDestroyed()) maskWindow.hide()
}

/** Show CN cover immediately (no session required) — for user to verify effect. */
function previewMaskNow() {
  const db = loadDb()
  if (!db.settings.region) return false
  createMaskWindow()
  positionMaskOverRegion(db.settings.region)
  if (maskWindow && !maskWindow.isDestroyed()) {
    maskWindow.setOpacity(1)
    maskWindow.showInactive()
  }
  pushMaskUpdate()
  startMaskFrameLoop()
  showPet()
  return true
}

function positionHudAboveRegion(region: ScreenRect | null) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (!region) {
    overlayWindow.setBounds({ x: 80, y: 40, width: 720, height: 120 })
    return
  }
  const dip = physicalToDip(region)
  const w = Math.min(900, Math.max(420, dip.width + 40))
  const x = Math.max(8, dip.x + Math.floor((dip.width - w) / 2))
  const y = Math.max(8, dip.y - 128)
  overlayWindow.setBounds({ x, y, width: w, height: 120 })
}

/** Region picker UI gives DIP coords relative to primary display window. */
function dipRegionToPhysical(rect: ScreenRect): ScreenRect {
  const d = screen.getPrimaryDisplay()
  const s = d.scaleFactor || 1
  // screenshot-desktop returns a bitmap in physical pixels for the virtual desktop
  return {
    x: Math.round((d.bounds.x + rect.x) * s),
    y: Math.round((d.bounds.y + rect.y) * s),
    width: Math.round(rect.width * s),
    height: Math.round(rect.height * s),
  }
}

/**
 * Region framing WITHOUT any window over the movie.
 * Transparent fullscreen pickers black out hardware-decoded video on Windows the moment the mouse hits them.
 * Instead: two-point pin with F8 — cursor position only, nothing covering the player.
 */
function startPinRegionFlow() {
  hideMask()
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
  // Close legacy region window if any — NEVER open fullscreen picker again
  if (regionWindow && !regionWindow.isDestroyed()) {
    regionWindow.close()
    regionWindow = null
  }
  pinMode = 'await_tl'
  pinTl = null
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    // don't steal focus forever — user needs to click the video window
  }
  globalShortcut.register('Escape', () => {
    if (pinMode !== 'idle') cancelPinRegionFlow()
  })
  startPinCursorWatch()
  pushState()
  try {
    new Notification({
      title: 'Rehearse',
      body: '① 鼠标移到字幕左上角 → 按 F8   ② 再移到右下角 → 再按 F8。全程不会盖住视频。',
    }).show()
  } catch {
    /* ignore */
  }
}

function startPinCursorWatch() {
  if (pinCursorTimer) clearInterval(pinCursorTimer)
  pinCursorTimer = setInterval(() => {
    if (pinMode === 'idle') return
    const p = screen.getCursorScreenPoint()
    pinCursorDip = { x: p.x, y: p.y }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('region:cursor', pinCursorDip)
    }
  }, 200)
}

function stopPinCursorWatch() {
  if (pinCursorTimer) {
    clearInterval(pinCursorTimer)
    pinCursorTimer = null
  }
  pinCursorDip = null
}

function cancelPinRegionFlow() {
  pinMode = 'idle'
  pinTl = null
  stopPinCursorWatch()
  try {
    globalShortcut.unregister('Escape')
  } catch {
    /* ignore */
  }
  pushState()
}

function finishRegionFromCorners(tl: { x: number; y: number }, br: { x: number; y: number }) {
  const d = screen.getPrimaryDisplay()
  const s = d.scaleFactor || 1
  const x1 = Math.min(tl.x, br.x)
  const y1 = Math.min(tl.y, br.y)
  const x2 = Math.max(tl.x, br.x)
  const y2 = Math.max(tl.y, br.y)
  // freeform: any on-screen text block (subtitle OR in-picture text)
  const dipW = Math.max(4, x2 - x1)
  const dipH = Math.max(4, y2 - y1)
  const physical: ScreenRect = {
    x: Math.round(x1 * s),
    y: Math.round(y1 * s),
    width: Math.round(dipW * s),
    height: Math.round(dipH * s),
  }
  updateSettings({ region: physical })
  pinMode = 'idle'
  pinTl = null
  stopPinCursorWatch()
  positionHudAboveRegion(physical)
  createMaskWindow()
  positionMaskOverRegion(physical)
  try {
    new Notification({
      title: 'Rehearse',
      body: `字幕区 OK ${dipW}×${dipH}。点「开始本集」后遮罩会盖在真实字幕上。`,
    }).show()
  } catch {
    /* ignore */
  }
  // Show true mosaic cover immediately (realtime frame loop, no opacity thrash)
  if (maskWindow && !maskWindow.isDestroyed()) {
    maskExcludeOk = excludeWindowFromCapture(maskWindow) || maskExcludeOk
    maskWindow.setOpacity(1)
    maskWindow.showInactive()
  }
  pushMaskUpdate()
  startMaskFrameLoop()
  pushState()
}

function pinRegionAtCursor() {
  if (pinMode === 'idle') return
  const p = screen.getCursorScreenPoint()

  if (pinMode === 'await_tl') {
    pinTl = { x: p.x, y: p.y }
    pinMode = 'await_br'
    pushState()
    try {
      new Notification({
        title: 'Rehearse',
        body: `左上角 (${p.x},${p.y})。移到右下角，再倒计时或 F6。`,
      }).show()
    } catch {
      /* ignore */
    }
    return
  }

  if (pinMode === 'await_br' && pinTl) {
    finishRegionFromCorners(pinTl, p)
  }
}

/**
 * Countdown pin — PRIMARY method (no hotkey, no overlay on video).
 * User moves mouse to the corner; after N seconds we read cursor position.
 */
function countdownPin(which: 'tl' | 'br', seconds = 3) {
  // do not hide HUD; only mask if visible (opacity path later)
  if (regionWindow && !regionWindow.isDestroyed()) {
    regionWindow.close()
    regionWindow = null
  }

  let corner: 'tl' | 'br' = which
  if (corner === 'tl') {
    pinMode = 'await_tl'
  } else if (!pinTl) {
    // free order: first pin is always corner A
    corner = 'tl'
    pinMode = 'await_tl'
  } else {
    pinMode = 'await_br'
  }
  startPinCursorWatch()
  pushState()

  let n = seconds
  broadcast('region:countdown', { corner, n, message: corner === 'tl' ? 'move_to_tl' : 'move_to_br' })
  const tick = () => {
    n -= 1
    broadcast('region:countdown', { corner, n, message: corner === 'tl' ? 'move_to_tl' : 'move_to_br' })
    if (n <= 0) {
      const p = screen.getCursorScreenPoint()
      if (corner === 'tl') {
        pinTl = { x: p.x, y: p.y }
        pinMode = 'await_br'
        pushState()
        broadcast('region:countdown', { corner: 'tl', n: 0, done: true, point: pinTl })
        try {
          new Notification({
            title: 'Rehearse',
            body: `左上角已记 (${p.x},${p.y})。把鼠标移到右下角，点「倒计时记右下角」。`,
          }).show()
        } catch {
          /* ignore */
        }
      } else if (pinTl) {
        finishRegionFromCorners(pinTl, p)
        broadcast('region:countdown', { corner: 'br', n: 0, done: true, point: p })
      }
      return
    }
    setTimeout(tick, 1000)
  }
  setTimeout(tick, 1000)
}

type RegionShotMeta = {
  dataUrl?: string
  filePath?: string
  width: number
  height: number
  originX: number
  originY: number
  scaleFactor: number
}

let pendingRegionShot: RegionShotMeta | null = null

/**
 * Fullscreen-friendly free select:
 * 1) capture primary screen to temp file
 * 2) open opaque window showing the freeze frame
 * 3) user free-drags a box → confirm → physical region saved
 */
async function openFreeformRegionPick() {
  hideMask()
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide()
  if (regionWindow && !regionWindow.isDestroyed()) {
    regionWindow.close()
    regionWindow = null
  }
  pendingRegionShot = null

  const display = screen.getPrimaryDisplay()
  const s = display.scaleFactor || 1
  const bounds = display.bounds

  try {
    const buf = await screenshot({ format: 'png' })
    const { nativeImage } = await import('electron')
    let image = nativeImage.createFromBuffer(buf)
    const full = image.getSize()
    const px = {
      x: Math.max(0, Math.round(bounds.x * s)),
      y: Math.max(0, Math.round(bounds.y * s)),
      width: Math.round(bounds.width * s),
      height: Math.round(bounds.height * s),
    }
    if (full.width >= px.x + 8 && full.height >= px.y + 8) {
      const w = Math.min(px.width, full.width - px.x)
      const h = Math.min(px.height, full.height - px.y)
      if (w > 8 && h > 8) {
        try {
          image = image.crop({ x: px.x, y: px.y, width: w, height: h })
        } catch {
          /* keep full */
        }
      }
    }
    const size = image.getSize()
    // write file — large dataURL can break IPC; file:// is reliable
    const filePath = path.join(app.getPath('temp'), `rehearse-pick-${Date.now()}.png`)
    fs.writeFileSync(filePath, image.toPNG())
    // also keep a moderate JPEG dataUrl fallback for webSecurity
    let dataUrl = ''
    try {
      dataUrl = image.resize({ width: Math.min(size.width, 1920), quality: 'good' }).toDataURL()
    } catch {
      dataUrl = image.toDataURL()
    }
    pendingRegionShot = {
      dataUrl,
      filePath,
      width: size.width,
      height: size.height,
      originX: bounds.x,
      originY: bounds.y,
      scaleFactor: s,
    }
    console.log('[rehearse] region shot ready', size.width, size.height, filePath)
  } catch (e) {
    console.error('[rehearse] screenshot failed', e)
    try {
      new Notification({
        title: 'Rehearse',
        body: '截图失败，请检查屏幕权限后重试。',
      }).show()
    } catch {
      /* ignore */
    }
    return
  }

  regionWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    // avoid fullscreen API glitches — use explicit bounds instead
    fullscreen: false,
    simpleFullscreen: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    backgroundColor: '#050608',
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false, // allow file:// image from temp
    },
  })
  regionWindow.setAlwaysOnTop(true, 'screen-saver')
  regionWindow.once('ready-to-show', () => {
    regionWindow?.show()
    regionWindow?.focus()
  })
  const pushShot = () => {
    if (pendingRegionShot && regionWindow && !regionWindow.isDestroyed()) {
      regionWindow.webContents.send('region:shot', pendingRegionShot)
    }
  }
  regionWindow.webContents.on('did-finish-load', () => {
    pushShot()
    // second push after paint
    setTimeout(pushShot, 200)
  })
  regionWindow.on('closed', () => {
    // cleanup temp file
    if (pendingRegionShot?.filePath) {
      try {
        fs.unlinkSync(pendingRegionShot.filePath)
      } catch {
        /* ignore */
      }
    }
    regionWindow = null
    pendingRegionShot = null
  })

  if (isDev) {
    await regionWindow.loadURL(pageUrl('region'))
  } else {
    await regionWindow.loadFile(pageUrl('region'))
  }
}

/** name kept for IPC */
function openRegionPicker() {
  void openFreeformRegionPick().catch((e) => console.error('[rehearse] openFreeformRegionPick', e))
}

function broadcast(channel: string, payload?: unknown) {
  for (const w of [mainWindow, overlayWindow, maskWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function getSnapshot() {
  const db = loadDb()
  const aiResolved = resolveAiSettings(db.settings.ai)
  return {
    settings: settingsForRenderer(),
    activeSession,
    currentSubtitle,
    vocab: db.vocab,
    sessions: db.sessions,
    ocrRunning,
    demoMode,
    chineseRevealUntil,
    selectModeUntil,
    pendingUndoWordId: null as string | null,
    chineseClarityClicks: 0,
    pausedForDictation,
    lastExercises: db.lastExercises,
    lastResults: db.lastResults,
    lastSettleSessionId: db.lastSettleSessionId,
    /** true if settings / env / optional local auth can call xAI (secret never sent) */
    aiReady: hasAiCredentials(db.settings.ai),
    aiProvider: 'xAI',
    aiModel: aiResolved.model,
    aiSource: aiSource(db.settings.ai),
    pinMode,
    pinTl,
    pinCursor: pinCursorDip,
    wordAssistVisible,
  }
}

function pushState() {
  broadcast('state:update', getSnapshot())
}

function setOverlayClickThrough(ignore: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (ignore) overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  else overlayWindow.setIgnoreMouseEvents(false)
}

async function applySubtitle(line: SubtitleLine) {
  currentSubtitle = line
  if (activeSession) {
    activeSession.subtitleLines.push(line)
    const piece = [line.en, line.zh].filter(Boolean).join('\n')
    if (piece && !activeSession.subtitleText.includes(piece)) {
      activeSession.subtitleText += (activeSession.subtitleText ? '\n' : '') + piece
    }
    upsertSession(activeSession)
  }

  // translate if needed
  const db = loadDb()
  if (line.en && !line.zh && hasAiCredentials(db.settings.ai)) {
    const cached = translationCache.get(line.en)
    if (cached) {
      line.zh = cached
    } else {
      try {
        const zh = await translateEnToZh(db.settings.ai, line.en)
        if (zh) {
          translationCache.set(line.en, zh)
          if (currentSubtitle?.id === line.id) {
            currentSubtitle = { ...currentSubtitle, zh }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  pushState()
  pushPetState()
}

/**
 * OCR English strip only — mask stays on Chinese, NEVER hide/show (no flash).
 * coverFrom=0 means full-region CN cover → OCR on demand is rarer (still try full region without hide).
 */
let ocrBusy = false

async function tickOcr() {
  if (!ocrRunning || demoMode) return
  if (ocrBusy) return
  if (regionWindow && !regionWindow.isDestroyed()) return
  if (pinMode !== 'idle') return
  const db = loadDb()
  const region = db.settings.region
  if (!region) return

  ocrBusy = true
  try {
    // OCR English strip only (opposite of CN cover) — never hide CN mask
    const enBand = enStripPhysical(region)
    const png = enBand ? await captureRegion(enBand) : await captureRegion(region)
    const raw = await ocrImage(png, db.settings.ocr.lang)

    if (!raw || raw.replace(/\s/g, '').length < 3) return
    if (raw === lastOcrText) return
    if (lastOcrText && similarity(lastOcrText, raw) > 0.88) return
    lastOcrText = raw
    const parts = splitBilingual(raw)
    await applySubtitle({
      id: randomUUID(),
      en: parts.en || raw,
      zh: parts.zh || '',
      t: Date.now(),
      raw,
    })
  } catch (e) {
    console.error('OCR tick failed', e)
  } finally {
    ocrBusy = false
  }
}

/** Rare path still used by region preview / demo SVG frame */
async function withCaptureClean<T>(fn: () => Promise<T>): Promise<T> {
  return fn()
}

function similarity(a: string, b: string): number {
  if (a === b) return 1
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (!longer.length) return 1
  let same = 0
  for (let i = 0; i < shorter.length; i++) if (shorter[i] === longer[i]) same++
  return same / longer.length
}

function startOcr() {
  const db = loadDb()
  if (!db.settings.region && !demoMode) {
    openRegionPicker()
    return
  }
  ocrRunning = true
  if (db.settings.region) {
    createMaskWindow()
    positionMaskOverRegion(db.settings.region)
    positionHudAboveRegion(db.settings.region)
    maskWindow?.showInactive()
  }
  if (ocrTimer) clearInterval(ocrTimer)
  // OCR only for word-assist accuracy; does not drive the CN cover visuals
  const ms = Math.max(2500, db.settings.ocr.intervalMs || 2800)
  ocrTimer = setInterval(() => {
    void tickOcr()
  }, ms)
  void tickOcr()
  pushState()
}

function stopOcr() {
  ocrRunning = false
  if (ocrTimer) {
    clearInterval(ocrTimer)
    ocrTimer = null
  }
  if (!demoMode) {
    hideMask()
  }
  pushState()
}

function startDemo() {
  stopDemoTimers()
  demoMode = true
  demoIndex = 0
  ocrRunning = true
  // Demo: bottom dual-line band; mask only CN strip (stable CSS, no frame thrash)
  const d = screen.getPrimaryDisplay()
  const s = d.scaleFactor || 1
  const dipW = Math.min(720, d.bounds.width - 80)
  const dipH = 80
  const dipX = Math.floor((d.bounds.width - dipW) / 2)
  const dipY = d.bounds.height - 150
  const physical: ScreenRect = {
    x: Math.round((d.bounds.x + dipX) * s),
    y: Math.round((d.bounds.y + dipY) * s),
    width: Math.round(dipW * s),
    height: Math.round(dipH * s),
  }
  updateSettings({ region: physical, maskCoverFrom: 0 })
  createMaskWindow()
  positionMaskOverRegion(physical)
  positionHudAboveRegion(physical)
  maskWindow?.setOpacity(1)
  maskWindow?.showInactive()
  pushMaskUpdate()
  showOverlay()

  const pump = () => {
    if (!demoMode) return
    const item = DEMO_LINES[demoIndex % DEMO_LINES.length]
    demoIndex++
    // steady line switch — no mask flicker; only EN assist updates
    void applySubtitle({
      id: randomUUID(),
      en: item.en,
      zh: item.zh,
      t: Date.now(),
    })
    demoTimer = setTimeout(pump, Math.max(3500, item.holdMs))
  }
  pump()
  pushState()
}

function stopDemoTimers() {
  if (demoTimer) {
    clearTimeout(demoTimer)
    demoTimer = null
  }
}

function stopDemo() {
  demoMode = false
  stopDemoTimers()
  ocrRunning = false
  hideMask()
  pushState()
}

function startSession(meta?: Partial<Session>) {
  const db = loadDb()
  if (meta?.demoMode) demoMode = true
  activeSession = {
    id: randomUUID(),
    title: meta?.title || `Episode ${new Date().toLocaleString()}`,
    showName: meta?.showName,
    episode: meta?.episode,
    notes: meta?.notes,
    startedAt: Date.now(),
    freedomLevel: db.settings.freedomLevel,
    subtitleText: '',
    subtitleLines: [],
    wordIds: [],
    demoMode: !!meta?.demoMode || demoMode,
  }
  upsertSession(activeSession)
  if (activeSession.demoMode) startDemo()
  else startOcr()
  showOverlay()
  pushState()
  return activeSession
}

function endSession(): Session | null {
  if (!activeSession) return null
  activeSession.endedAt = Date.now()
  upsertSession(activeSession)
  const ended = activeSession
  activeSession = null
  stopOcr()
  stopDemo()
  pushState()

  const db = loadDb()
  if (db.settings.notifyReview) {
    try {
      new Notification({
        title: 'Rehearse',
        body: 'Episode saved. Rehearse the lines while memory is warm.',
      }).show()
    } catch {
      /* ignore */
    }
  }
  return ended
}

function showOverlay() {
  // EN assist only when user asks — default: real EN subs only, no extra UI on film
  if (wordAssistVisible) {
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
    else overlayWindow.show()
    const db = loadDb()
    positionHudAboveRegion(db.settings.region)
  } else if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
  if (activeSession || demoMode) {
    showMaskForSession()
    showPet()
  }
  pushState()
}

function hideOverlay() {
  wordAssistVisible = false
  overlayWindow?.hide()
  hideMask()
  hidePet()
}

function setWordAssist(on: boolean) {
  wordAssistVisible = on
  if (on) {
    if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
    const db = loadDb()
    positionHudAboveRegion(db.settings.region)
    overlayWindow?.show()
  } else {
    overlayWindow?.hide()
  }
  pushState()
}

function cycleFreedom() {
  const db = loadDb()
  const next = (((db.settings.freedomLevel + 1) % 5) as FreedomLevel)
  updateSettings({ freedomLevel: next })
  if (activeSession) {
    activeSession.freedomLevel = next
    upsertSession(activeSession)
  }
  pushMaskUpdate()
  pushState()
}

function flashChinese() {
  // Peek: hide CN cover only — English was never covered
  chineseRevealUntil = Date.now() + 1200
  pushMaskUpdate()
  if (maskWindow && !maskWindow.isDestroyed()) {
    maskWindow.setOpacity(0)
    setTimeout(() => {
      chineseRevealUntil = 0
      if (maskWindow && !maskWindow.isDestroyed()) {
        maskWindow.setOpacity(1)
        pushMaskUpdate()
      }
      pushState()
    }, 1200)
  }
  pushState()
}

function enterSelectMode() {
  selectModeUntil = Date.now() + 2000
  setOverlayClickThrough(false)
  pushState()
  setTimeout(() => {
    selectModeUntil = 0
    const db = loadDb()
    if (db.settings.overlayClickThrough) setOverlayClickThrough(true)
    pushState()
  }, 2000)
}

function registerHotkeys() {
  globalShortcut.unregisterAll()
  // Avoid broken F-keys on this machine — use Ctrl+Shift combos only
  try {
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      void openFreeformRegionPick()
    })
  } catch (e) {
    console.warn('[rehearse] hotkey error Ctrl+Shift+R', e)
  }
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      } else createMainWindow()
    })
  } catch {
    /* ignore */
  }
  globalShortcut.register('CommandOrControl+Shift+F', () => flashChinese())
  globalShortcut.register('CommandOrControl+Shift+W', () => setWordAssist(!wordAssistVisible))
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    setWordAssist(true)
    enterSelectMode()
  })
  globalShortcut.register('CommandOrControl+Shift+L', () => cycleFreedom())
  globalShortcut.register('CommandOrControl+Shift+E', () => {
    const ended = endSession()
    if (ended) broadcast('session:ended', ended)
  })
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    if (ocrRunning) stopOcr()
    else startOcr()
  })
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    pausedForDictation = !pausedForDictation
    pushState()
  })
}

function setupIpc() {
  ipcMain.handle('app:getState', () => getSnapshot())

  ipcMain.handle('settings:update', (_e, partial: Partial<AppSettings>) => {
    const s = mergeSettingsFromRenderer(partial)
    const layoutChanged =
      partial.maskCoverFrom !== undefined ||
      partial.maskCoverRatio !== undefined ||
      partial.maskCnSide !== undefined ||
      partial.region !== undefined
    if (s.region && (layoutChanged || partial.maskEffect !== undefined)) {
      positionMaskOverRegion(s.region)
      pushMaskUpdate()
    } else if (partial.maskEffect !== undefined) {
      pushMaskUpdate()
    }
    pushState()
    return settingsForRenderer()
  })

  ipcMain.handle('assist:set', (_e, on: boolean) => {
    setWordAssist(!!on)
  })

  ipcMain.handle('assist:toggle', () => {
    setWordAssist(!wordAssistVisible)
    return wordAssistVisible
  })

  ipcMain.handle('pet:setOpen', (_e, open: boolean) => {
    setPetOpen(!!open)
  })

  ipcMain.handle('pet:lookup', async (_e, word: string) => {
    const db = loadDb()
    const text = await explainWord(db.settings.ai, word, currentSubtitle?.en)
    // also auto-capture word for vocab (low friction)
    if (activeSession && word.trim()) {
      try {
        const item: VocabItem = {
          id: randomUUID(),
          word: word.trim(),
          status: 'new',
          sessionId: activeSession.id,
          contextEn: currentSubtitle?.en || '',
          contextZh: currentSubtitle?.zh || '',
          timestamp: Date.now(),
          createdAt: Date.now(),
          reviewCount: 0,
          correctCount: 0,
          wrongCount: 0,
          kind: 'word',
        }
        addVocab(item)
        activeSession.wordIds.push(item.id)
        upsertSession(activeSession)
        pushState()
      } catch {
        /* ignore */
      }
    }
    return text
  })

  ipcMain.handle('settings:testAi', async () => {
    const db = loadDb()
    return testAi(db.settings.ai)
  })

  ipcMain.handle('region:openPicker', async () => {
    await openFreeformRegionPick()
    return { ok: true, hasShot: Boolean(pendingRegionShot) }
  })

  ipcMain.handle('region:pinClick', () => {
    pinRegionAtCursor()
  })

  ipcMain.handle('region:countdown', (_e, corner: 'tl' | 'br', seconds?: number) => {
    countdownPin(corner, seconds ?? 3)
  })

  ipcMain.handle('region:cancel', () => {
    cancelPinRegionFlow()
    pendingRegionShot = null
    if (regionWindow && !regionWindow.isDestroyed()) {
      regionWindow.close()
      regionWindow = null
    }
  })

  // freeform save: physical pixels from picker
  ipcMain.handle('region:save', (_e, rect: ScreenRect) => {
    const physical: ScreenRect = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(4, Math.round(rect.width)),
      height: Math.max(4, Math.round(rect.height)),
    }
    console.log('[rehearse] region saved', physical)
    updateSettings({ region: physical })
    // close picker first
    const rw = regionWindow
    regionWindow = null
    if (rw && !rw.isDestroyed()) rw.close()
    if (pendingRegionShot?.filePath) {
      try {
        fs.unlinkSync(pendingRegionShot.filePath)
      } catch {
        /* ignore */
      }
    }
    pendingRegionShot = null
    positionHudAboveRegion(physical)
    createMaskWindow()
    positionMaskOverRegion(physical)
    // auto preview cover so user sees result immediately
    if (maskWindow && !maskWindow.isDestroyed()) {
      maskWindow.setOpacity(1)
      maskWindow.showInactive()
    }
    pushMaskUpdate()
    pushState()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
    try {
      new Notification({
        title: 'Rehearse',
        body: `打码区 ${physical.width}×${physical.height} 已设定，遮罩已预览。`,
      }).show()
    } catch {
      /* ignore */
    }
    return physical
  })

  ipcMain.handle('region:getShot', () => pendingRegionShot)

  ipcMain.handle('session:start', (_e, meta?: Partial<Session>) => startSession(meta))
  ipcMain.handle('session:end', () => {
    const ended = endSession()
    if (ended) broadcast('session:ended', ended)
    return ended
  })

  ipcMain.handle('ocr:start', () => {
    startOcr()
  })
  ipcMain.handle('ocr:stop', () => {
    stopOcr()
  })
  ipcMain.handle('demo:start', () => {
    if (!activeSession) startSession({ title: 'Demo Episode', demoMode: true })
    else startDemo()
  })
  ipcMain.handle('demo:stop', () => stopDemo())

  ipcMain.handle('overlay:show', () => showOverlay())
  ipcMain.handle('overlay:hide', () => hideOverlay())
  ipcMain.handle('mask:preview', () => previewMaskNow())
  /** Agent/user QA: force one capture + write scripts/verify-live/* */
  ipcMain.handle('mask:verifyDump', async () => {
    const frame = await captureCnFrameForMask()
    // writeMask expects raw png base64 without data: prefix for nativeImage
    if (frame) {
      let rawForDisk = frame
      if (frame.startsWith('data:')) {
        // re-capture pure png for disk QA
        const db = loadDb()
        if (db.settings.region) {
          try {
            const png = await captureRegionColor(cnStripPhysical(db.settings.region))
            rawForDisk = png.toString('base64')
            await writeMaskVerifyArtifacts(rawForDisk)
          } catch {
            /* ignore */
          }
        }
      } else {
        await writeMaskVerifyArtifacts(frame)
      }
      await new Promise((r) => setTimeout(r, 80))
      await captureMaskWindowShot()
    }
    pushMaskUpdate(frame)
    const metaPath = path.join(process.cwd(), 'scripts', 'verify-live', 'last-meta.json')
    let meta: unknown = null
    try {
      if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      /* ignore */
    }
    const dir = path.join(process.cwd(), 'scripts', 'verify-live')
    return {
      ok: Boolean(frame),
      excludeOk: maskExcludeOk,
      fps: maskFrameFps,
      hasFrame: Boolean(lastMaskFrameB64),
      friction: MASK_FRICTION,
      effect: currentMaskEffect(),
      meta,
      paths: {
        raw: path.join(dir, 'cn-raw.png'),
        mosaic: path.join(dir, 'cn-mosaic.png'),
        side: path.join(dir, 'cn-side-by-side.png'),
        maskWindow: path.join(dir, 'mask-window.png'),
        meta: metaPath,
      },
    }
  })
  ipcMain.handle('mask:hide', () => {
    hideMask()
    return true
  })
  ipcMain.handle('overlay:setClickThrough', (_e, ignore: boolean) => {
    setOverlayClickThrough(ignore)
  })

  ipcMain.handle('freedom:set', (_e, level: FreedomLevel) => {
    updateSettings({ freedomLevel: level })
    if (activeSession) {
      activeSession.freedomLevel = level
      upsertSession(activeSession)
    }
    pushMaskUpdate()
    pushState()
  })

  ipcMain.handle('chinese:flash', () => flashChinese())
  ipcMain.handle('chinese:clarityClick', () => {
    const db = loadDb()
    if (!db.settings.adaptiveDecel) return
    // soft signal only; renderer can show toast
    broadcast('chinese:clarity', { at: Date.now() })
  })

  ipcMain.handle(
    'vocab:capture',
    (
      _e,
      payload: {
        word: string
        kind?: 'word' | 'sentence' | 'unclear'
        contextEn?: string
        contextZh?: string
      },
    ) => {
      if (!activeSession) {
        startSession({ title: 'Quick capture' })
      }
      const session = activeSession!
      const en = payload.contextEn || currentSubtitle?.en || ''
      const zh = payload.contextZh || currentSubtitle?.zh || ''
      const item: VocabItem = {
        id: randomUUID(),
        word: payload.word.trim(),
        status: 'new',
        sessionId: session.id,
        contextEn: en,
        contextZh: zh,
        timestamp: Date.now(),
        createdAt: Date.now(),
        reviewCount: 0,
        correctCount: 0,
        wrongCount: 0,
        kind: payload.kind || 'word',
      }
      addVocab(item)
      session.wordIds.push(item.id)
      upsertSession(session)
      pushState()
      return item
    },
  )

  ipcMain.handle('vocab:remove', (_e, id: string) => {
    removeVocab(id)
    pushState()
  })

  ipcMain.handle('vocab:patch', (_e, id: string, patch: Partial<VocabItem>) => {
    const v = patchVocab(id, patch)
    pushState()
    return v
  })

  ipcMain.handle('vocab:export', (_e, format: 'csv' | 'anki') => {
    const db = loadDb()
    if (format === 'csv') {
      const header = 'word,status,context_en,context_zh,created_at\n'
      const rows = db.vocab
        .map((v) =>
          [v.word, v.status, JSON.stringify(v.contextEn), JSON.stringify(v.contextZh), v.createdAt].join(','),
        )
        .join('\n')
      return header + rows
    }
    return db.vocab.map((v) => `${v.word}\t${v.contextZh || v.contextEn}`).join('\n')
  })

  ipcMain.handle('practice:generate', async (_e, sessionId?: string) => {
    const db = loadDb()
    const session =
      db.sessions.find((s) => s.id === sessionId) ||
      db.sessions.find((s) => s.id === db.lastSettleSessionId) ||
      db.sessions[0]
    if (!session) {
      return { exercises: buildFallbackExercises([], DEMO_LINES.map((d) => d.en).join('\n')), source: 'fallback' }
    }
    const words = db.vocab.filter((v) => v.sessionId === session.id)
    const result = await generateExercises(db.settings.ai, {
      title: session.title,
      subtitleText: session.subtitleText || DEMO_LINES.map((d) => `${d.en}\n${d.zh}`).join('\n'),
      words,
    })
    savePractice(session.id, result.exercises, [])
    pushState()
    return result
  })

  ipcMain.handle(
    'practice:submit',
    (_e, payload: { exercise: Exercise; userAnswer: string; results: ExerciseResult[] }) => {
      const correct = gradeAnswer(payload.exercise, payload.userAnswer)
      const result: ExerciseResult = {
        exerciseId: payload.exercise.id,
        userAnswer: payload.userAnswer,
        correct,
        targetWord: payload.exercise.targetWord,
      }
      const db = loadDb()
      const word = db.vocab.find(
        (v) => v.word.toLowerCase() === payload.exercise.targetWord.toLowerCase(),
      )
      if (word) {
        patchVocab(word.id, {
          reviewCount: word.reviewCount + 1,
          correctCount: word.correctCount + (correct ? 1 : 0),
          wrongCount: word.wrongCount + (correct ? 0 : 1),
          lastReviewedAt: Date.now(),
          status: correct
            ? word.correctCount + 1 >= 2
              ? 'known'
              : 'learning'
            : 'learning',
        })
      }
      const results = [...payload.results, result]
      if (db.lastSettleSessionId) savePractice(db.lastSettleSessionId, db.lastExercises, results)
      pushState()
      return result
    },
  )

  ipcMain.handle('data:clear', () => {
    clearAll()
    activeSession = null
    currentSubtitle = null
    pushState()
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    try {
      const u = new URL(String(url || ''))
      if (u.protocol !== 'https:') return false
      const host = u.hostname.toLowerCase()
      const allowed =
        host === 'console.x.ai' ||
        host === 'docs.x.ai' ||
        host === 'github.com' ||
        host === 'www.github.com' ||
        host.endsWith('.github.io')
      if (!allowed) return false
      void shell.openExternal(u.toString())
      return true
    } catch {
      return false
    }
  })
}

app.whenReady().then(() => {
  loadDotEnv()
  setupIpc()
  createMainWindow()
  createOverlayWindow()
  hideOverlay()
  registerHotkeys()

  // If region already pinned, start true-mosaic cover immediately (agent QA + user resume)
  setTimeout(() => {
    try {
      const db = loadDb()
      if (db.settings.region) {
        previewMaskNow()
        console.log('[mask] auto-preview on launch, effect=', currentMaskEffect())
      }
    } catch (e) {
      console.warn('[mask] auto-preview failed', e)
    }
  }, 1200)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  // if mask still covering, keep process (main was only hidden)
  if (maskWindow && !maskWindow.isDestroyed() && maskWindow.isVisible()) return
  stopOcr()
  stopDemo()
  void disposeOcr()
  globalShortcut.unregisterAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  void disposeOcr()
})
