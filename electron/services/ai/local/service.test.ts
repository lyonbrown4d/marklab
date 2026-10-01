import { describe, expect, it, vi } from 'vitest'

import { LocalAiService } from '@electron/services/ai/local/service.js'
import type {
  LocalAiGenerationEvent,
  LocalAiModelManagerContract,
  LocalAiRuntimeContract,
} from '@electron/services/ai/local/types.js'

describe('LocalAiService', () => {
  it('creates trusted request ids and begins streaming after the start call resolves', async () => {
    const events: LocalAiGenerationEvent[] = []
    const runtime = createRuntime()
    const service = createService(runtime)

    const started = await service.startGeneration(
      7,
      { providerId: 'marklab-local', prompt: '重写这段 Markdown' },
      (event) => events.push(event),
    )

    expect(started).toEqual({ requestId: 'request-1' })
    expect(runtime.generate).not.toHaveBeenCalled()
    await new Promise((resolve) => setImmediate(resolve))
    expect(runtime.generate).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-1' }),
      expect.any(Function),
    )
  })

  it('only allows the owning renderer to cancel a generation request', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.generate).mockImplementation(async () => new Promise(() => undefined))
    const service = createService(runtime)
    const started = await service.startGeneration(
      7,
      { providerId: 'marklab-local', prompt: 'hello' },
      vi.fn(),
    )
    await new Promise((resolve) => setImmediate(resolve))

    await service.cancelGeneration(8, started.requestId)
    expect(runtime.cancel).not.toHaveBeenCalled()
    await service.cancelGeneration(7, started.requestId)
    expect(runtime.cancel).toHaveBeenCalledWith(started.requestId)
  })

  it('cancels every request owned by a destroyed renderer', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.generate).mockImplementation(async () => new Promise(() => undefined))
    const service = createService(runtime, ['request-1', 'request-2'])
    await service.startGeneration(9, { providerId: 'marklab-local', prompt: 'one' }, vi.fn())
    await service.startGeneration(9, { providerId: 'marklab-local', prompt: 'two' }, vi.fn())
    await new Promise((resolve) => setImmediate(resolve))

    await service.cancelOwner(9)

    expect(runtime.cancel).toHaveBeenCalledWith('request-1')
    expect(runtime.cancel).toHaveBeenCalledWith('request-2')
  })

  it('does not start runtime work when an active preflight is cancelled', async () => {
    const runtime = createRuntime()
    const events: LocalAiGenerationEvent[] = []
    let resolveStatus: ((status: ReturnType<typeof modelStatus>) => void) | undefined
    const status = new Promise<ReturnType<typeof modelStatus>>((resolve) => {
      resolveStatus = resolve
    })
    const manager = createManager({
      status: vi
        .fn()
        .mockImplementationOnce(async () => status)
        .mockResolvedValue(modelStatus()),
    })
    const service = new LocalAiService({
      modelManager: manager,
      requestIdFactory: () => 'request-1',
      runtime,
    })
    const started = await service.startGeneration(
      7,
      { providerId: 'marklab-local', prompt: 'hello' },
      (event) => events.push(event),
    )
    await vi.waitFor(() => expect(manager.status).toHaveBeenCalled())

    await service.cancelGeneration(7, started.requestId)
    resolveStatus?.(modelStatus())
    await new Promise((resolve) => setImmediate(resolve))

    expect(events).toEqual([{ requestId: 'request-1', type: 'cancelled' }])
    expect(manager.modelPath).not.toHaveBeenCalled()
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('cancels active preflight and queued work for an owner', async () => {
    const runtime = createRuntime()
    const events: LocalAiGenerationEvent[] = []
    let resolveStatus: ((status: ReturnType<typeof modelStatus>) => void) | undefined
    const status = new Promise<ReturnType<typeof modelStatus>>((resolve) => {
      resolveStatus = resolve
    })
    const manager = createManager({ status: vi.fn(async () => status) })
    const ids = ['request-1', 'request-2']
    const service = new LocalAiService({
      modelManager: manager,
      requestIdFactory: () => ids.shift() ?? 'unexpected',
      runtime,
    })
    await service.startGeneration(7, { providerId: 'marklab-local', prompt: 'one' }, (event) =>
      events.push(event),
    )
    await service.startGeneration(7, { providerId: 'marklab-local', prompt: 'two' }, (event) =>
      events.push(event),
    )
    await vi.waitFor(() => expect(manager.status).toHaveBeenCalled())

    await service.cancelOwner(7)
    resolveStatus?.(modelStatus())
    await new Promise((resolve) => setImmediate(resolve))

    expect(events).toEqual(
      expect.arrayContaining([
        { requestId: 'request-1', type: 'cancelled' },
        { requestId: 'request-2', type: 'cancelled' },
      ]),
    )
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('rejects cloud provider ids at the local generation boundary', async () => {
    const service = createService(createRuntime())

    await expect(
      service.startGeneration(1, { providerId: 'openai-main', prompt: 'hello' }, vi.fn()),
    ).rejects.toThrow(/marklab-local/i)
  })

  it('bounds queued generation work', async () => {
    const runtime = createRuntime()
    vi.mocked(runtime.generate).mockImplementation(async () => new Promise(() => undefined))
    const service = createService(runtime, ['request-1', 'request-2'], 1)
    await service.startGeneration(1, { providerId: 'marklab-local', prompt: 'one' }, vi.fn())

    await expect(
      service.startGeneration(1, { providerId: 'marklab-local', prompt: 'two' }, vi.fn()),
    ).rejects.toThrow(/queue is full/i)
  })

  it('persists and applies a custom model directory while idle', async () => {
    const runtime = createRuntime()
    const manager = createManager({
      status: vi.fn(async () => ({
        activeModelId: null,
        customModelDirectoryEnabled: true,
        defaultModelDirectory: 'C:/default-models',
        modelDirectory: 'D:/models',
        models: [],
      })),
    })
    const persistModelDirectory = vi.fn(async () => undefined)
    const service = new LocalAiService({ modelManager: manager, persistModelDirectory, runtime })

    await expect(
      service.setModelDirectory({ enabled: true, path: 'D:/models' }),
    ).resolves.toMatchObject({
      customModelDirectoryEnabled: true,
      defaultModelDirectory: 'C:/default-models',
      modelDirectory: 'D:/models',
    })
    expect(manager.startModelDirectoryMigration).toHaveBeenCalledWith(
      { enabled: true, path: 'D:/models' },
      expect.any(Object),
    )
    await vi.waitFor(() => expect(persistModelDirectory).toHaveBeenCalled())
    expect(persistModelDirectory).toHaveBeenCalledWith({ enabled: true, path: 'D:/models' })
    expect(runtime.dispose).toHaveBeenCalled()
  })

  it('waits for generation preflight before committing a directory switch', async () => {
    const runtime = createRuntime()
    let resolveStatus: ((status: ReturnType<typeof modelStatus>) => void) | undefined
    const status = new Promise<ReturnType<typeof modelStatus>>((resolve) => {
      resolveStatus = resolve
    })
    const manager = createManager({
      status: vi
        .fn()
        .mockImplementationOnce(async () => status)
        .mockResolvedValue(modelStatus()),
    })
    const persistModelDirectory = vi.fn(async () => undefined)
    const service = new LocalAiService({ modelManager: manager, persistModelDirectory, runtime })
    await service.startGeneration(7, { providerId: 'marklab-local', prompt: 'hello' }, vi.fn())
    await vi.waitFor(() => expect(manager.status).toHaveBeenCalled())

    await service.setModelDirectory({ enabled: true, path: 'D:/models' })
    expect(persistModelDirectory).not.toHaveBeenCalled()
    resolveStatus?.(modelStatus())
    await vi.waitFor(() => expect(persistModelDirectory).toHaveBeenCalled())
  })
})

const createRuntime = (): LocalAiRuntimeContract => ({
  cancel: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
  generate: vi.fn(async (request, emit) => {
    emit({
      requestId: request.requestId,
      type: 'finish',
      finishReason: 'stop',
      usage: {},
      warnings: [],
    })
  }),
  getError: vi.fn(() => undefined),
  getStatus: vi.fn(() => 'idle' as const),
})

const createService = (
  runtime: LocalAiRuntimeContract,
  ids = ['request-1'],
  maxQueuedGenerations?: number,
): LocalAiService => {
  const manager = createManager()
  let index = 0
  return new LocalAiService({
    modelManager: manager,
    requestIdFactory: () => ids[index++] ?? `request-${index}`,
    runtime,
    ...(maxQueuedGenerations === undefined ? {} : { maxQueuedGenerations }),
  })
}

const createManager = (
  overrides: Partial<LocalAiModelManagerContract> = {},
): LocalAiModelManagerContract => ({
  cancelDownload: vi.fn(async () => ({ ok: true as const })),
  deleteModel: vi.fn(async () => ({ ok: true as const })),
  download: vi.fn(async () => ({ taskId: 'task-1' })),
  hasActiveDownloads: vi.fn(() => false),
  isMigrationActive: vi.fn(() => false),
  modelPath: vi.fn(async () => 'C:/models/fixture.gguf'),
  setActiveModel: vi.fn(async () => ({ ok: true as const })),
  startModelDirectoryMigration: vi.fn((config, hooks) =>
    Promise.resolve().then(async () => {
      hooks.onProgress({
        state: 'switching',
        from: 'C:/models',
        to: config.path ?? 'C:/models',
        copiedBytes: 0,
        totalBytes: 0,
        percent: 100,
      })
      await hooks.beforeSwitch()
      await hooks.persist(config)
    }),
  ),
  status: vi.fn(async () => modelStatus()),
  ...overrides,
})

const modelStatus = () => ({
  activeModelId: 'fixture',
  customModelDirectoryEnabled: false,
  defaultModelDirectory: 'C:/models',
  modelDirectory: 'C:/models',
  models: [],
})
