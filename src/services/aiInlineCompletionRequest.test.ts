import { describe, expect, it, vi } from 'vitest'
import type { AiGenerationEvent } from '@/services/aiApi'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import type { AiInlineCompletionRequest } from '@/types/aiCompletion'

const input: AiInlineCompletionRequest = {
  completionSessionId: 'editor-1',
  excludedSuggestions: [],
  language: 'auto',
  length: 'short',
  prefix: 'I plan',
  providerId: 'provider-1',
  revision: 1,
  suffix: '',
}

const createTransport = () => {
  let handler: ((event: AiGenerationEvent) => void) | null = null
  const unlisten = vi.fn()
  return {
    cancelGeneration: vi.fn(async () => undefined),
    emit: (event: AiGenerationEvent) => handler?.(event),
    onGenerationEvent: vi.fn(async (next: (event: AiGenerationEvent) => void) => {
      handler = next
      return unlisten
    }),
    startInlineCompletion: vi.fn(async () => ({ requestId: 'request-1' })),
    unlisten,
  }
}

describe('requestAiInlineCompletion', () => {
  it('subscribes before starting and collects a candidate emitted before start resolves', async () => {
    const transport = createTransport()
    transport.startInlineCompletion.mockImplementationOnce(async () => {
      transport.emit({ requestId: 'request-1', type: 'delta', delta: ' to write' })
      transport.emit({
        requestId: 'request-1',
        type: 'finish',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      })
      return { requestId: 'request-1' }
    })

    await expect(
      requestAiInlineCompletion(input, new AbortController().signal, transport),
    ).resolves.toBe(' to write')
    expect(transport.onGenerationEvent.mock.invocationCallOrder[0]).toBeLessThan(
      transport.startInlineCompletion.mock.invocationCallOrder[0]!,
    )
    expect(transport.unlisten).toHaveBeenCalledOnce()
  })

  it('retains the current request terminal event after more than 32 unrelated pre-start events', async () => {
    const transport = createTransport()
    const controller = new AbortController()
    transport.startInlineCompletion.mockImplementationOnce(async () => {
      for (let index = 0; index < 40; index += 1) {
        transport.emit({ requestId: `other-${index}`, type: 'delta', delta: 'wrong' })
      }
      transport.emit({ requestId: 'request-1', type: 'delta', delta: ' expected' })
      transport.emit({
        requestId: 'request-1',
        type: 'finish',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      })
      return { requestId: 'request-1' }
    })

    const pending = requestAiInlineCompletion(input, controller.signal, transport)
    const result = await Promise.race([
      pending,
      new Promise<'timed-out'>((resolve) => setTimeout(() => resolve('timed-out'), 50)),
    ])
    if (result === 'timed-out') {
      controller.abort()
      await pending.catch(() => undefined)
    }

    expect(result).toBe(' expected')
    expect(transport.unlisten).toHaveBeenCalledOnce()
  })

  it('ignores events for another request', async () => {
    const transport = createTransport()
    const pending = requestAiInlineCompletion(input, new AbortController().signal, transport)
    await vi.waitFor(() => expect(transport.startInlineCompletion).toHaveBeenCalled())
    transport.emit({ requestId: 'other', type: 'delta', delta: 'wrong' })
    transport.emit({ requestId: 'request-1', type: 'delta', delta: ' right' })
    transport.emit({
      requestId: 'request-1',
      type: 'finish',
      finishReason: 'stop',
      usage: {},
      warnings: [],
    })

    await expect(pending).resolves.toBe(' right')
  })

  it('cancels the backend request when aborted', async () => {
    const transport = createTransport()
    const controller = new AbortController()
    const pending = requestAiInlineCompletion(input, controller.signal, transport)
    await vi.waitFor(() => expect(transport.startInlineCompletion).toHaveBeenCalled())
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(transport.cancelGeneration).toHaveBeenCalledWith('request-1')
    expect(transport.unlisten).toHaveBeenCalledOnce()
  })

  it('rejects sanitized provider errors', async () => {
    const transport = createTransport()
    const pending = requestAiInlineCompletion(input, new AbortController().signal, transport)
    await vi.waitFor(() => expect(transport.startInlineCompletion).toHaveBeenCalled())
    transport.emit({ requestId: 'request-1', type: 'error', message: 'Provider unavailable' })

    await expect(pending).rejects.toThrow('Provider unavailable')
    expect(transport.unlisten).toHaveBeenCalledOnce()
  })
})
