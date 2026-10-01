import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import { listen } from '@/runtime/events'
import { aiApi } from '@/services/aiApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn() }))

const publicProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai',
  model: 'gpt-5-mini',
  hasApiKey: true,
  apiKeySource: 'stored',
  maskedApiKey: '••••••••',
  createdAt: '2026-09-30T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
}

describe('aiApi', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(listen).mockReset()
  })

  it('validates public provider responses and never models a plaintext key', async () => {
    vi.mocked(invoke).mockResolvedValue([publicProvider])

    await expect(aiApi.listProviders()).resolves.toEqual([publicProvider])
    expect(invoke).toHaveBeenCalledWith('ai_list_providers')
  })

  it('sends bounded generation requests and validates the result', async () => {
    vi.mocked(invoke).mockResolvedValue({
      text: 'Hello',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    })
    const request = { providerId: 'openai-main', prompt: 'Hi', maxOutputTokens: 16 }

    await expect(aiApi.generateText(request)).resolves.toMatchObject({ text: 'Hello' })
    expect(invoke).toHaveBeenCalledWith('ai_generate_text', request)
  })

  it('rejects native responses that attempt to expose a plaintext API key', async () => {
    vi.mocked(invoke).mockResolvedValue([{ ...publicProvider, apiKey: 'leaked-secret' }])
    await expect(aiApi.listProviders()).rejects.toThrow()
  })

  it('starts and cancels a validated streaming generation', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ requestId: 'request-1' })
      .mockResolvedValueOnce({ ok: true })

    await expect(
      aiApi.startGeneration({ providerId: 'openai-main', prompt: 'Rewrite this' }),
    ).resolves.toEqual({ requestId: 'request-1' })
    await expect(aiApi.cancelGeneration('request-1')).resolves.toBeUndefined()

    expect(invoke).toHaveBeenNthCalledWith(1, 'ai_start_generation', {
      providerId: 'openai-main',
      prompt: 'Rewrite this',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'ai_cancel_generation', {
      requestId: 'request-1',
    })
  })

  it('validates every generation event before delivering it', async () => {
    const unlisten = vi.fn()
    vi.mocked(listen).mockResolvedValue(unlisten)
    const handler = vi.fn()

    await expect(aiApi.onGenerationEvent(handler)).resolves.toBe(unlisten)
    const runtimeHandler = vi.mocked(listen).mock.calls[0]?.[1]
    runtimeHandler?.({
      event: 'ai-generation-event',
      id: 1,
      payload: { requestId: 'request-1', type: 'delta', delta: 'Hello' },
    })

    expect(handler).toHaveBeenCalledWith({
      requestId: 'request-1',
      type: 'delta',
      delta: 'Hello',
    })
    expect(() =>
      runtimeHandler?.({
        event: 'ai-generation-event',
        id: 2,
        payload: { requestId: 'request-1', type: 'delta', html: '<script />' },
      }),
    ).toThrow()
  })

  it('validates local runtime status, commands, and progress events', async () => {
    const status = {
      runtime: 'ready',
      activeModelId: 'qwen3-8b',
      modelDirectory: 'C:\\MarkLab\\models',
      defaultModelDirectory: 'C:\\MarkLab\\models',
      customModelDirectoryEnabled: false,
      models: [
        {
          id: 'qwen3-8b',
          label: 'Qwen 3 8B',
          sizeBytes: 5_000,
          license: 'Apache-2.0',
          installed: true,
          active: true,
          recommended: true,
        },
      ],
    }
    vi.mocked(invoke).mockResolvedValueOnce(status).mockResolvedValueOnce({ taskId: 'task-1' })
    vi.mocked(listen).mockResolvedValue(vi.fn())

    await expect(aiApi.localStatus()).resolves.toEqual(status)
    await expect(aiApi.downloadLocalModel('qwen3-8b')).resolves.toEqual({ taskId: 'task-1' })
    const handler = vi.fn()
    await aiApi.onLocalModelProgress(handler)
    const runtimeHandler = vi.mocked(listen).mock.calls[0]?.[1]
    runtimeHandler?.({
      event: 'ai-local-progress',
      id: 1,
      payload: {
        taskId: 'task-1',
        modelId: 'qwen3-8b',
        state: 'downloading',
        downloadedBytes: 500,
        totalBytes: 5_000,
        percent: 10,
      },
    })

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ percent: 10 }))
  })

  it('selects, updates, and subscribes to local model directory migration', async () => {
    const status = {
      runtime: 'idle',
      activeModelId: null,
      models: [],
      modelDirectory: 'D:\\MarkLab Models',
      defaultModelDirectory: 'C:\\MarkLab\\models',
      customModelDirectoryEnabled: false,
      migration: {
        migrationId: 'migration-1',
        state: 'copying',
        from: 'C:\\MarkLab\\models',
        to: 'D:\\MarkLab Models',
        copiedBytes: 50,
        totalBytes: 100,
        percent: 50,
      },
    }
    vi.mocked(invoke)
      .mockResolvedValueOnce({ path: 'D:\\MarkLab Models' })
      .mockResolvedValueOnce(status)
    vi.mocked(listen).mockResolvedValue(vi.fn())

    await expect(aiApi.selectLocalModelDirectory()).resolves.toEqual({
      path: 'D:\\MarkLab Models',
    })
    await expect(
      aiApi.setLocalModelDirectory({ enabled: true, path: 'D:\\MarkLab Models' }),
    ).resolves.toEqual(status)
    const handler = vi.fn()
    await aiApi.onLocalModelDirectoryProgress(handler)
    vi.mocked(listen).mock.calls[0]?.[1]({
      event: 'ai-local-directory-progress',
      id: 1,
      payload: status.migration,
    })

    expect(invoke).toHaveBeenNthCalledWith(1, 'ai_local_select_model_directory')
    expect(invoke).toHaveBeenNthCalledWith(2, 'ai_local_set_model_directory', {
      enabled: true,
      path: 'D:\\MarkLab Models',
    })
    expect(handler).toHaveBeenCalledWith(status.migration)
  })

  it('validates successful local cancellation, deletion, and activation', async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true })

    await expect(aiApi.cancelLocalModelDownload('task-1')).resolves.toBeUndefined()
    await expect(aiApi.deleteLocalModel('model-1')).resolves.toBeUndefined()
    await expect(aiApi.setActiveLocalModel('model-2')).resolves.toBeUndefined()

    expect(invoke).toHaveBeenNthCalledWith(1, 'ai_local_cancel_download', { taskId: 'task-1' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'ai_local_delete_model', { modelId: 'model-1' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'ai_local_set_active_model', { modelId: 'model-2' })
  })
})
