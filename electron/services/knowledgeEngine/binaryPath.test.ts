import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { App } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getKnowledgeEngineBinaryName,
  getKnowledgeEnginePlatformDir,
  resolveKnowledgeEngineBinary,
} from '@electron/services/knowledgeEngine/binaryPath.js'

vi.mock('node:fs', () => {
  const existsSync = vi.fn()
  return {
    default: { existsSync },
    existsSync,
  }
})

const existsSyncMock = vi.mocked(existsSync)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const processWithResources = process as typeof process & { resourcesPath?: string }
const originalKnowledgeEnginePath = process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH
const originalResourcesPath = processWithResources.resourcesPath

describe('knowledge engine binary path helpers', () => {
  afterEach(() => {
    existsSyncMock.mockReset()

    if (originalKnowledgeEnginePath === undefined) {
      delete process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH
    } else {
      process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH = originalKnowledgeEnginePath
    }

    if (originalResourcesPath === undefined) {
      Reflect.deleteProperty(processWithResources, 'resourcesPath')
    } else {
      processWithResources.resourcesPath = originalResourcesPath
    }
  })

  it('uses the current platform and architecture for resource folders', () => {
    expect(getKnowledgeEnginePlatformDir()).toBe(`${process.platform}-${process.arch}`)
  })

  it('uses a Windows executable suffix only on Windows', () => {
    expect(getKnowledgeEngineBinaryName().endsWith('.exe')).toBe(process.platform === 'win32')
  })

  it('uses an existing environment override before packaged or local candidates', () => {
    const overridePath = path.join(projectRoot, 'custom-engine', getKnowledgeEngineBinaryName())
    process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH = overridePath
    mockExistingPaths(overridePath)

    expect(resolveKnowledgeEngineBinary(createApp(true))).toMatchObject({
      binaryPath: overridePath,
      exists: true,
      source: 'override',
    })
  })

  it('returns a missing environment override instead of silently falling through', () => {
    const overridePath = path.join(projectRoot, 'missing-engine', getKnowledgeEngineBinaryName())
    process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH = overridePath
    existsSyncMock.mockReturnValue(false)

    expect(resolveKnowledgeEngineBinary(createApp(true))).toMatchObject({
      binaryPath: overridePath,
      exists: false,
      source: 'override',
    })
  })

  it('uses the packaged resources binary for packaged apps', () => {
    processWithResources.resourcesPath = path.join(projectRoot, 'packaged-resources')
    const binaryPath = path.join(
      processWithResources.resourcesPath,
      'engine',
      getKnowledgeEnginePlatformDir(),
      getKnowledgeEngineBinaryName(),
    )
    mockExistingPaths(binaryPath)

    expect(resolveKnowledgeEngineBinary(createApp(true))).toMatchObject({
      binaryPath,
      exists: true,
      source: 'packaged',
    })
  })

  it('uses the dev resource binary before cargo target fallbacks', () => {
    const binaryName = getKnowledgeEngineBinaryName()
    const devResourcePath = path.join(
      projectRoot,
      'resources',
      'engine',
      getKnowledgeEnginePlatformDir(),
      binaryName,
    )
    const debugTargetPath = path.join(projectRoot, 'target', 'debug', binaryName)
    mockExistingPaths(devResourcePath, debugTargetPath)

    expect(resolveKnowledgeEngineBinary(createApp())).toMatchObject({
      binaryPath: devResourcePath,
      exists: true,
      source: 'dev-resource',
    })
  })

  it('falls back to the debug cargo target before the release cargo target', () => {
    const binaryName = getKnowledgeEngineBinaryName()
    const debugTargetPath = path.join(projectRoot, 'target', 'debug', binaryName)
    const releaseTargetPath = path.join(projectRoot, 'target', 'release', binaryName)
    mockExistingPaths(debugTargetPath, releaseTargetPath)

    expect(resolveKnowledgeEngineBinary(createApp())).toMatchObject({
      binaryPath: debugTargetPath,
      exists: true,
      source: 'cargo-target-debug',
    })
  })

  it('falls back to the release cargo target when debug is unavailable', () => {
    const binaryName = getKnowledgeEngineBinaryName()
    const releaseTargetPath = path.join(projectRoot, 'target', 'release', binaryName)
    mockExistingPaths(releaseTargetPath)

    expect(resolveKnowledgeEngineBinary(createApp())).toMatchObject({
      binaryPath: releaseTargetPath,
      exists: true,
      source: 'cargo-target-release',
    })
  })
})

const createApp = (isPackaged = false): App => ({ isPackaged }) as App

const mockExistingPaths = (...paths: string[]) => {
  const normalizedPaths = new Set(paths.map((pathValue) => path.normalize(pathValue)))

  existsSyncMock.mockImplementation((pathValue) =>
    normalizedPaths.has(path.normalize(String(pathValue))),
  )
}
