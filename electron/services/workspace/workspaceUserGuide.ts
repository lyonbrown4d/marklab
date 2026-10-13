import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizePersistedRendererValue } from '@electron/services/settingsStoreSchemas'

type GuideLocale = 'zh-CN' | 'en-US'
type GuideState = { version: 1; status: 'pending' | 'done'; locale: GuideLocale }

const STATE_FILE = 'workspace-user-guide.json'
const GUIDE_DIRECTORY = 'User Guide'

export const workspaceUserGuideLocale = (
  preferences: unknown,
  systemLocale: string,
): GuideLocale => {
  const saved = normalizePersistedRendererValue(preferences)?.state?.locale
  const locale = typeof saved === 'string' ? saved : systemLocale
  return locale.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export const workspaceUserGuideAssetsPath = ({
  appPath,
  isPackaged,
  resourcesPath,
}: {
  appPath: string
  isPackaged: boolean
  resourcesPath: string
}): string => {
  if (isPackaged) return path.join(resourcesPath, 'workspace-guide')
  // Electron also supports launching the compiled main.js directly during development/E2E.
  const projectRoot = path.basename(appPath) === 'dist-electron' ? path.dirname(appPath) : appPath
  return path.join(projectRoot, 'resources', 'workspace-guide')
}

// Startup completes this task before any workspace window opens; the single-instance lock owns writes.
export const initializeWorkspaceUserGuide = async ({
  assetsPath,
  userDataPath,
  locale,
}: {
  assetsPath: string
  userDataPath: string
  locale: GuideLocale
}): Promise<void> => {
  const statePath = path.join(userDataPath, STATE_FILE)
  const previous = await readGuideState(statePath)
  if (previous?.status === 'done') return
  const selectedLocale = previous?.locale ?? locale
  const source = path.join(assetsPath, selectedLocale)
  const sourceGuide = path.join(source, GUIDE_DIRECTORY)
  // Check bundled resources before claiming a destination, so an incomplete package remains retryable.
  const [sourceInfo] = await Promise.all([
    fs.stat(sourceGuide),
    fs.access(path.join(source, 'Home.md')),
  ])
  if (!sourceInfo.isDirectory()) throw new Error('Bundled user guide is not a directory')
  const root = path.join(userDataPath, 'workspace')
  await fs.mkdir(root, { recursive: true })
  const rootInfo = await fs.lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('Default workspace user guide requires a regular workspace directory')
  }
  const destination = path.join(root, GUIDE_DIRECTORY)
  if (!previous) {
    const existing = await fs.lstat(destination).catch((error: unknown) => {
      if (hasCode(error, 'ENOENT')) return null
      throw error
    })
    if (existing) {
      // A user-owned folder (including a symlink) is never merged with shipped content.
      await writeGuideState(statePath, { version: 1, status: 'done', locale: selectedLocale })
      return
    }
    // Publish ownership before creating the folder, so an interrupted startup can resume.
    await writeGuideState(statePath, { version: 1, status: 'pending', locale: selectedLocale })
  }
  await fs.mkdir(destination, { recursive: true })
  const destinationInfo = await fs.lstat(destination)
  if (!destinationInfo.isDirectory() || destinationInfo.isSymbolicLink()) {
    throw new Error('User guide destination is no longer a regular directory')
  }
  // These small, bundled files use Node's bulk copy; retries preserve every existing user edit.
  await fs.cp(sourceGuide, destination, { recursive: true, force: false, errorOnExist: false })
  const entries = await fs.readdir(root)
  if (!entries.some((name) => name.toLowerCase() === 'home.md')) {
    try {
      await fs.copyFile(
        path.join(source, 'Home.md'),
        path.join(root, 'Home.md'),
        constants.COPYFILE_EXCL,
      )
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error
    }
  }
  await writeGuideState(statePath, { version: 1, status: 'done', locale: selectedLocale })
}

const readGuideState = async (statePath: string): Promise<GuideState | null> => {
  const info = await fs.lstat(statePath).catch((error: unknown) => {
    if (hasCode(error, 'ENOENT')) return null
    throw error
  })
  if (!info) return null
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('User guide state is not a regular file')
  const state: unknown = JSON.parse(await fs.readFile(statePath, 'utf8'))
  if (!state || typeof state !== 'object' || Array.isArray(state))
    throw new Error('Invalid user guide state')
  const value = state as Record<string, unknown>
  if (
    value.version !== 1 ||
    (value.status !== 'pending' && value.status !== 'done') ||
    (value.locale !== 'zh-CN' && value.locale !== 'en-US')
  )
    throw new Error('Invalid user guide state')
  return { version: 1, status: value.status, locale: value.locale }
}

const writeGuideState = async (statePath: string, state: GuideState): Promise<void> => {
  const text = `${JSON.stringify(state)}\n`
  const temporary = `${statePath}.${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporary, text, { flag: 'wx' })
    await fs.rename(temporary, statePath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code
