import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type KnowledgeEngineProfile = 'debug' | 'release'

type BuildBinaryTarget = {
  cargoBin: string
  binaryName: string
  cargoBinaryPath: string
  outputBinaryPath: string
}

type BuildManifestBinary = {
  cargoBin: string
  binaryName: string
  cargoBinaryPath: string
}

type BuildManifest = {
  profile: KnowledgeEngineProfile
  platformDir: string
  binaries: BuildManifestBinary[]
  builtAt: string
}

const readOption = (args: string[], name: string): string | null => {
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

const getProfile = (args: string[]): KnowledgeEngineProfile => {
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

const getExecutableName = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name)

const scriptPath = fileURLToPath(import.meta.url)
const rootDir = path.resolve(path.dirname(scriptPath), '..')
const engineDir = path.join(rootDir, 'knowledge-engine')
const manifestPath = path.join(rootDir, 'Cargo.toml')
const lockfilePath = path.join(rootDir, 'Cargo.lock')
const platformDir = `${process.platform}-${process.arch}`
const args = process.argv.slice(2)
const force = args.includes('--force')
const profile = getProfile(args)
const cargoProfileDir = profile === 'release' ? 'release' : 'debug'
const outputDir = path.join(rootDir, 'resources', 'engine', platformDir)
const outputManifestPath = path.join(outputDir, 'manifest.json')
const binaryTargets = ['knowledge-engine', 'marklab-mcp'].map((cargoBin): BuildBinaryTarget => {
  const binaryName = getExecutableName(cargoBin)

  return {
    cargoBin,
    binaryName,
    cargoBinaryPath: path.join(rootDir, 'target', cargoProfileDir, binaryName),
    outputBinaryPath: path.join(outputDir, binaryName),
  }
})

const main = async (): Promise<void> => {
  if (!existsSync(manifestPath)) {
    throw new Error(`Knowledge engine manifest not found: ${manifestPath}`)
  }

  if (!force && (await isOutputFresh())) {
    console.log(`[knowledge-engine] up to date (${profile}): ${outputDir}`)
    return
  }

  const cargoArgs = ['build', '--manifest-path', manifestPath]
  for (const target of binaryTargets) {
    cargoArgs.push('--bin', target.cargoBin)
  }

  if (profile === 'release') {
    cargoArgs.push('--release')
  }

  await run('cargo', cargoArgs)
  await mkdir(outputDir, { recursive: true })
  await Promise.all(
    binaryTargets.map((target) => copyFile(target.cargoBinaryPath, target.outputBinaryPath)),
  )
  await writeBuildManifest()
  console.log(`[knowledge-engine] built (${profile}): ${outputDir}`)
}

const isOutputFresh = async (): Promise<boolean> => {
  if (!binaryTargets.every((target) => existsSync(target.outputBinaryPath))) {
    return false
  }

  if (!existsSync(outputManifestPath)) {
    return false
  }

  const buildManifest = await readBuildManifest()
  if (
    buildManifest?.profile !== profile ||
    buildManifest?.platformDir !== platformDir ||
    !hasExpectedBinaries(buildManifest)
  ) {
    return false
  }

  const [outputStats, newestInputMtime, newestEngineSourceMtime] = await Promise.all([
    Promise.all(binaryTargets.map((target) => stat(target.outputBinaryPath))),
    getNewestInputMtime(),
    getNewestSourceMtime(engineDir),
  ])
  const oldestOutputMtime = Math.min(...outputStats.map((output) => output.mtimeMs))

  return oldestOutputMtime >= Math.max(newestInputMtime, newestEngineSourceMtime)
}

const hasExpectedBinaries = (buildManifest: BuildManifest): boolean => {
  if (!Array.isArray(buildManifest.binaries)) return false

  const manifestBinaries = new Set(
    buildManifest.binaries.map((binary) => `${binary.cargoBin}:${binary.binaryName}`),
  )

  return binaryTargets.every((target) =>
    manifestBinaries.has(`${target.cargoBin}:${target.binaryName}`),
  )
}

const getNewestSourceMtime = async (directory: string): Promise<number> => {
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

const getNewestInputMtime = async (): Promise<number> => {
  const inputPaths = [scriptPath, manifestPath, lockfilePath].filter((inputPath) =>
    existsSync(inputPath),
  )
  const stats = await Promise.all(inputPaths.map((inputPath) => stat(inputPath)))

  return Math.max(...stats.map((inputStat) => inputStat.mtimeMs))
}

const readBuildManifest = async (): Promise<BuildManifest | null> => {
  try {
    return JSON.parse(await readFile(outputManifestPath, 'utf8')) as BuildManifest
  } catch {
    return null
  }
}

const writeBuildManifest = async (): Promise<void> => {
  const buildManifest: BuildManifest = {
    profile,
    platformDir,
    binaries: binaryTargets.map((target) => ({
      cargoBin: target.cargoBin,
      binaryName: target.binaryName,
      cargoBinaryPath: path.relative(rootDir, target.cargoBinaryPath),
    })),
    builtAt: new Date().toISOString(),
  }

  await writeFile(outputManifestPath, `${JSON.stringify(buildManifest, null, 2)}\n`)
}

const run = (command: string, args: string[]): Promise<void> =>
  execa(command, args, {
    cwd: rootDir,
    shell: false,
    stdio: 'inherit',
    windowsHide: true,
  }).then(() => undefined)

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
