import { describe, expect, it, vi } from 'vitest'

import { createAiCompletionIpcHandlers } from '@electron/ipc/aiCompletion.js'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types.js'

describe('AI inline completion IPC', () => {
  it('validates the renderer payload before starting a completion', async () => {
    const service = {
      start: vi.fn(async () => ({ requestId: 'request-1' })),
      cancelGeneration: vi.fn(async () => false),
      cancelOwner: vi.fn(async () => undefined),
    } satisfies AiInlineCompletionServiceContract
    const handlers = createAiCompletionIpcHandlers(service)
    const event = createEvent(9)

    await expect(
      handlers.start(
        {
          providerId: 'openai-main',
          completionSessionId: 'editor-1',
          revision: 1,
          prefix: 'I plan',
          suffix: '',
          language: 'en',
          length: 'short',
          excludedSuggestions: [],
          system: 'injected',
        },
        event.value,
      ),
    ).rejects.toThrow()
    expect(service.start).not.toHaveBeenCalled()
  })

  it('routes sanitized generation events to the owner and cleans up destroyed windows', async () => {
    let emit: ((event: { requestId: string; type: 'delta'; delta: string }) => void) | undefined
    const service = {
      start: vi.fn(async (_ownerId, _input, nextEmit) => {
        emit = nextEmit as typeof emit
        return { requestId: 'request-1' }
      }),
      cancelGeneration: vi.fn(async () => false),
      cancelOwner: vi.fn(async () => undefined),
    } satisfies AiInlineCompletionServiceContract
    const handlers = createAiCompletionIpcHandlers(service)
    const event = createEvent(9)

    await handlers.start(
      {
        providerId: 'openai-main',
        completionSessionId: 'editor-1',
        revision: 1,
        prefix: 'I plan',
        suffix: '',
        language: 'en',
        length: 'short',
        excludedSuggestions: [],
      },
      event.value,
    )
    emit?.({ requestId: 'request-1', type: 'delta', delta: ' to write' })

    expect(event.sender.send).toHaveBeenCalledWith('marklab:ai-completion:event', {
      requestId: 'request-1',
      type: 'delta',
      delta: ' to write',
    })
    const destroyed = event.sender.once.mock.calls[0]?.[1]
    destroyed?.()
    expect(service.cancelOwner).toHaveBeenCalledWith(9)
  })

  it('cancels only through the dedicated completion service', async () => {
    const service = {
      start: vi.fn(async () => ({ requestId: 'request-1' })),
      cancelGeneration: vi.fn(async () => true),
      cancelOwner: vi.fn(async () => undefined),
    } satisfies AiInlineCompletionServiceContract
    const handlers = createAiCompletionIpcHandlers(service)
    const event = createEvent(9)

    const requestId = '00000000-0000-4000-8000-000000000001'
    await expect(handlers.cancel(requestId, event.value)).resolves.toEqual({ ok: true })
    expect(service.cancelGeneration).toHaveBeenCalledWith(9, requestId)
  })
})

const createEvent = (id: number) => {
  const sender = {
    id,
    isDestroyed: vi.fn(() => false),
    once: vi.fn(),
    send: vi.fn(),
  }
  return { sender, value: { sender } as never }
}
