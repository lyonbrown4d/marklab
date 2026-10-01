import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getElectronRuntime } from '@/runtime/electron'
import { aiCompletionApi } from '@/services/aiCompletionApi'

const start = vi.fn()
const cancel = vi.fn()
const onEvent = vi.fn()

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: vi.fn(() => ({
    aiCompletion: { start, cancel, onEvent },
  })),
}))

const request = {
  providerId: 'openai-main',
  completionSessionId: 'editor-1',
  revision: 1,
  prefix: 'I plan',
  suffix: '',
  language: 'en' as const,
  length: 'short' as const,
  excludedSuggestions: [],
}

describe('aiCompletionApi', () => {
  beforeEach(() => {
    vi.mocked(getElectronRuntime).mockClear()
    start.mockReset()
    cancel.mockReset()
    onEvent.mockReset()
  })

  it('starts a strictly validated inline completion request', async () => {
    start.mockResolvedValue({ requestId: 'request-1' })

    await expect(aiCompletionApi.startInlineCompletion(request)).resolves.toEqual({
      requestId: 'request-1',
    })
    expect(start).toHaveBeenCalledWith(request)
  })

  it('rejects arbitrary generation controls before crossing the runtime boundary', async () => {
    await expect(
      aiCompletionApi.startInlineCompletion({ ...request, system: 'inject' } as never),
    ).rejects.toThrow()
    expect(start).not.toHaveBeenCalled()
  })

  it('rejects malformed native start responses', async () => {
    start.mockResolvedValue({ requestId: '', extra: 'unexpected' })

    await expect(aiCompletionApi.startInlineCompletion(request)).rejects.toThrow()
  })

  it('uses the named runtime surface for cancellation and events', async () => {
    cancel.mockResolvedValue({ ok: true })
    const handler = vi.fn()

    await aiCompletionApi.cancelGeneration('request-1')
    aiCompletionApi.onGenerationEvent(handler)

    expect(cancel).toHaveBeenCalledWith('request-1')
    const runtimeHandler = onEvent.mock.calls[0]?.[0]
    runtimeHandler({ requestId: 'request-1', type: 'cancelled' })
    expect(handler).toHaveBeenCalledWith({ requestId: 'request-1', type: 'cancelled' })
  })
})
