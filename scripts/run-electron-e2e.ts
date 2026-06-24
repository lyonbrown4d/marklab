import { createRequire } from 'node:module'
import { execa } from 'execa'
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

const run = async (): Promise<void> => {
  const result = await execa(
    process.execPath,
    [playwrightCli, 'test', '-c', 'playwright.electron.config.ts'],
    {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      reject: false,
    },
  )

  process.exit(result.exitCode ?? 1)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
