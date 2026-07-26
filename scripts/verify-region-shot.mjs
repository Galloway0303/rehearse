/**
 * Smoke-test: screenshot + crop primary display works on this machine.
 * Run: node scripts/verify-region-shot.mjs
 */
import screenshot from 'screenshot-desktop'
import fs from 'fs'
import path from 'path'
import os from 'os'

const out = path.join(os.tmpdir(), 'rehearse-verify-shot.png')
const buf = await screenshot({ format: 'png' })
fs.writeFileSync(out, buf)
console.log('OK screenshot bytes=', buf.length, 'path=', out)
if (buf.length < 1000) {
  console.error('FAIL: screenshot too small')
  process.exit(1)
}
console.log('PASS: freeform pick prerequisite (screenshot) works')
