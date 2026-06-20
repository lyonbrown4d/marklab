import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nativeSearchRoot = path.join(repoRoot, 'native', 'search')
const force = process.argv.includes('--force') || process.env.MARKLAB_FORCE_NATIVE_SEARCH_BUILD === '1'

const sourceFiles = [
  path.join(nativeSearchRoot, 'Cargo.toml'),
  path.join(nativeSearchRoot, 'build.rs'),
  path.join(nativeSearchRoot, 'package.json'),
  ...readdirSync(path.join(nativeSearchRoot, 'src'))
    .filter((file) => file.endsWith('.rs'))
    .map((file) => path.join(nativeSearchRoot, 'src', file)),
]

const nativeOutputs = readdirSync(nativeSearchRoot)
  .filter((file) => file.endsWith('.node'))
  .map((file) => path.join(nativeSearchRoot, file))

const newestSourceMtime = Math.max(...sourceFiles.map((file) => statSync(file).mtimeMs))
const newestOutputMtime =
  nativeOutputs.length > 0 ? Math.max(...nativeOutputs.map((file) => statSync(file).mtimeMs)) : 0

if (!force && nativeOutputs.some(existsSync) && newestOutputMtime >= newestSourceMtime) {
  console.log('Native search binary is up to date.')
  process.exit(0)
}

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(pnpm, ['--dir', nativeSearchRoot, 'build'], {
  cwd: repoRoot,
  shell: false,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
