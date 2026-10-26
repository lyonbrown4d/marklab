import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const fixturePaths = () => {
  const root = process.env.MARKLAB_TAURI_E2E_ROOT
  if (!root || !path.isAbsolute(root) || fs.realpathSync(root) !== root)
    throw new Error('Run native E2E through e2e/tauri/run.ts')
  const relative = path.relative(fs.realpathSync(os.tmpdir()), root)
  if (
    relative.includes(path.sep) ||
    !relative.startsWith('marklab-tauri-e2e-') ||
    relative.startsWith('..')
  )
    throw new Error('Native E2E root must be an owned temporary fixture')
  if (fs.readFileSync(path.join(root, '.marklab-e2e'), 'utf8') !== 'native-wdio-v1\n')
    throw new Error('Native E2E fixture marker is invalid')
  const data = path.join(root, 'data')
  const cache = path.join(root, 'cache')
  if (process.env.MARKLAB_E2E_DATA_DIR !== data || process.env.MARKLAB_E2E_CACHE_DIR !== cache)
    throw new Error('Native E2E data/cache isolation is required')
  const performance = path.join(root, 'performance')
  return {
    root,
    data,
    cache,
    alpha: path.join(root, 'alpha'),
    beta: path.join(root, 'beta'),
    performance: fs.existsSync(performance) ? performance : undefined,
  }
}
