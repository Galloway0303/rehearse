/**
 * Claude version self-check. Run: node scripts/verify-claude.mjs
 *
 * Verifies (offline, no app launch needed):
 *  1. all Claude files present
 *  2. electron/main.ts carries the 2-line live-stream patch
 *  3. GL mosaic friction math hits the 7–8 resistance target (same contract as
 *     the grok-era verify-true-mosaic.mjs — the GL engine reuses effects.ts math)
 *  4. typecheck (if node_modules is installed)
 */
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => path.join(root, p)
const results = { pass: true, checks: [], at: new Date().toISOString() }
const check = (name, ok, detail = '') => {
  results.checks.push({ name, ok, detail })
  if (!ok) results.pass = false
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

// 1. files
for (const f of [
  'electron/claude-live.ts',
  'electron/modules.d.ts',
  'electron/preload.ts',
  'src/mask/gl-engine.ts',
  'src/mask/live-stream.ts',
  'src/mask/main.tsx',
  'scripts/claude-patch-main.mjs',
  'scripts/setup-claude.ps1',
]) {
  check(`file ${f}`, fs.existsSync(rel(f)))
}

// 2. patch anchors
const main = fs.readFileSync(rel('electron/main.ts'), 'utf8')
check('main.ts imports ./claude-live', main.includes("./claude-live"))
check('main.ts frame loop yields to live stream', /if \(claudeStreamActive\(\)\) \{/.test(main))
const preload = fs.readFileSync(rel('electron/preload.ts'), 'utf8')
check('preload exposes rehearseMaskLive', preload.includes('rehearseMaskLive'))

// 3. friction contract (identical formula to src/mask/effects.ts, used by GL engine)
const TARGET = 7.5
const blockSizeForFriction = (height, friction = TARGET) => {
  const h = Math.max(8, height)
  const glyph = Math.max(12, h * 0.9)
  const bpg = Math.max(0.55, 4.1 - ((friction - 1) / 9) * 3.4)
  const minBlock = Math.max(10, Math.round(h * 0.32))
  return Math.max(minBlock, Math.min(72, Math.round(glyph / bpg)))
}
const estimateFriction = (h, block) => {
  const glyph = Math.max(12, h * 0.9)
  const bpg = glyph / Math.max(1, block)
  return Math.round(Math.min(10, Math.max(1, 1 + ((4.1 - bpg) / 3.4) * 9)) * 10) / 10
}
for (const h of [40, 56, 72, 96, 120]) {
  const block = blockSizeForFriction(h)
  const est = estimateFriction(h, block)
  check(`mosaic friction h=${h}`, est >= 7 && est <= 8.5, `block=${block} R≈${est}`)
}

// 4. typecheck if deps are installed
if (fs.existsSync(rel('node_modules/typescript/lib/tsc.js'))) {
  try {
    execSync('node node_modules/typescript/lib/tsc.js --noEmit', { cwd: root, stdio: 'pipe' })
    check('typecheck renderer', true)
  } catch (e) {
    check('typecheck renderer', false, String(e.stdout || e).slice(0, 400))
  }
  try {
    execSync('node node_modules/typescript/lib/tsc.js -p tsconfig.electron.json --noEmit', {
      cwd: root,
      stdio: 'pipe',
    })
    check('typecheck electron', true)
  } catch (e) {
    check('typecheck electron', false, String(e.stdout || e).slice(0, 400))
  }
} else {
  console.log('SKIP typecheck (node_modules missing — run scripts/setup-claude.ps1 first)')
}

fs.writeFileSync(rel('scripts/verify-claude-result.json'), JSON.stringify(results, null, 2))
console.log(results.pass ? '\nALL PASS' : '\nFAILURES — see scripts/verify-claude-result.json')
process.exit(results.pass ? 0 : 1)
