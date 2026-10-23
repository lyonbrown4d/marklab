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
    const onTerminal = vi.fn()
    const { result, unmount } = renderHook(() => useAiGenerationEvents({ onDelta, onTerminal }))
    await act(async () => result.current.listenerReadyRef.current)

    act(() => {
      result.current.requestIdRef.current = 'request-1'
      generationEventMock.handler?.({ requestId: 'request-1', type: 'delta', delta: 'pending' })
    })
    unmount()
    generationEventMock.handler?.({ requestId: 'request-1', type: 'cancelled' })

    expect(frameCallbacks).toHaveLength(0)
    expect(onDelta).not.toHaveBeenCalled()
    expect(onTerminal).not.toHaveBeenCalled()
    expect(generationEventMock.unlisten).toHaveBeenCalledOnce()
  })

  it.each(['finish', 'error', 'cancelled'] as const)(
    'replays only the acknowledged request and preserves an early %s event',
    async (type) => {
      const onDelta = vi.fn()
      const onTerminal = vi.fn()
      const { result } = renderHook(() => useAiGenerationEvents({ onDelta, onTerminal }))
      await act(async () => result.current.listenerReadyRef.current)
      act(() => {
        expect(result.current.beginRequest()).toBe(true)
        expect(result.current.beginRequest()).toBe(false)
        generationEventMock.handler?.({ requestId: 'old', type: 'delta', delta: 'ignored' })
        generationEventMock.handler?.({ requestId: 'current', type: 'delta', delta: 'Hello' })
        const terminal: AiGenerationEvent =
          type === 'finish'
            ? { requestId: 'current', type, finishReason: 'stop', usage: {}, warnings: [] }
            : type === 'error'
              ? { requestId: 'current', type, message: 'Provider unavailable' }
              : { requestId: 'current', type }
        generationEventMock.handler?.(terminal)
        expect(onTerminal).not.toHaveBeenCalled()
        expect(result.current.activateRequest('current')).toBe(true)
      })
      expect(onDelta).toHaveBeenCalledExactlyOnceWith('Hello')
      expect(onTerminal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type }))
      expect(result.current.requestIdRef.current).toBeNull()
    },
  )

  it('clears cancelled startup events before a replacement request', async () => {
    const onDelta = vi.fn()
    const onTerminal = vi.fn()
    const { result } = renderHook(() => useAiGenerationEvents({ onDelta, onTerminal }))
    await act(async () => result.current.listenerReadyRef.current)
    act(() => {
      result.current.beginRequest()
      generationEventMock.handler?.({ requestId: 'old', type: 'delta', delta: 'stale' })
      result.current.clearBufferedDeltas()
      expect(result.current.activateRequest('old')).toBe(false)
      generationEventMock.handler?.({ requestId: 'next', type: 'error', message: 'stale error' })
      result.current.beginRequest()
      generationEventMock.handler?.({ requestId: 'old', type: 'error', message: 'old error' })
      generationEventMock.handler?.({ requestId: 'next', type: 'delta', delta: 'fresh' })
      result.current.activateRequest('next')
      generationEventMock.handler?.({ requestId: 'next', type: 'cancelled' })
    })
    expect(onDelta).toHaveBeenCalledExactlyOnceWith('fresh')
    expect(onTerminal).toHaveBeenCalledExactlyOnceWith({ requestId: 'next', type: 'cancelled' })
  })

  it.each(['count', 'size'] as const)(
    'fails explicitly when the startup %s bound is exceeded',
    async (bound) => {
      const onDelta = vi.fn()
      const onTerminal = vi.fn()
      const { result } = renderHook(() => useAiGenerationEvents({ onDelta, onTerminal }))
      await act(async () => result.current.listenerReadyRef.current)
      act(() => {
        result.current.beginRequest()
        for (let index = 0; index < (bound === 'count' ? 513 : 1); index += 1) {
          generationEventMock.handler?.({
            requestId: 'current',
            type: 'delta',
            delta: bound === 'size' ? 'x'.repeat(256 * 1_024) : 'x',
          })
        }
        expect(result.current.activateRequest('current')).toBe(false)
      })
      expect(onDelta).not.toHaveBeenCalled()
      expect(onTerminal).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          requestId: 'current',
          type: 'error',
          message: expect.stringContaining('buffer limit'),
        }),
      )
      expect(result.current.requestIdRef.current).toBeNull()
      expect(result.current.beginRequest()).toBe(true)
    },
  )
})
