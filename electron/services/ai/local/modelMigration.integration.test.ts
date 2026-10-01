import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalAiModelManager } from '@electron/services/ai/local/modelManager.js'
import type { LocalAiCatalogEntry } from '@electron/services/ai/local/types.js'

const roots: string[] = []
const bytes = new TextEncoder().encode('valid-gguf-fixture')

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('local AI model directory migration', () => {
  it('keeps the old directory authoritative until the switching safe point', async () => {
    const root = await createRoot()
    const manager = await installedManager(root)
    const target = path.join(root, 'target')
    await fs.mkdir(target, { recursive: true })
    let releaseSwitch: (() => void) | undefined
    const switchGate = new Promise<void>((resolve) => {
      releaseSwitch = resolve
    })
    const hooks = migrationHooks({ beforeSwitch: vi.fn(async () => switchGate) })

    const migration = manager.startModelDirectoryMigration({ enabled: true, path: target }, hooks)
    await vi.waitFor(() =>
      expect(hooks.onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'switching' }),
      ),
    )

    await expect(manager.modelPath('fixture')).resolves.toBe(
      path.join(root, 'models', 'fixture.gguf'),
    )
    releaseSwitch?.()
    await migration
    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({ state: 'completed' }),
      modelDirectory: await fs.realpath(target),
    })
  })

  it('rolls back to the old directory when copied content fails digest verification', async () => {
    const root = await createRoot()
    const manager = createManager(root)
    const source = path.join(root, 'models')
    await fs.mkdir(source, { recursive: true })
    await fs.writeFile(path.join(source, 'fixture.gguf'), new Uint8Array(bytes.byteLength))
    const target = path.join(root, 'target')
    await fs.mkdir(target, { recursive: true })

    await manager.startModelDirectoryMigration({ enabled: true, path: target }, migrationHooks())

    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({
        state: 'error',
        error: expect.stringMatching(/integrity/i),
      }),
      modelDirectory: source,
    })
    await expect(fs.access(path.join(target, 'fixture.gguf'))).rejects.toThrow()
  })

  it('retains the source with a warning if post-switch cleanup fails', async () => {
    const root = await createRoot()
    const removeFile = vi.fn(async () => {
      throw new Error('locked')
    })
    const manager = await installedManager(root, removeFile)
    const target = path.join(root, 'target')
    await fs.mkdir(target, { recursive: true })

    await manager.startModelDirectoryMigration({ enabled: true, path: target }, migrationHooks())

    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({ state: 'completed', warning: expect.any(String) }),
      modelDirectory: await fs.realpath(target),
    })
    await expect(fs.access(path.join(root, 'models', 'fixture.gguf'))).resolves.toBeUndefined()
  })

  it('refuses an overlapping target and a concurrent migration', async () => {
    const root = await createRoot()
    const manager = await installedManager(root)
    await fs.mkdir(path.join(root, 'models', 'nested'), { recursive: true })
    await manager.startModelDirectoryMigration(
      { enabled: true, path: path.join(root, 'models', 'nested') },
      migrationHooks(),
    )
    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({
        state: 'error',
        error: expect.stringMatching(/overlap/i),
      }),
      modelDirectory: path.join(root, 'models'),
    })

    let releaseSwitch: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      releaseSwitch = resolve
    })
    await fs.mkdir(path.join(root, 'target'), { recursive: true })
    const running = manager.startModelDirectoryMigration(
      { enabled: true, path: path.join(root, 'target') },
      migrationHooks({ beforeSwitch: vi.fn(async () => gate) }),
    )
    await expect(
      Promise.resolve().then(() =>
        manager.startModelDirectoryMigration(
          { enabled: true, path: path.join(root, 'other') },
          migrationHooks(),
        ),
      ),
    ).rejects.toThrow(/busy/i)
    releaseSwitch?.()
    await running
  })

  it('never overwrites an unknown same-name target model', async () => {
    const root = await createRoot()
    const manager = await installedManager(root)
    const target = path.join(root, 'target')
    await fs.mkdir(target, { recursive: true })
    await fs.writeFile(path.join(target, 'fixture.gguf'), new Uint8Array(bytes.byteLength))

    await manager.startModelDirectoryMigration({ enabled: true, path: target }, migrationHooks())

    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({
        state: 'error',
        error: expect.stringMatching(/conflicting/i),
      }),
      modelDirectory: path.join(root, 'models'),
    })
  })

  it('can safely abandon an unavailable custom source for an empty default directory', async () => {
    const root = await createRoot()
    const missingSource = path.join(root, 'detached-volume', 'models')
    const manager = new LocalAiModelManager({
      catalog: [catalog],
      initialDirectoryPreference: { enabled: true, path: missingSource },
      initialDeviceId: 'missing-device',
      minimumFreeBytes: 0,
      userDataPath: root,
    })
    const hooks = migrationHooks()

    await expect(manager.status()).resolves.toMatchObject({
      error: expect.stringMatching(/unavailable/i),
      modelDirectory: missingSource,
    })
    await manager.startModelDirectoryMigration({ enabled: false }, hooks)

    await expect(manager.status()).resolves.toMatchObject({
      customModelDirectoryEnabled: false,
      migration: expect.objectContaining({
        state: 'completed',
        warning: expect.stringMatching(/without migrating or deleting/i),
      }),
      modelDirectory: path.join(root, 'models'),
    })
    expect(hooks.persist).toHaveBeenCalledWith({ enabled: false })
    await expect(fs.access(missingSource)).rejects.toThrow()
  })

  it('refuses to abandon an unavailable source into a non-empty target', async () => {
    const root = await createRoot()
    const missingSource = path.join(root, 'detached-volume', 'models')
    const target = path.join(root, 'target')
    await fs.mkdir(target, { recursive: true })
    await fs.writeFile(path.join(target, 'unrelated.txt'), 'keep')
    const manager = new LocalAiModelManager({
      catalog: [catalog],
      initialDirectoryPreference: { enabled: true, path: missingSource },
      userDataPath: root,
    })

    await manager.startModelDirectoryMigration({ enabled: true, path: target }, migrationHooks())

    await expect(manager.status()).resolves.toMatchObject({
      migration: expect.objectContaining({
        state: 'error',
        error: expect.stringMatching(/must be empty/i),
      }),
      modelDirectory: missingSource,
    })
    await expect(fs.readFile(path.join(target, 'unrelated.txt'), 'utf8')).resolves.toBe('keep')
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-model-migration-'))
  roots.push(root)
  return root
}

const catalog: LocalAiCatalogEntry = {
  fileName: 'fixture.gguf',
  id: 'fixture',
  label: 'Fixture',
  license: 'Apache-2.0',
  recommended: true,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: bytes.byteLength,
  url: 'https://models.example.test/fixture.gguf',
}

const createManager = (root: string, removeFile?: (filePath: string) => Promise<void>) =>
  new LocalAiModelManager({
    catalog: [catalog],
    minimumFreeBytes: 0,
    removeFile,
    userDataPath: root,
  })

const installedManager = async (root: string, removeFile?: (filePath: string) => Promise<void>) => {
  const manager = createManager(root, removeFile)
  const source = path.join(root, 'models')
  await fs.mkdir(source, { recursive: true })
  await fs.writeFile(path.join(source, 'fixture.gguf'), bytes)
  return manager
}

const migrationHooks = (overrides: Record<string, unknown> = {}) => ({
  beforeSwitch: vi.fn(async () => undefined),
  onProgress: vi.fn(),
  persist: vi.fn(async () => undefined),
  ...overrides,
})
