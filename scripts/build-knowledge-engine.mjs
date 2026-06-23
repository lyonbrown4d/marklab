import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const engineDir = path.join(rootDir, 'knowledge-engine')
const manifestPath = path.join(rootDir, 'Cargo.toml')
const binaryName = process.platform === 'win32' ? 'knowledge-engine.exe' : 'knowledge-engine'
const platformDir = `${process.platform}-${process.arch}`
const cargoBinaryPath = path.join(rootDir, 'target', 'release', binaryName)
const outputDir = path.join(rootDir, 'resources', 'engine', platformDir)
const outputBinaryPath = path.join(outputDir, binaryName)
const force = process.argv.includes('--force')

const main = async () => {
  if (!existsSync(manifestPath)) {
    throw new Error(`Knowledge engine manifest not found: ${manifestPath}`)
  }

  if (!force && (await isOutputFresh())) {
    console.log(`[knowledge-engine] up to date: ${outputBinaryPath}`)
    return
  }

  await run('cargo', [
    'build',
    '--manifest-path',
    manifestPath,
    '--bin',
    'knowledge-engine',
    '--release',
  ])
  await mkdir(outputDir, { recursive: true })
  await copyFile(cargoBinaryPath, outputBinaryPath)
  console.log(`[knowledge-engine] built: ${outputBinaryPath}`)
}

const isOutputFresh = async () => {
  if (!existsSync(outputBinaryPath)) {
    return false
  }

  const [output, manifest, newestEngineSourceMtime] = await Promise.all([
    stat(outputBinaryPath),
    stat(manifestPath),
    getNewestSourceMtime(engineDir),
  ])

  return output.mtimeMs >= Math.max(manifest.mtimeMs, newestEngineSourceMtime)
}

const getNewestSourceMtime = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  let newest = 0

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      newest = Math.max(newest, await getNewestSourceMtime(entryPath))
      continue
    }

    if (entry.name.endsWith('.rs') || entry.name === 'Cargo.toml') {
      const current = await stat(entryPath)
      newest = Math.max(newest, current.mtimeMs)
    }
  }

  return newest
}

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
