import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'

afterEach(() => {
  vi.useRealTimers()
})

describe('usePlateMarkdownSnapshot', () => {
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
})
