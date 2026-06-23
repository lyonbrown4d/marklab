import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'

import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(moduleDir, '..', '..', '..')

export const getKnowledgeEngineBinaryName = () =>
  process.platform === 'win32' ? 'knowledge-engine.exe' : 'knowledge-engine'

export const getKnowledgeEnginePlatformDir = () => `${process.platform}-${process.arch}`

export const resolveKnowledgeEngineBinary = (app: App): KnowledgeEngineBinaryResolution | null => {
  const binaryName = getKnowledgeEngineBinaryName()
  const platformDir = getKnowledgeEnginePlatformDir()
  const overridePath = process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH

  const candidates: KnowledgeEngineBinaryResolution[] = []

  if (overridePath) {
    const overrideCandidate = createCandidate(overridePath, 'override')
    if (!overrideCandidate.exists) {
      return overrideCandidate
    }

    candidates.push(overrideCandidate)
  }

  if (app.isPackaged) {
    candidates.push(
      createCandidate(
        path.join(getPackagedResourcesPath(), 'engine', platformDir, binaryName),
        'packaged',
      ),
    )
  }

  candidates.push(
    createCandidate(
      path.join(projectRoot, 'resources', 'engine', platformDir, binaryName),
      'dev-resource',
    ),
  )
  candidates.push(
    createCandidate(path.join(projectRoot, 'target', 'debug', binaryName), 'cargo-target-debug'),
  )
  candidates.push(
    createCandidate(
      path.join(projectRoot, 'target', 'release', binaryName),
      'cargo-target-release',
    ),
  )

  return candidates.find((candidate) => candidate.exists) ?? candidates[0] ?? null
}

const createCandidate = (
  binaryPath: string,
  source: KnowledgeEngineBinaryResolution['source'],
): KnowledgeEngineBinaryResolution => ({
  binaryPath,
  exists: existsSync(binaryPath),
  source,
})

const getPackagedResourcesPath = () => {
  const processWithResources = process as typeof process & { resourcesPath?: string }

  return processWithResources.resourcesPath ?? path.join(projectRoot, 'resources')
}
