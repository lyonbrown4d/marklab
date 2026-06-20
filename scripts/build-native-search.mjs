import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
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
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
}

if (result.status === 0) {
  process.exit(0)
}

const compiledLibrary = findNewestCompiledLibrary()
if (compiledLibrary && statSync(compiledLibrary).mtimeMs >= newestSourceMtime) {
  const fallbackOutput = path.join(
    nativeSearchRoot,
    `marklab-search-native.${process.platform}-${process.arch}.${Math.trunc(newestSourceMtime)}.node`,
  )
  copyFileSync(compiledLibrary, fallbackOutput)
  console.warn(`Copied native search binary to ${path.relative(repoRoot, fallbackOutput)}.`)
  process.exit(0)
}

process.exit(result.status ?? 1)

function findNewestCompiledLibrary() {
  const targetRoot = path.join(nativeSearchRoot, 'target')
  if (!existsSync(targetRoot)) return null
  return listFiles(targetRoot)
    .filter((file) =>
      [
        'marklab_search_native.dll',
        'libmarklab_search_native.dylib',
        'libmarklab_search_native.so',
      ].includes(path.basename(file)),
    )
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0]
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
  })
}
