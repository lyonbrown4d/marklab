import { existsSync } from 'node:fs'
import path from 'node:path'
import type { App } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getKnowledgeEngineBinaryName,
  getKnowledgeEnginePlatformDir,
  getMarklabMcpBinaryName,
  resolveKnowledgeEngineBinary,
  resolveMarklabMcpBinary,
} from '@electron/services/knowledgeEngine/binaryPath.js'

vi.mock('node:fs', () => {
  const existsSync = vi.fn()
  return {
    default: { existsSync },
    existsSync,
  }
})

const existsSyncMock = vi.mocked(existsSync)
const projectRoot = path.resolve(process.cwd())
const processWithResources = process as typeof process & { resourcesPath?: string }
const originalKnowledgeEnginePath = process.env.MARKLAB_KNOWLEDGE_ENGINE_PATH
const originalMcpPath = process.env.MARKLAB_MCP_PATH
const originalProjectRoot = process.env.MARKLAB_PROJECT_ROOT
const originalResourcesPath = processWithResources.resourcesPath

describe('knowledge engine binary path helpers', () => {
  afterEach(() => {
    existsSyncMock.mockReset()
    restoreEnv('MARKLAB_KNOWLEDGE_ENGINE_PATH', originalKnowledgeEnginePath)
    restoreEnv('MARKLAB_MCP_PATH', originalMcpPath)
    restoreEnv('MARKLAB_PROJECT_ROOT', originalProjectRoot)

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
    expect(getMarklabMcpBinaryName().endsWith('.exe')).toBe(process.platform === 'win32')
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

  it('uses MARKLAB_PROJECT_ROOT before app path candidates in dev', () => {
    const projectRootOverride = path.join(projectRoot, 'custom-root')
    const binaryPath = path.join(
      projectRootOverride,
      'resources',
      'engine',
      getKnowledgeEnginePlatformDir(),
      getKnowledgeEngineBinaryName(),
    )
    process.env.MARKLAB_PROJECT_ROOT = projectRootOverride
    mockExistingPaths(binaryPath)

    expect(
      resolveKnowledgeEngineBinary(createApp(false, path.join(projectRoot, 'dist-electron'))),
    ).toMatchObject({
      binaryPath,
      exists: true,
      source: 'dev-resource',
    })
  })

  it('falls back to cwd resources when app path points at dist-electron', () => {
    const binaryPath = path.join(
      projectRoot,
      'resources',
      'engine',
      getKnowledgeEnginePlatformDir(),
      getKnowledgeEngineBinaryName(),
    )
    mockExistingPaths(binaryPath)

    expect(
      resolveKnowledgeEngineBinary(createApp(false, path.join(projectRoot, 'dist-electron'))),
    ).toMatchObject({
      binaryPath,
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

  it('resolves the MarkLab MCP sidecar from the same packaged engine resource directory', () => {
    processWithResources.resourcesPath = path.join(projectRoot, 'packaged-resources')
    const binaryPath = path.join(
      processWithResources.resourcesPath,
      'engine',
      getKnowledgeEnginePlatformDir(),
      getMarklabMcpBinaryName(),
    )
    mockExistingPaths(binaryPath)

    expect(resolveMarklabMcpBinary(createApp(true))).toMatchObject({
      binaryPath,
      exists: true,
      source: 'packaged',
    })
  })

  it('uses a dedicated MCP environment override', () => {
    const overridePath = path.join(projectRoot, 'custom-mcp', getMarklabMcpBinaryName())
    process.env.MARKLAB_MCP_PATH = overridePath
    mockExistingPaths(overridePath)

    expect(resolveMarklabMcpBinary(createApp(true))).toMatchObject({
      binaryPath: overridePath,
      exists: true,
      source: 'override',
    })
  })
})

const createApp = (isPackaged = false, appPath = projectRoot): App =>
  ({
    getAppPath: () => appPath,
    isPackaged,
  }) as App

const mockExistingPaths = (...paths: string[]) => {
  const normalizedPaths = new Set(paths.map((pathValue) => path.normalize(pathValue)))

  existsSyncMock.mockImplementation((pathValue) =>
    normalizedPaths.has(path.normalize(String(pathValue))),
  )
}

const restoreEnv = (name: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}
