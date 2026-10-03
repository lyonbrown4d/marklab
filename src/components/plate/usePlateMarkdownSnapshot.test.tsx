import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'
import { schedulePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'
import { flushEditorChangesForClose, registerEditorBufferFlusher } from '@/app/editorCloseLifecycle'

afterEach(() => {
  vi.useRealTimers()
})

describe('usePlateMarkdownSnapshot', () => {
  it('waits for a quiet typing period before requesting idle serialization', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    let idleCallback: IdleRequestCallback | undefined
    const requestIdleCallback = vi.fn((next: IdleRequestCallback) => {
      idleCallback = next
      return 1
    })
    const originalRequestIdleCallback = window.requestIdleCallback
    const originalCancelIdleCallback = window.cancelIdleCallback
    window.requestIdleCallback = requestIdleCallback
    window.cancelIdleCallback = vi.fn()

    const cancel = schedulePlateMarkdownSnapshot(callback)
    vi.advanceTimersByTime(749)
    expect(requestIdleCallback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(requestIdleCallback).toHaveBeenCalledOnce()
    idleCallback?.({ didTimeout: false, timeRemaining: () => 10 })
    expect(callback).toHaveBeenCalledOnce()

    cancel()
    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  it('aborts in-flight stale serialization as soon as more input is queued', () => {
    const signals: AbortSignal[] = []
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: { children: [] } as never,
        onSnapshot: vi.fn(),
        schedule: (callback) => {
          callback()
          return vi.fn()
        },
        serialize: (_value, signal) => {
          signals.push(signal)
          return new Promise<string>(() => undefined)
        },
      }),
    )

    act(() => result.current.queue())
    expect(signals[0]?.aborted).toBe(false)
    act(() => result.current.queue())
    expect(signals[0]?.aborted).toBe(true)
    act(() => result.current.cancel())
  })

  it('serializes only the latest queued value', async () => {
    let scheduled: (() => void) | null = null
    const serialize = vi.fn(async (value: Value) => String(value[0]?.children[0]?.text))
    const onSnapshot = vi.fn()
    const editor = {
      children: [{ type: 'p', children: [{ text: 'First' }] }],
    }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: (callback) => {
          scheduled = callback
          return vi.fn()
        },
        serialize,
      }),
    )

    act(() => result.current.queue())
    editor.children = [{ type: 'p', children: [{ text: 'Latest' }] }]
    act(() => result.current.queue())
    await act(async () => {
      ;(scheduled as (() => void) | null)?.()
      await Promise.resolve()
    })

    expect(serialize).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('Latest')
  })

  it('does not commit an obsolete serialization result', async () => {
    const requests: Array<{ resolve: (markdown: string) => void; value: Value }> = []
    const serialize = vi.fn(
      (value: Value) =>
        new Promise<string>((resolve) => {
          requests.push({ resolve, value })
        }),
    )
    const onSnapshot = vi.fn()
    const editor = {
      children: [{ type: 'p', children: [{ text: 'Old' }] }],
    }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: (callback) => {
          callback()
          return vi.fn()
        },
        serialize,
      }),
    )

    act(() => result.current.queue())
    editor.children = [{ type: 'p', children: [{ text: 'Latest' }] }]
    act(() => result.current.queue())
    await act(async () => {
      requests[0]?.resolve('Old')
      requests[1]?.resolve('Latest')
      await Promise.resolve()
    })

    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('Latest')
  })

  it('flushes immediately without synchronously waiting for serialization', async () => {
    let resolveSnapshot: ((markdown: string) => void) | undefined
    const serialize = vi.fn(() => new Promise<string>((resolve) => (resolveSnapshot = resolve)))
    const onSnapshot = vi.fn()
    const editor = {
      children: [{ type: 'p', children: [{ text: 'Blurred' }] }],
    }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: () => vi.fn(),
        serialize,
      }),
    )

    act(() => result.current.queue())
    act(() => result.current.flush())
    expect(serialize).toHaveBeenCalledOnce()
    expect(onSnapshot).not.toHaveBeenCalled()

    await act(async () => {
      resolveSnapshot?.('Blurred')
      await Promise.resolve()
    })
    expect(onSnapshot).toHaveBeenCalledWith('Blurred')
  })

  it('reports the latest serialization failure', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: { children: [] } as never,
        onError,
        onSnapshot: vi.fn(),
        schedule: (callback) => {
          callback()
          return vi.fn()
        },
        serialize: () => Promise.reject(new Error('Snapshot failed')),
      }),
    )

    await act(async () => {
      result.current.queue()
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Snapshot failed' }))
  })

  it('serializes a queued edit when the editor unmounts before the quiet period', async () => {
    const serialize = vi.fn(async (value: Value) => String(value[0]?.children[0]?.text))
    const onSnapshot = vi.fn()
    const editor = {
      children: [{ type: 'p', children: [{ text: 'Last input' }] }],
    }
    const { result, unmount } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: () => vi.fn(),
        serialize,
      }),
    )

    act(() => result.current.queue())
    unmount()
    await act(async () => Promise.resolve())

    expect(serialize).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('Last input')
  })

  it('restarts an in-flight serialization with the latest value before unmounting', async () => {
    const requests: Array<{
      resolve: (markdown: string) => void
      signal: AbortSignal
      value: Value
    }> = []
    const serialize = vi.fn(
      (value: Value, signal: AbortSignal) =>
        new Promise<string>((resolve) => requests.push({ resolve, signal, value })),
    )
    const onSnapshot = vi.fn()
    const editor = {
      children: [{ type: 'p', children: [{ text: 'First' }] }],
    }
    const { result, unmount } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: (callback) => {
          callback()
          return vi.fn()
        },
        serialize,
      }),
    )

    act(() => result.current.queue())
    editor.children = [{ type: 'p', children: [{ text: 'Last input' }] }]
    act(() => result.current.queue())
    unmount()

    expect(requests).toHaveLength(2)
    expect(requests[0]?.signal.aborted).toBe(true)
    expect(requests[1]?.signal.aborted).toBe(false)
    await act(async () => {
      requests[0]?.resolve('First')
      requests[1]?.resolve('Last input')
      await Promise.resolve()
    })

    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('Last input')
  })

  it('commits input inside the quiet period before the close buffer flush runs', async () => {
    const order: string[] = []
    const editor = {
      children: [{ type: 'p', children: [{ text: 'Closing input' }] }],
    }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot: async () => {
          order.push('updateBuffer')
        },
        schedule: () => vi.fn(),
        serialize: async () => {
          order.push('serialize')
          return 'Closing input'
        },
      }),
    )
    const unregisterBuffer = registerEditorBufferFlusher(async () => {
      order.push('flushBuffers')
    })

    act(() => result.current.queue())
    await flushEditorChangesForClose()

    expect(order).toEqual(['serialize', 'updateBuffer', 'flushBuffers'])
    unregisterBuffer()
  })

  it('rejects native close when the pending snapshot cannot be serialized', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: { children: [] } as never,
        onError,
        onSnapshot: vi.fn(),
        schedule: () => vi.fn(),
        serialize: async () => {
          throw new Error('Snapshot failed')
        },
      }),
    )

    act(() => result.current.queue())

    await expect(flushEditorChangesForClose()).rejects.toThrow('Snapshot failed')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Snapshot failed' }))
    act(() => result.current.cancel())
  })
})
