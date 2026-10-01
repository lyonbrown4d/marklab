import fs from 'node:fs/promises'
import path from 'node:path'

import {
  hasCanonicalDirectoryIdentity,
  prepareModelDirectoryTarget,
} from '@electron/services/ai/local/modelDirectoryPaths.js'
import { fileExistsWithSize, sha256File } from '@electron/services/ai/local/modelFiles.js'
import { copyInstalledModels } from '@electron/services/ai/local/modelMigration.js'
import type {
  LocalAiCatalogEntry,
  LocalAiDirectoryConfig,
  LocalAiDirectoryMigration,
  LocalAiDirectoryMigrationHooks,
} from '@electron/services/ai/local/types.js'

type MigrationOptions = {
  catalog: readonly LocalAiCatalogEntry[]
  config: LocalAiDirectoryConfig
  customDirectoryEnabled: boolean
  forbiddenDirectories: readonly string[]
  from: string
  initial: LocalAiDirectoryMigration
  readActiveModelId: (directory: string) => Promise<string | null>
  removeFile: (filePath: string) => Promise<void>
  to: string
  hooks: LocalAiDirectoryMigrationHooks
}

type MigrationResult = {
  deviceId?: string
  directory: string
  warning?: string
}

export const runModelDirectoryMigration = async (
  options: MigrationOptions,
): Promise<MigrationResult> => {
  if (options.customDirectoryEnabled && !(await isDirectory(options.from))) {
    return abandonUnavailableSource(options)
  }
  const prepared = await prepareModelDirectoryTarget(
    options.from,
    options.to,
    options.forbiddenDirectories,
    !options.customDirectoryEnabled,
    !options.config.enabled,
  )
  let current = update(options, options.initial, {
    state: 'copying',
    from: prepared.from,
    to: prepared.to,
  })
  let copiedFiles: string[] = []
  if (!prepared.same) {
    copiedFiles = await copyInstalledModels({
      activeModelId: await options.readActiveModelId(prepared.from),
      entries: options.catalog,
      from: prepared.from,
      migrationId: current.migrationId,
      onProgress: (progress) => {
        current = update(options, current, progress)
      },
      to: prepared.to,
    })
  }
  current = update(options, current, { state: 'switching' })
  await options.hooks.beforeSwitch()
  await options.hooks.persist(
    options.config.enabled ? { enabled: true, path: prepared.to } : { enabled: false },
  )
  const warning = prepared.same
    ? undefined
    : await cleanupSource(options, prepared.from, prepared.fromDeviceId, copiedFiles)
  return {
    directory: prepared.to,
    ...(options.config.enabled ? { deviceId: (await fs.stat(prepared.to)).dev.toString() } : {}),
    ...(warning ? { warning } : {}),
  }
}

const abandonUnavailableSource = async (options: MigrationOptions): Promise<MigrationResult> => {
  if (!options.config.enabled) await fs.mkdir(options.to, { recursive: true })
  const target = await fs.realpath(options.to).catch(() => null)
  const stats = target ? await fs.stat(target).catch(() => null) : null
  if (!target || !stats?.isDirectory()) {
    throw new Error('Recovery model directory is unavailable')
  }
  const root = path.parse(target).root
  if (samePath(target, root))
    throw new Error('Custom model directory must not be a filesystem root')
  for (const forbidden of options.forbiddenDirectories) {
    const canonicalForbidden = await fs.realpath(forbidden).catch(() => path.resolve(forbidden))
    if (isSameOrChildPath(target, canonicalForbidden)) {
      throw new Error('Custom model directory must not be inside the application directory')
    }
  }
  if ((await fs.readdir(target)).length > 0) {
    throw new Error('Recovery model directory must be empty')
  }
  update(options, options.initial, { state: 'switching', from: options.from, to: target })
  await options.hooks.beforeSwitch()
  await options.hooks.persist(
    options.config.enabled ? { enabled: true, path: target } : { enabled: false },
  )
  return {
    directory: target,
    ...(options.config.enabled ? { deviceId: stats.dev.toString() } : {}),
    warning:
      'The previous model directory was unavailable; MarkLab switched directories without migrating or deleting its models',
  }
}

const cleanupSource = async (
  options: MigrationOptions,
  directory: string,
  expectedDeviceId: string,
  copiedFiles: string[],
): Promise<string | undefined> => {
  if (!(await hasCanonicalDirectoryIdentity(directory, directory, expectedDeviceId))) {
    return 'Models were migrated, but the old directory identity changed and was not cleaned'
  }
  const safePaths: string[] = []
  for (const fileName of copiedFiles) {
    const entry = options.catalog.find((candidate) => candidate.fileName === fileName)
    const filePath = path.join(directory, fileName)
    if (
      !entry ||
      !(await fileExistsWithSize(filePath, entry.sizeBytes)) ||
      (await sha256File(filePath)) !== entry.sha256
    ) {
      return 'Models were migrated, but changed old files were retained for safety'
    }
    safePaths.push(filePath)
  }
  safePaths.push(path.join(directory, '.marklab-local-ai.json'))
  const results = await Promise.allSettled(safePaths.map(options.removeFile))
  return results.some((result) => result.status === 'rejected')
    ? 'Models were migrated, but some old files could not be removed'
    : undefined
}

const update = (
  options: MigrationOptions,
  current: LocalAiDirectoryMigration,
  change: Partial<LocalAiDirectoryMigration> & { state: LocalAiDirectoryMigration['state'] },
): LocalAiDirectoryMigration => {
  const copiedBytes = change.copiedBytes ?? current.copiedBytes
  const totalBytes = change.totalBytes ?? current.totalBytes
  const migration = {
    ...current,
    ...change,
    copiedBytes,
    totalBytes,
    percent:
      totalBytes === 0
        ? change.state === 'copying'
          ? 0
          : 100
        : Math.min(100, (copiedBytes / totalBytes) * 100),
  }
  options.hooks.onProgress(migration)
  return migration
}

const isDirectory = async (directory: string): Promise<boolean> =>
  fs
    .stat(directory)
    .then((stats) => stats.isDirectory())
    .catch(() => false)

const isSameOrChildPath = (candidate: string, parent: string): boolean => {
  const relative = path.relative(fold(parent), fold(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const samePath = (left: string, right: string): boolean => fold(left) === fold(right)
const fold = (value: string): string =>
  process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value
