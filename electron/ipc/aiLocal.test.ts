import { describe, expect, it, vi } from 'vitest'

import { createAiCommandHandlers } from '@electron/ipc/ai'
import type { AiServiceContract } from '@electron/services/ai/types'
import type { LocalAiServiceContract } from '@electron/services/ai/local/types'

describe('local AI IPC ownership', () => {
  it('adapts existing cloud providers to the streaming event contract', async () => {
    const cloud = {
      generateText: vi.fn(async () => ({
        text: 'cloud result',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        warnings: [],
      })),
    } as unknown as AiServiceContract
    const handlers = createAiCommandHandlers(cloud)
    const sender = {
      id: 12,
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn(),
    }

    const started = await handlers.ai_start_generation(
      { providerId: 'openai-main', prompt: 'hello' },
      { sender } as never,
    )
    expect(started).toEqual({ requestId: expect.any(String) })
    expect(sender.send).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledTimes(2))

    expect(sender.send).toHaveBeenNthCalledWith(
      1,
      'ai-generation-event',
      expect.objectContaining({ delta: 'cloud result', type: 'delta' }),
    )
    expect(sender.send).toHaveBeenNthCalledWith(
      2,
      'ai-generation-event',
      expect.objectContaining({ finishReason: 'stop', type: 'finish' }),
    )
  })

  it('routes generation events only to the invoking renderer', async () => {
    const cloud = {} as AiServiceContract
    const local = createLocalService()
    const handlers = createAiCommandHandlers(cloud, local)
    const sender = {
      id: 41,
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn(),
    }
    const event = { sender } as never

    await handlers.ai_start_generation({ providerId: 'marklab-local', prompt: 'hello' }, event)
    const emit = vi.mocked(local.startGeneration).mock.calls[0]?.[2]
    emit?.({ requestId: 'request-1', type: 'delta', delta: 'hi' })

    expect(sender.send).toHaveBeenCalledWith('ai-generation-event', {
      requestId: 'request-1',
      type: 'delta',
      delta: 'hi',
    })
    expect(local.startGeneration).toHaveBeenCalledWith(41, expect.anything(), expect.any(Function))
  })

  it('cancels owned work when the renderer is destroyed', async () => {
    const local = createLocalService()
    const handlers = createAiCommandHandlers({} as AiServiceContract, local)
    let destroyed: (() => void) | undefined
    const sender = {
      id: 23,
      isDestroyed: vi.fn(() => false),
      once: vi.fn((_event: string, listener: () => void) => {
        destroyed = listener
      }),
      send: vi.fn(),
    }

    await handlers.ai_start_generation({ providerId: 'marklab-local', prompt: 'hello' }, {
      sender,
    } as never)
    destroyed?.()

    expect(local.cancelOwner).toHaveBeenCalledWith(23)
  })

  it('ignores a renderer-close race while sending an event', async () => {
    const local = createLocalService()
    const handlers = createAiCommandHandlers({} as AiServiceContract, local)
    const sender = {
      id: 24,
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
      send: vi.fn(() => {
        throw new Error('Object has been destroyed')
      }),
    }

    await handlers.ai_start_generation({ providerId: 'marklab-local', prompt: 'hello' }, {
      sender,
    } as never)
    const emit = vi.mocked(local.startGeneration).mock.calls[0]?.[2]

    expect(() => emit?.({ requestId: 'request-1', type: 'delta', delta: 'hi' })).not.toThrow()
  })

  it('selects and applies a model directory through explicit commands', async () => {
    const local = createLocalService()
    const selectDirectory = vi.fn(async () => 'D:/models')
    const handlers = createAiCommandHandlers({} as AiServiceContract, local, selectDirectory)
    const event = {
      sender: { id: 25, isDestroyed: vi.fn(() => false), once: vi.fn(), send: vi.fn() },
    } as never

    await expect(handlers.ai_local_select_model_directory(undefined, event)).resolves.toEqual({
      path: 'D:/models',
    })
    await handlers.ai_local_set_model_directory({ enabled: true, path: 'D:/models' }, event)

    expect(selectDirectory).toHaveBeenCalledWith(event, 'C:/models')
    expect(local.setModelDirectory).toHaveBeenCalledWith(
      { enabled: true, path: 'D:/models' },
      expect.any(Function),
    )
  })
})

const createLocalService = (): LocalAiServiceContract => ({
  cancelDownload: vi.fn(async () => ({ ok: true as const })),
  cancelGeneration: vi.fn(async () => ({ ok: true as const })),
  cancelOwner: vi.fn(async () => undefined),
  deleteModel: vi.fn(async () => ({ ok: true as const })),
  dispose: vi.fn(async () => undefined),
  download: vi.fn(async () => ({ taskId: 'task-1' })),
  setModelDirectory: vi.fn(async () => ({
    activeModelId: null,
    customModelDirectoryEnabled: false,
    defaultModelDirectory: 'C:/models',
    modelDirectory: 'C:/models',
    models: [],
    runtime: 'idle' as const,
  })),
  setActiveModel: vi.fn(async () => ({ ok: true as const })),
  startGeneration: vi.fn(async () => ({ requestId: 'request-1' })),
  status: vi.fn(async () => ({
    activeModelId: null,
    customModelDirectoryEnabled: false,
    defaultModelDirectory: 'C:/models',
    modelDirectory: 'C:/models',
    models: [],
    runtime: 'idle' as const,
  })),
})
