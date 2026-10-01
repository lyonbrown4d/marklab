import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalAiModelManager } from '@electron/services/ai/local/modelManager.js'
import type { LocalAiCatalogEntry } from '@electron/services/ai/local/types.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('LocalAiModelManager', () => {
  it('streams an explicit download to a part file, verifies it, and atomically installs it', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const progress = vi.fn()
    const manager = createManager(root, bytes)

    const { taskId } = await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'completed'))

    expect(taskId).toBe('download-1')
    await expect(fs.readFile(path.join(root, 'models', 'fixture.gguf'))).resolves.toEqual(
      Buffer.from(bytes),
    )
    await expect(fs.access(path.join(root, 'models', 'fixture.gguf.part'))).rejects.toThrow()
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'fixture', percent: 100, state: 'completed' }),
    )
  })

  it('rejects unknown model ids without making a network request', async () => {
    const root = await createRoot()
    const fetch = vi.fn()
    const manager = new LocalAiModelManager({
      catalog: [fixtureCatalog(new Uint8Array())],
      fetch,
      taskIdFactory: () => 'download-1',
      userDataPath: root,
    })

    await expect(manager.download('../outside', vi.fn())).rejects.toThrow(/not found/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not install content whose SHA-256 digest differs from the manifest', async () => {
    const root = await createRoot()
    const expected = new TextEncoder().encode('expected')
    const actual = new TextEncoder().encode('tampered')
    const progress = vi.fn()
    const manager = createManager(root, actual, fixtureCatalog(expected))

    await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'error'))

    await expect(fs.access(path.join(root, 'models', 'fixture.gguf'))).rejects.toThrow()
    await expect(fs.access(path.join(root, 'models', 'fixture.gguf.part'))).rejects.toThrow()
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/integrity/i), state: 'error' }),
    )
  })

  it('resumes a partial model using an HTTP byte range', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const catalog = fixtureCatalog(bytes)
    const modelDirectory = path.join(root, 'models')
    await fs.mkdir(modelDirectory, { recursive: true })
    await fs.writeFile(path.join(modelDirectory, 'fixture.gguf.part'), bytes.slice(0, 6))
    const fetch = vi.fn(
      async () => new Response(bytes.slice(6).buffer as ArrayBuffer, { status: 206 }),
    )
    const progress = vi.fn()
    const manager = new LocalAiModelManager({
      catalog: [catalog],
      fetch,
      minimumFreeBytes: 0,
      statfs: vi.fn(async () => ({ bavail: 10_000n, bsize: 4_096n })),
      taskIdFactory: () => 'download-1',
      userDataPath: root,
    })

    await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'completed'))

    expect(fetch).toHaveBeenCalledWith(
      catalog.url,
      expect.objectContaining({ headers: { Range: 'bytes=6-' } }),
    )
    await expect(fs.readFile(path.join(modelDirectory, 'fixture.gguf'))).resolves.toEqual(
      Buffer.from(bytes),
    )
  })

  it('installs a complete part file without issuing another network request', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const modelDirectory = path.join(root, 'models')
    await fs.mkdir(modelDirectory, { recursive: true })
    await fs.writeFile(path.join(modelDirectory, 'fixture.gguf.part'), bytes)
    const fetch = vi.fn(async () => {
      throw new Error('network should not be used')
    })
    const progress = vi.fn()
    const manager = new LocalAiModelManager({
      catalog: [fixtureCatalog(bytes)],
      fetch,
      minimumFreeBytes: 0,
      statfs: vi.fn(async () => ({ bavail: 10_000n, bsize: 4_096n })),
      taskIdFactory: () => 'download-1',
      userDataPath: root,
    })

    await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'completed'))

    expect(fetch).not.toHaveBeenCalled()
    await expect(fs.readFile(path.join(modelDirectory, 'fixture.gguf'))).resolves.toEqual(
      Buffer.from(bytes),
    )
  })

  it('reserves a model download before asynchronous preflight work', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    let releaseFirstSpaceCheck: (() => void) | undefined
    const firstSpaceCheck = new Promise<{ bavail: bigint; bsize: bigint }>((resolve) => {
      releaseFirstSpaceCheck = () => resolve({ bavail: 10_000n, bsize: 4_096n })
    })
    const statfs = vi
      .fn()
      .mockImplementationOnce(async () => firstSpaceCheck)
      .mockResolvedValue({ bavail: 10_000n, bsize: 4_096n })
    let taskIndex = 0
    const manager = new LocalAiModelManager({
      catalog: [fixtureCatalog(bytes)],
      fetch: vi.fn(async () => new Response(bytes, { status: 200 })),
      minimumFreeBytes: 0,
      statfs,
      taskIdFactory: () => `download-${(taskIndex += 1)}`,
      userDataPath: root,
    })

    const firstProgress = vi.fn()
    const first = manager.download('fixture', firstProgress)
    await vi.waitFor(() => expect(statfs).toHaveBeenCalledTimes(1))
    const secondResult = await manager.download('fixture', vi.fn()).then(
      () => 'resolved',
      (error: unknown) => (error instanceof Error ? error.message : 'rejected'),
    )
    releaseFirstSpaceCheck?.()
    await first
    await waitFor(() => firstProgress.mock.calls.some(([event]) => event.state === 'completed'))

    expect(secondResult).toMatch(/already downloading/i)
    expect(statfs).toHaveBeenCalledTimes(1)
  })

  it('cancels an in-flight download and keeps its part file for resume', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const progress = vi.fn()
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 6))
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')),
          )
        },
      })
      return new Response(body, { status: 200 })
    })
    const manager = new LocalAiModelManager({
      catalog: [fixtureCatalog(bytes)],
      fetch,
      minimumFreeBytes: 0,
      statfs: vi.fn(async () => ({ bavail: 10_000n, bsize: 4_096n })),
      taskIdFactory: () => 'download-1',
      userDataPath: root,
    })

    const task = await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'downloading'))
    await manager.cancelDownload(task.taskId)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'cancelled'))

    await expect(fs.stat(path.join(root, 'models', 'fixture.gguf.part'))).resolves.toMatchObject({
      size: 6,
    })
  })

  it('persists the active installed model and supports deletion', async () => {
    const root = await createRoot()
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const progress = vi.fn()
    const manager = createManager(root, bytes)
    await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'completed'))

    await expect(manager.setActiveModel('fixture')).resolves.toEqual({ ok: true })
    await expect(manager.status()).resolves.toMatchObject({
      activeModelId: 'fixture',
      models: [expect.objectContaining({ active: true, installed: true })],
    })

    await expect(manager.deleteModel('fixture')).resolves.toEqual({ ok: true })
    await expect(manager.status()).resolves.toMatchObject({
      activeModelId: null,
      models: [expect.objectContaining({ active: false, installed: false })],
    })
  })

  it('migrates installed models before switching to a validated custom directory', async () => {
    const root = await createRoot()
    const customDirectory = path.join(root, 'custom-models')
    await fs.mkdir(customDirectory, { recursive: true })
    const bytes = new TextEncoder().encode('valid-gguf-fixture')
    const progress = vi.fn()
    const manager = createManager(root, bytes)
    await manager.download('fixture', progress)
    await waitFor(() => progress.mock.calls.some(([event]) => event.state === 'completed'))

    await manager.startModelDirectoryMigration(
      { enabled: true, path: customDirectory },
      migrationHooks(),
    )

    await expect(manager.status()).resolves.toMatchObject({
      activeModelId: null,
      customModelDirectoryEnabled: true,
      defaultModelDirectory: path.join(root, 'models'),
      modelDirectory: path.normalize(customDirectory),
      migration: expect.objectContaining({ state: 'completed' }),
      models: [expect.objectContaining({ installed: true })],
    })
    await expect(fs.access(path.join(root, 'models', 'fixture.gguf'))).rejects.toThrow()
    await expect(fs.readFile(path.join(customDirectory, 'fixture.gguf'))).resolves.toEqual(
      Buffer.from(bytes),
    )
  })

  it('rejects relative, root, and application installation model directories', async () => {
    const root = await createRoot()
    const forbiddenDirectory = path.join(root, 'application')
    const manager = new LocalAiModelManager({
      catalog: [fixtureCatalog(new Uint8Array())],
      forbiddenModelDirectories: [forbiddenDirectory],
      userDataPath: root,
    })

    await expect(
      Promise.resolve().then(() =>
        manager.startModelDirectoryMigration(
          { enabled: true, path: 'relative/models' },
          migrationHooks(),
        ),
      ),
    ).rejects.toThrow(/absolute/i)
    await expect(
      Promise.resolve().then(() =>
        manager.startModelDirectoryMigration(
          { enabled: true, path: path.parse(root).root },
          migrationHooks(),
        ),
      ),
    ).rejects.toThrow(/root/i)
    await expect(
      Promise.resolve().then(() =>
        manager.startModelDirectoryMigration(
          { enabled: true, path: path.join(forbiddenDirectory, 'models') },
          migrationHooks(),
        ),
      ),
    ).rejects.toThrow(/application/i)
  })
})

const createRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-local-ai-'))
  roots.push(root)
  return root
}

const fixtureCatalog = (bytes: Uint8Array): LocalAiCatalogEntry => ({
  description: 'Fixture model',
  fileName: 'fixture.gguf',
  id: 'fixture',
  label: 'Fixture',
  license: 'Apache-2.0',
  recommended: true,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: bytes.byteLength,
  url: 'https://models.example.test/fixture.gguf',
})

const createManager = (
  root: string,
  responseBytes: Uint8Array,
  catalog = fixtureCatalog(responseBytes),
): LocalAiModelManager =>
  new LocalAiModelManager({
    catalog: [catalog],
    fetch: vi.fn(
      async () => new Response(Buffer.from(responseBytes).toString('utf8'), { status: 200 }),
    ),
    minimumFreeBytes: 0,
    statfs: vi.fn(async () => ({ bavail: 10_000n, bsize: 4_096n })),
    taskIdFactory: () => 'download-1',
    userDataPath: root,
  })

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Timed out waiting for model manager state')
}

const migrationHooks = () => ({
  beforeSwitch: vi.fn(async () => undefined),
  onProgress: vi.fn(),
  persist: vi.fn(async () => undefined),
})
