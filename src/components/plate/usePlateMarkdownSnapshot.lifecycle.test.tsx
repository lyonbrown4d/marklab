import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import { flushEditorChangesForClose, registerEditorBufferFlusher } from '@/app/editorCloseLifecycle'
import { usePlateMarkdownSnapshot } from '@/components/plate/usePlateMarkdownSnapshot'

type SerializeRequest = {
  markdown: string
  resolve: (markdown: string) => void
  signal: AbortSignal
}

const markdownText = (value: Value) => String(value[0]?.children[0]?.text)

describe('usePlateMarkdownSnapshot close lifecycle', () => {
  it('waits for a replacement when native close interrupts a blur serialization', async () => {
    const requests: SerializeRequest[] = []
    const onSnapshot = vi.fn()
    const editor = { children: [{ type: 'p', children: [{ text: 'Blurred input' }] }] }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: () => vi.fn(),
        serialize: (value, signal) =>
          new Promise<string>((resolve) => {
            requests.push({ markdown: markdownText(value), resolve, signal })
          }),
      }),
    )

    act(() => result.current.queue())
    act(() => result.current.flush())
    const closing = flushEditorChangesForClose()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[0]?.signal.aborted).toBe(true)

    requests[0]?.resolve('stale')
    await Promise.resolve()
    expect(onSnapshot).not.toHaveBeenCalled()
    requests[1]?.resolve('Blurred input')
    await closing

    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('Blurred input')
  })

  it('retries to a stable revision when new input aborts close-time serialization', async () => {
    let scheduled: (() => void) | null = null
    const requests: SerializeRequest[] = []
    const snapshots: string[] = []
    const editor = { children: [{ type: 'p', children: [{ text: 'First' }] }] }
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot: (markdown) => {
          snapshots.push(markdown)
        },
        schedule: (callback) => {
          scheduled = callback
          return vi.fn()
        },
        serialize: (value, signal) =>
          new Promise<string>((resolve) => {
            requests.push({ markdown: markdownText(value), resolve, signal })
          }),
      }),
    )
    const bufferFlush = vi.fn()
    const unregisterBuffer = registerEditorBufferFlusher(bufferFlush)

    act(() => result.current.queue())
    act(() => (scheduled as (() => void) | null)?.())
    const closing = flushEditorChangesForClose()
    await vi.waitFor(() => expect(requests).toHaveLength(2))

    editor.children = [{ type: 'p', children: [{ text: 'Latest' }] }]
    act(() => result.current.queue())
    requests[0]?.resolve('First')
    requests[1]?.resolve('First')

    await vi.waitFor(() => expect(requests).toHaveLength(3))
    expect(bufferFlush).not.toHaveBeenCalled()
    expect(requests[2]?.markdown).toBe('Latest')
    requests[2]?.resolve('Latest')
    await closing

    expect(snapshots).toEqual(['Latest'])
    expect(bufferFlush).toHaveBeenCalledOnce()
    unregisterBuffer()
  })

  it('forces the current editor tree through persistence while IME composition is active', async () => {
    const editor = { children: [{ type: 'p', children: [{ text: 'Initial' }] }] }
    const onSnapshot = vi.fn()
    const serialize = vi.fn(async (value: Value) => markdownText(value))
    const { result } = renderHook(() =>
      usePlateMarkdownSnapshot({
        editor: editor as never,
        onSnapshot,
        schedule: () => vi.fn(),
        serialize,
      }),
    )

    editor.children = [{ type: 'p', children: [{ text: '未确认输入' }] }]
    act(() => result.current.markDirty())
    await flushEditorChangesForClose()

    expect(serialize).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith('未确认输入')
  })
})
