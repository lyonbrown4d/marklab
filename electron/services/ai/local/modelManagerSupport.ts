import path from 'node:path'

import { normalizeCustomModelDirectory } from '@electron/services/ai/local/modelDirectoryPaths'
import type {
  LocalAiCatalogEntry,
  LocalAiDirectoryConfig,
  LocalAiModel,
} from '@electron/services/ai/local/types'

export const resolveInitialModelDirectory = (
  config: LocalAiDirectoryConfig | undefined,
  defaultDirectory: string,
): { enabled: boolean; path: string } => {
  if (!config?.enabled) return { enabled: false, path: defaultDirectory }
  try {
    return { enabled: true, path: normalizeCustomModelDirectory(config.path) }
  } catch {
    return { enabled: false, path: defaultDirectory }
  }
}

export const mapLocalAiModels = (
  catalog: Iterable<LocalAiCatalogEntry>,
  installed: ReadonlyMap<string, boolean>,
  activeModelId: string | null,
): LocalAiModel[] =>
  [...catalog].map((entry) => ({
    id: entry.id,
    label: entry.label,
    ...(entry.description ? { description: entry.description } : {}),
    sizeBytes: entry.sizeBytes,
    license: entry.license,
    installed: installed.get(entry.id) ?? false,
    active: entry.id === activeModelId,
    recommended: entry.recommended,
  }))

export const validateModelCatalog = (catalog: readonly LocalAiCatalogEntry[]): void => {
  for (const entry of catalog) {
    if (path.basename(entry.fileName) !== entry.fileName || !entry.fileName.endsWith('.gguf')) {
      throw new Error('Local AI catalog contains an unsafe filename')
    }
    if (new URL(entry.url).protocol !== 'https:') throw new Error('Model URL must use HTTPS')
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Model SHA-256 is invalid')
  }
}

export const isSameOrChildPath = (candidate: string, parent: string): boolean => {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
