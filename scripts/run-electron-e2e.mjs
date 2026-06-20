import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const playwrightCli = require.resolve('@playwright/test/cli')
const env = { ...process.env }

for (const key of Object.keys(env)) {
  if (/^(npm|pnpm)_/i.test(key)) {
    delete env[key]
  }
}

const result = spawnSync(process.execPath, [playwrightCli, 'test', '-c', 'playwright.electron.config.ts'], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
