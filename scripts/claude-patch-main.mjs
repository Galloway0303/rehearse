/**
 * Claude version — minimal, anchored patch for electron/main.ts (synced from
 * the grok original). Two edits only:
 *
 *   1. import './claude-live'  (registers maskLive IPC + stream flag)
 *   2. in startMaskFrameLoop()'s tick: skip the BitBlt screenshot capture while
 *      the renderer reports an active live stream (legacy loop stays intact as
 *      the automatic fallback).
 *
 * Idempotent: safe to run any number of times. Exits 1 if anchors are missing.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mainPath = path.join(here, '..', 'electron', 'main.ts')
const livePath = path.join(here, '..', 'electron', 'claude-live.ts')

if (!fs.existsSync(livePath)) {
  console.error('[claude-patch] electron/claude-live.ts missing — wrong folder?')
  process.exit(1)
}
if (!fs.existsSync(mainPath)) {
  console.error('[claude-patch] electron/main.ts missing — run the sync first (scripts/setup-claude.ps1)')
  process.exit(1)
}

let src = fs.readFileSync(mainPath, 'utf8')
let changed = false

// ---- edit 1: import ----
if (!src.includes("./claude-live")) {
  src = `import { claudeStreamActive } from './claude-live'\n` + src
  changed = true
  console.log('[claude-patch] + import ./claude-live')
} else {
  console.log('[claude-patch] = import already present')
}

// ---- edit 2: frame-loop guard ----
if (!src.includes('claudeStreamActive')) {
  console.error('[claude-patch] internal error: import edit missing')
  process.exit(1)
}
if (!/if \(claudeStreamActive\(\)\) \{/.test(src)) {
  const anchor = /(const tick = async \(\) => \{\s*\r?\n(\s*)if \(maskFrameBusy\) return)/
  if (!anchor.test(src)) {
    console.error('[claude-patch] anchor not found: startMaskFrameLoop tick / maskFrameBusy')
    process.exit(1)
  }
  src = src.replace(
    anchor,
    (_m, head, indent) =>
      `${head}\n${indent}if (claudeStreamActive()) {\n${indent}  // Claude live stream renders the mask — skip legacy BitBlt capture\n${indent}  return\n${indent}}`,
  )
  changed = true
  console.log('[claude-patch] + stream guard in startMaskFrameLoop tick')
} else {
  console.log('[claude-patch] = stream guard already present')
}

if (changed) {
  fs.writeFileSync(mainPath, src)
  console.log('[claude-patch] wrote', mainPath)
} else {
  console.log('[claude-patch] nothing to do')
}
console.log('[claude-patch] OK')
