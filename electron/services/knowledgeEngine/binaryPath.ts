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
    candidates.push({
      binaryPath: overridePath,
      exists: existsSync(overridePath),
      source: 'override',
    })
  }

  const resourcesPath = getElectronResourcesPath(app)
  candidates.push({
    binaryPath: path.join(resourcesPath, 'engine', platformDir, binaryName),
    exists: existsSync(path.join(resourcesPath, 'engine', platformDir, binaryName)),
    source: 'packaged',
  })

  candidates.push({
    binaryPath: path.join(projectRoot, 'resources', 'engine', platformDir, binaryName),
    exists: existsSync(path.join(projectRoot, 'resources', 'engine', platformDir, binaryName)),
    source: 'dev-resource',
  })

  candidates.push({
    binaryPath: path.join(projectRoot, 'target', 'release', binaryName),
    exists: existsSync(path.join(projectRoot, 'target', 'release', binaryName)),
    source: 'cargo-target',
  })

  return candidates.find((candidate) => candidate.exists) ?? candidates[0] ?? null
}

const getElectronResourcesPath = (app: App) => {
  const processWithResources = process as typeof process & { resourcesPath?: string }

  return app.isPackaged && processWithResources.resourcesPath
    ? processWithResources.resourcesPath
    : path.join(projectRoot, 'resources')
}
