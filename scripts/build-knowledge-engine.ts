import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const readOption = (args, name) => {
  const inlineArg = args.find((arg) => arg.startsWith(`${name}=`))
  if (inlineArg) {
    const value = inlineArg.slice(name.length + 1)
    if (!value) throw new Error(`Missing value for ${name}`)
    return value
  }

  const optionIndex = args.indexOf(name)
  if (optionIndex === -1) {
    return null
  }

  const value = args[optionIndex + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}

const getProfile = (args) => {
  if (args.includes('--debug')) {
    return 'debug'
  }

  if (args.includes('--release')) {
    return 'release'
  }

  const profile = readOption(args, '--profile') ?? 'release'
  if (profile !== 'debug' && profile !== 'release') {
    throw new Error(`Unsupported knowledge engine profile: ${profile}`)
  }

  return profile
}

const scriptPath = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(scriptPath), '..')
const engineDir = path.join(rootDir, 'knowledge-engine')
const manifestPath = path.join(rootDir, 'Cargo.toml')
const lockfilePath = path.join(rootDir, 'Cargo.lock')
const binaryName = process.platform === 'win32' ? 'knowledge-engine.exe' : 'knowledge-engine'
const platformDir = `${process.platform}-${process.arch}`
const args = process.argv.slice(2)
const force = args.includes('--force')
const profile = getProfile(args)
const cargoProfileDir = profile === 'release' ? 'release' : 'debug'
const cargoBinaryPath = path.join(rootDir, 'target', cargoProfileDir, binaryName)
const outputDir = path.join(rootDir, 'resources', 'engine', platformDir)
const outputBinaryPath = path.join(outputDir, binaryName)
const outputManifestPath = path.join(outputDir, 'manifest.json')

const main = async () => {
  if (!existsSync(manifestPath)) {
    throw new Error(`Knowledge engine manifest not found: ${manifestPath}`)
  }

  if (!force && (await isOutputFresh())) {
    console.log(`[knowledge-engine] up to date (${profile}): ${outputBinaryPath}`)
    return
  }

  const cargoArgs = ['build', '--manifest-path', manifestPath, '--bin', 'knowledge-engine']

  if (profile === 'release') {
    cargoArgs.push('--release')
  }

  await run('cargo', cargoArgs)
  await mkdir(outputDir, { recursive: true })
  await copyFile(cargoBinaryPath, outputBinaryPath)
  await writeBuildManifest()
  console.log(`[knowledge-engine] built (${profile}): ${outputBinaryPath}`)
}

const isOutputFresh = async () => {
  if (!existsSync(outputBinaryPath) || !existsSync(outputManifestPath)) {
    return false
  }

  const buildManifest = await readBuildManifest()
  if (
    buildManifest?.profile !== profile ||
    buildManifest?.platformDir !== platformDir ||
    buildManifest?.binaryName !== binaryName
  ) {
    return false
  }

  const [output, newestInputMtime, newestEngineSourceMtime] = await Promise.all([
    stat(outputBinaryPath),
    getNewestInputMtime(),
    getNewestSourceMtime(engineDir),
  ])

  return output.mtimeMs >= Math.max(newestInputMtime, newestEngineSourceMtime)
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

    if (
      entry.name.endsWith('.rs') ||
      entry.name.endsWith('.proto') ||
      entry.name === 'Cargo.toml'
    ) {
      const current = await stat(entryPath)
      newest = Math.max(newest, current.mtimeMs)
    }
  }

  return newest
}

const getNewestInputMtime = async () => {
  const inputPaths = [scriptPath, manifestPath, lockfilePath].filter((inputPath) =>
    existsSync(inputPath),
  )
  const stats = await Promise.all(inputPaths.map((inputPath) => stat(inputPath)))

  return Math.max(...stats.map((inputStat) => inputStat.mtimeMs))
}

const readBuildManifest = async () => {
  try {
    return JSON.parse(await readFile(outputManifestPath, 'utf8'))
  } catch {
    return null
  }
}

const writeBuildManifest = async () => {
  const buildManifest = {
    profile,
    platformDir,
    binaryName,
    cargoBinaryPath: path.relative(rootDir, cargoBinaryPath),
    builtAt: new Date().toISOString(),
  }

  await writeFile(outputManifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`)
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
