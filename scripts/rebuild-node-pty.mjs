import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'))

const normalizeVersion = (version) => {
  if (!version) throw new Error('Missing Electron version')
  return version.replace(/^[^\d]*/, '')
}

const removeSpectreMitigation = async (file) => {
  const source = await readFile(file, 'utf8')
  const next = source.replace(
    /\r?\n\s*'msvs_configuration_attributes':\s*{\s*\r?\n\s*'SpectreMitigation':\s*'Spectre'\s*\r?\n\s*},/g,
    '',
  )
  await writeFile(file, next)
}

const rebuildInPlace = async () => {
  run(electronRebuildBin(), ['-f', '-w', 'node-pty'], repoRoot)
}

const electronRebuildBin = () =>
  path.join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild',
  )

const rebuildWindowsFromShortPath = async () => {
  const packageJson = await readJson(path.join(repoRoot, 'package.json'))
  const electronVersion = normalizeVersion(packageJson.devDependencies?.electron)
  const nodePtyVersion = normalizeVersion(packageJson.dependencies?.['node-pty'])
  const nodePtyRoot = path.dirname(require.resolve('node-pty/package.json', { paths: [repoRoot] }))
  const stagingRoot = path.join(repoRoot, '.native-build', 'node-pty')

  await rm(stagingRoot, { force: true, recursive: true })
  await mkdir(stagingRoot, { recursive: true })

  run('npm', ['init', '-y'], stagingRoot)
  run(
    'npm',
    ['install', `node-pty@${nodePtyVersion}`, '--ignore-scripts', '--no-audit', '--no-fund'],
    stagingRoot,
  )

  const stagingNodePtyRoot = path.join(stagingRoot, 'node_modules', 'node-pty')
  await removeSpectreMitigation(path.join(stagingNodePtyRoot, 'binding.gyp'))
  await removeSpectreMitigation(path.join(stagingNodePtyRoot, 'deps', 'winpty', 'src', 'winpty.gyp'))

  run(electronRebuildBin(), ['-f', '-v', electronVersion, '-w', 'node-pty'], stagingRoot)
  run('node', ['scripts/post-install.js'], stagingNodePtyRoot)

  await rm(path.join(nodePtyRoot, 'build', 'Release'), { force: true, recursive: true })
  await mkdir(path.join(nodePtyRoot, 'build'), { recursive: true })
  await cp(
    path.join(stagingNodePtyRoot, 'build', 'Release'),
    path.join(nodePtyRoot, 'build', 'Release'),
    { force: true, recursive: true },
  )
}

if (process.platform === 'win32') {
  await rebuildWindowsFromShortPath()
} else {
  await rebuildInPlace()
}
