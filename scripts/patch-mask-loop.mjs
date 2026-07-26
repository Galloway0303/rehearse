import fs from 'fs'

const p = new URL('../electron/main.ts', import.meta.url)
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('function pushMaskUpdate()')
const end = s.indexOf('function positionHudAboveRegion')
if (start < 0 || end < 0) {
  console.error('markers not found', start, end)
  process.exit(1)
}

const replacement = `function pushMaskUpdate() {
  if (!maskWindow || maskWindow.isDestroyed()) return
  const clear = Date.now() < chineseRevealUntil
  const effect = currentMaskEffect()
  // Pure UI layer only — never send frames, never thrash opacity for effects
  maskWindow.webContents.send('mask:update', {
    effect,
    clear,
  })
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
}

function hideMask() {
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
  return true
}

`

s = s.slice(0, start) + replacement + s.slice(end)

// Remove all frame-loop calls
s = s.replace(/\n\s*startMaskFrameLoop\(\)/g, '')
s = s.replace(/\n\s*stopMaskFrameLoop\(\)/g, '')

// Clean settings:update branches that only restarted the loop
s = s.replace(
  /if \(partial\.maskEffect !== undefined \|\| layoutChanged\) \{\s*stopMaskFrameLoop\(\)\s*startMaskFrameLoop\(\)\s*\}/g,
  '',
)
s = s.replace(
  /\} else if \(partial\.maskEffect !== undefined\) \{\s*pushMaskUpdate\(\)\s*stopMaskFrameLoop\(\)\s*startMaskFrameLoop\(\)\s*\}/g,
  '} else if (partial.maskEffect !== undefined) {\n      pushMaskUpdate()\n    }',
)

// Second pass if first cleanup left stop/start residual (already stripped calls)
// Fix settings handler more carefully by reading after
fs.writeFileSync(p, s)

const leftover = [
  'captureCnFrameForEffect',
  'startMaskFrameLoop',
  'stopMaskFrameLoop',
  'lastMaskFrameB64',
  'maskFrameTimer',
  'effectNeedsFrame',
  'framePngBase64',
].filter((k) => s.includes(k))

console.log('leftover refs:', leftover.length ? leftover.join(', ') : 'none')
console.log('done')
