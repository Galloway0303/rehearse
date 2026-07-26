/**
 * Stable Windows electron:dev — avoids vite-plugin-electron treeKill crashes
 * when Electron main rebuilds (Access Denied on taskkill).
 *
 * Flow: tsc electron once → vite (renderer + electron watch via plugin) with
 * softer restart, or fallback: vite renderer + electron .
 */
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: root,
    env: { ...process.env, ...opts.env },
    ...opts,
  })
  return child
}

// Prebuild main/preload so electron has entry on first launch
console.log('[dev] compiling electron…')
const tsc = spawn(
  'npx',
  ['tsc', '-p', 'tsconfig.electron.json'],
  { stdio: 'inherit', shell: true, cwd: root },
)
await new Promise((resolve, reject) => {
  tsc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('tsc failed'))))
})

// Ensure main exists
if (!fs.existsSync(path.join(root, 'dist-electron', 'main.js'))) {
  console.error('[dev] dist-electron/main.js missing after tsc')
  process.exit(1)
}

// Start vite (plugin starts electron). On plugin kill errors, electron may survive —
// we keep process alive via vite.
const vite = run('npx', ['vite'], {
  env: {
    ...process.env,
    // reduce aggressive restarts if supported
    ELECTRON_RUN_AS_NODE: undefined,
  },
})

const shutdown = () => {
  try {
    vite.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  // best-effort cleanup
  try {
    spawn('taskkill', ['/IM', 'electron.exe', '/F'], { shell: true, stdio: 'ignore' })
  } catch {
    /* ignore */
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

vite.on('exit', (code) => {
  console.log('[dev] vite exited', code)
  process.exit(code ?? 0)
})
