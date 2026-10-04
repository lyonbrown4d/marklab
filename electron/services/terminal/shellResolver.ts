import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

type FileMetadata = {
  isFile: () => boolean
  mode: number
}

type WhichModule = {
  sync: (
    command: string,
    options: { nothrow: true; path?: string; pathExt?: string },
  ) => string | null
}

export type TerminalShellResolverDependencies = {
  access: (filePath: string, mode: number) => void
  env: NodeJS.ProcessEnv
  findExecutable: (command: string) => string | undefined
  platform: NodeJS.Platform
  stat: (filePath: string) => FileMetadata
}

const require = createRequire(import.meta.url)
const which = require('which') as WhichModule

const defaultDependencies: TerminalShellResolverDependencies = {
  access: fs.accessSync,
  env: process.env,
  findExecutable: (command) => which.sync(command, { nothrow: true }) ?? undefined,
  platform: process.platform,
  stat: fs.statSync,
}

export const resolveTerminalShell = (
  requestedPath?: string | null,
  dependencies: TerminalShellResolverDependencies = defaultDependencies,
): string => {
  const customPath = requestedPath?.trim()
  if (requestedPath !== undefined && requestedPath !== null) {
    if (!customPath) throw new Error('Terminal shell must be an absolute executable file path')
    validateCustomShell(customPath, dependencies)
    return customPath
  }
  return resolvePlatformDefault(dependencies)
}

const validateCustomShell = (
  shellPath: string,
  dependencies: TerminalShellResolverDependencies,
): void => {
  const platformPath = dependencies.platform === 'win32' ? path.win32 : path.posix
  if (!platformPath.isAbsolute(shellPath)) {
    throw new Error('Terminal shell must be an absolute executable file path')
  }

  let metadata: FileMetadata
  try {
    metadata = dependencies.stat(shellPath)
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` (${error.message})` : ''
    throw new Error(`Terminal shell does not exist or cannot be accessed: ${shellPath}${detail}`, {
      cause: error,
    })
  }
  if (!metadata.isFile()) throw new Error(`Terminal shell must point to a file: ${shellPath}`)
  if (dependencies.platform === 'win32') {
    validateWindowsExecutableExtension(shellPath, dependencies.env)
    return
  }
  if ((metadata.mode & 0o111) === 0)
    throw new Error(`Terminal shell is not executable: ${shellPath}`)
  try {
    dependencies.access(shellPath, fs.constants.X_OK)
  } catch (error) {
    throw new Error(`Terminal shell is not executable by the current user: ${shellPath}`, {
      cause: error,
    })
  }
}

const resolvePlatformDefault = (dependencies: TerminalShellResolverDependencies): string => {
  if (dependencies.platform === 'win32') return resolveWindowsShell(dependencies)

  const userShell = dependencies.env.SHELL?.trim()
  if (userShell && isUsableDefault(userShell, dependencies)) return userShell
  const candidates = dependencies.platform === 'darwin' ? ['zsh'] : ['bash', 'sh']
  const discovered = findOptionalExecutable(candidates, dependencies)
  if (discovered) return discovered
  const standardPaths =
    dependencies.platform === 'darwin'
      ? ['/bin/zsh']
      : ['/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/sh']
  const standardShell = standardPaths.find((candidate) => isUsableDefault(candidate, dependencies))
  if (standardShell) return standardShell
  return throwShellNotFound(candidates)
}

const resolveWindowsShell = (dependencies: TerminalShellResolverDependencies): string => {
  const discovered = findWindowsPathExecutable(['pwsh.exe', 'powershell.exe'], dependencies)
  if (discovered) return discovered

  const systemRoot =
    readWindowsEnv(dependencies.env, 'SYSTEMROOT') ?? readWindowsEnv(dependencies.env, 'WINDIR')
  const windowsPowerShell = systemRoot
    ? path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : undefined
  if (windowsPowerShell && isUsableDefault(windowsPowerShell, dependencies)) {
    return windowsPowerShell
  }
  throw new Error(
    'No PowerShell executable was found. Install PowerShell or configure a shell path.',
  )
}

const findWindowsPathExecutable = (
  candidates: string[],
  dependencies: TerminalShellResolverDependencies,
): string | undefined => {
  const pathEntries = normalizedWindowsPathEntries(dependencies.env)
  for (const candidate of candidates) {
    for (const pathEntry of pathEntries) {
      const expectedPath = path.win32.join(pathEntry, candidate)
      const executable = dependencies.findExecutable(expectedPath)
      if (executable && pathsEqualOnWindows(executable, expectedPath)) return executable
    }
  }
  return undefined
}

const normalizedWindowsPathEntries = (env: NodeJS.ProcessEnv): string[] => {
  const pathValue = readWindowsEnv(env, 'PATH') ?? ''
  const uniqueEntries = new Map<string, string>()
  for (const rawEntry of pathValue.split(path.win32.delimiter)) {
    const entry = stripWrappingQuotes(rawEntry.trim())
    if (!path.win32.isAbsolute(entry)) continue
    const normalized = path.win32.normalize(entry)
    if (!uniqueEntries.has(normalized.toLowerCase())) {
      uniqueEntries.set(normalized.toLowerCase(), normalized)
    }
  }
  return [...uniqueEntries.values()]
}

const pathsEqualOnWindows = (left: string, right: string): boolean => {
  return path.win32.normalize(left).toLowerCase() === path.win32.normalize(right).toLowerCase()
}

const validateWindowsExecutableExtension = (shellPath: string, env: NodeJS.ProcessEnv): void => {
  const pathExt = readWindowsEnv(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD'
  const executableExtensions = pathExt
    .split(';')
    .map((extension) => normalizeWindowsExtension(extension))
    .filter(Boolean)
  if (!executableExtensions.includes(path.win32.extname(shellPath).toLowerCase())) {
    throw new Error(`Terminal shell must use a Windows executable extension: ${shellPath}`)
  }
}

const normalizeWindowsExtension = (extension: string): string => {
  const normalized = extension.trim().toLowerCase()
  return normalized && !normalized.startsWith('.') ? `.${normalized}` : normalized
}

const readWindowsEnv = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const entry = Object.entries(env).find(([key]) => key.toUpperCase() === name)
  return entry?.[1]
}

const stripWrappingQuotes = (value: string): string => {
  return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

const throwShellNotFound = (candidates: string[]): never => {
  throw new Error(
    `No supported terminal shell was found (${candidates.join(', ')}). Configure an executable shell path.`,
  )
}

const findOptionalExecutable = (
  candidates: string[],
  dependencies: TerminalShellResolverDependencies,
): string | undefined => {
  for (const candidate of candidates) {
    const executable = dependencies.findExecutable(candidate)
    if (executable) return executable
  }
  return undefined
}

const isUsableDefault = (
  shellPath: string,
  dependencies: TerminalShellResolverDependencies,
): boolean => {
  try {
    validateCustomShell(shellPath, dependencies)
    return true
  } catch {
    return false
  }
}
