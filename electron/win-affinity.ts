/**
 * Windows: exclude overlay windows from screen capture so we can
 * screenshot the *real video* under the mask without opacity thrash (no flash).
 *
 * WDA_EXCLUDEFROMCAPTURE = 0x11  (Windows 10 2004+)
 */
import type { BrowserWindow } from 'electron'

const WDA_NONE = 0x00
const WDA_EXCLUDEFROMCAPTURE = 0x11

let setAffinity: ((hwnd: bigint | number, affinity: number) => number) | null = null
let loadTried = false

function ensureApi() {
  if (loadTried) return setAffinity
  loadTried = true
  if (process.platform !== 'win32') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi')
    const user32 = koffi.load('user32.dll')
    // HWND is pointer-sized; affinity is DWORD
    setAffinity = user32.func(
      'int __stdcall SetWindowDisplayAffinity(void *hWnd, uint32_t dwAffinity)',
    ) as (hwnd: bigint | number, affinity: number) => number
  } catch (e) {
    console.warn('[win-affinity] koffi/user32 load failed', e)
    setAffinity = null
  }
  return setAffinity
}

function hwndFromWindow(win: BrowserWindow): bigint | number | null {
  try {
    const buf = win.getNativeWindowHandle()
    if (!buf || buf.length < 4) return null
    if (process.arch === 'x64' || process.arch === 'arm64') {
      return buf.readBigUInt64LE(0)
    }
    return buf.readUInt32LE(0)
  } catch {
    return null
  }
}

/** Hide this BrowserWindow from BitBlt / screenshot / game capture APIs. */
export function excludeWindowFromCapture(win: BrowserWindow | null | undefined): boolean {
  if (!win || win.isDestroyed()) return false
  const api = ensureApi()
  if (!api) return false
  const hwnd = hwndFromWindow(win)
  if (hwnd == null) return false
  try {
    const ok = api(hwnd, WDA_EXCLUDEFROMCAPTURE)
    if (!ok) {
      console.warn('[win-affinity] SetWindowDisplayAffinity failed for', String(hwnd))
      return false
    }
    return true
  } catch (e) {
    console.warn('[win-affinity] exclude failed', e)
    return false
  }
}

export function clearWindowCaptureExclusion(win: BrowserWindow | null | undefined): boolean {
  if (!win || win.isDestroyed()) return false
  const api = ensureApi()
  if (!api) return false
  const hwnd = hwndFromWindow(win)
  if (hwnd == null) return false
  try {
    return Boolean(api(hwnd, WDA_NONE))
  } catch {
    return false
  }
}

export { WDA_EXCLUDEFROMCAPTURE }
