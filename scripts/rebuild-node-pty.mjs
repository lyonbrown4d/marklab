import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const nativeBuildHome = path.join(repoRoot, '.native-build', 'home')
const electronGypDir = path.join(nativeBuildHome, '.electron-gyp')

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      HOME: nativeBuildHome,
      USERPROFILE: nativeBuildHome,
      npm_config_devdir: process.env.npm_config_devdir || electronGypDir,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const shouldSkipRebuild = process.env.SKIP_NODE_PTY_REBUILD === '1'

if (shouldSkipRebuild) {
  console.log('Skipping node-pty rebuild because SKIP_NODE_PTY_REBUILD=1')
  process.exit(0)
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
  const nodePtyRoot = path.dirname(require.resolve('node-pty/package.json', { paths: [repoRoot] }))
  const stagingRoot = path.join(repoRoot, '.native-build', 'node-pty')
  const stagingNodePtyRoot = path.join(stagingRoot, 'node_modules', 'node-pty')
  const packageJsonContent = JSON.stringify({ name: 'pty', version: '1.0.0', private: true }, null, 2)

  await rm(stagingRoot, { force: true, recursive: true })
  await mkdir(stagingRoot, { recursive: true })
  await writeFile(path.join(stagingRoot, 'package.json'), `${packageJsonContent}\n`)

  await mkdir(path.join(stagingRoot, 'node_modules'), { recursive: true })
  await cp(nodePtyRoot, stagingNodePtyRoot, { recursive: true })

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
