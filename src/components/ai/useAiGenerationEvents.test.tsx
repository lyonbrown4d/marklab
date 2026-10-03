import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAiGenerationEvents } from '@/components/ai/useAiGenerationEvents'
import type { AiGenerationEvent } from '@/services/aiApi'

const generationEventMock = vi.hoisted(() => ({
  handler: null as ((event: AiGenerationEvent) => void) | null,
  onGenerationEvent: vi.fn(),
  unlisten: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({
  aiApi: {
    onGenerationEvent: generationEventMock.onGenerationEvent,
  },
}))

describe('useAiGenerationEvents', () => {
  let nextFrameId = 0
  let frameCallbacks: Map<number, FrameRequestCallback>

  beforeEach(() => {
    frameCallbacks = new Map()
    nextFrameId = 0
    generationEventMock.handler = null
    generationEventMock.onGenerationEvent.mockReset()
    generationEventMock.unlisten.mockReset()
    generationEventMock.onGenerationEvent.mockImplementation(
      (handler: (event: AiGenerationEvent) => void) => {
        generationEventMock.handler = handler
        return Promise.resolve(generationEventMock.unlisten)
      },
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const frameId = ++nextFrameId
      frameCallbacks.set(frameId, callback)
      return frameId
    })
    vi.stubGlobal('cancelAnimationFrame', (frameId: number) => {
      frameCallbacks.delete(frameId)
    })
  })

  it('batches matching deltas until the next frame and flushes before a terminal event', async () => {
    const onDelta = vi.fn()
    const onTerminal = vi.fn()
    const { result } = renderHook(() => useAiGenerationEvents({ onDelta, onTerminal }))
    await act(async () => result.current.listenerReadyRef.current)

    act(() => {
      result.current.requestIdRef.current = 'request-1'
      generationEventMock.handler?.({ requestId: 'other-request', type: 'delta', delta: 'ignored' })
      generationEventMock.handler?.({ requestId: 'request-1', type: 'delta', delta: 'Hello' })
      generationEventMock.handler?.({ requestId: 'request-1', type: 'delta', delta: ' world' })
    })

    expect(onDelta).not.toHaveBeenCalled()
    expect(frameCallbacks).toHaveLength(1)

    act(() => {
      generationEventMock.handler?.({
        finishReason: 'stop',
        requestId: 'request-1',
        type: 'finish',
        usage: {},
        warnings: [],
      })
    })

    expect(onDelta).toHaveBeenCalledOnce()
    expect(onDelta).toHaveBeenCalledWith('Hello world')
    expect(onTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'request-1', type: 'finish' }),
    )
    expect(result.current.requestIdRef.current).toBeNull()
    expect(frameCallbacks).toHaveLength(0)
  })

  it('cancels buffered deltas and unregisters the listener on cleanup', async () => {
    const onDelta = vi.fn()
    const { result, unmount } = renderHook(() =>
      useAiGenerationEvents({ onDelta, onTerminal: vi.fn() }),
    )
    await act(async () => result.current.listenerReadyRef.current)

    act(() => {
      result.current.requestIdRef.current = 'request-1'
      generationEventMock.handler?.({ requestId: 'request-1', type: 'delta', delta: 'pending' })
    })
    unmount()

    expect(frameCallbacks).toHaveLength(0)
    expect(onDelta).not.toHaveBeenCalled()
    expect(generationEventMock.unlisten).toHaveBeenCalledOnce()
  })
})
