import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => ({
  requests: [] as Array<{ markdown: string; resolve: (value: Value) => void }>,
  streams: [] as Array<{
    emit: (value: Value) => Promise<void>
    markdown: string
    resolve: () => void
    signal?: AbortSignal
  }>,
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  loadPlateMarkdown: (_editor: unknown, markdown: string) =>
    new Promise<Value>((resolve) => workerMock.requests.push({ markdown, resolve })),
  streamPlateMarkdown: (
    _editor: unknown,
    markdown: string,
    onChunk: (value: Value) => Promise<void>,
    signal?: AbortSignal,
  ) =>
    new Promise<void>((resolve) =>
      workerMock.streams.push({ emit: onChunk, markdown, resolve, signal }),
    ),
}))

import { usePlateAsyncInitialValue } from '@/components/plate/usePlateAsyncInitialValue'

const createStreamingEditor = () => {
  const observedOperations: unknown[][] = []
  const editor = {
    api: { onChange: vi.fn(() => observedOperations.push([...editor.operations])) },
    children: [] as Value,
    history: { redos: [] as unknown[], undos: [] as unknown[] },
    marks: null as unknown,
    operations: [] as unknown[],
    selection: null as unknown,
    tf: {
      insertNodes: (nodes: Value, options: { at: [number] }) => {
        editor.children.splice(options.at[0], 0, ...nodes)
        editor.operations.push({ type: 'insert_node' })
        void Promise.resolve().then(() => {
          editor.api.onChange()
          editor.operations = []
        })
      },
      withoutNormalizing: (apply: () => void) => apply(),
    },
  }
  return { editor, observedOperations }
}

beforeEach(() => {
  workerMock.requests.length = 0
  workerMock.streams.length = 0
})

describe('usePlateAsyncInitialValue', () => {
  it('signals ready for an editor initialized synchronously with a small document', () => {
    const onStatusChange = vi.fn()
    const editor = {
      api: { onChange: vi.fn() },
      children: [{ type: 'p', children: [{ text: 'Small' }] }] as Value,
    }

    const { result } = renderHook(() =>
      usePlateAsyncInitialValue({
        editor: editor as never,
        enabled: false,
        onStatusChange,
        value: 'Small',
      }),
    )

    expect(result.current).toBe(true)
    expect(onStatusChange).toHaveBeenCalledWith({ phase: 'ready' })
  })

  it('hydrates large values in bounded commits and stays read-only until the final chunk', async () => {
    const { editor } = createStreamingEditor()
    editor.history = { redos: ['old'], undos: ['old'] }
    editor.marks = { bold: true }
    editor.operations = [{ type: 'old' }]
    editor.selection = { anchor: {}, focus: {} }
    const { result } = renderHook(() =>
      usePlateAsyncInitialValue({ editor: editor as never, enabled: true, value: 'Large' }),
    )

    expect(result.current).toBe(false)
    await act(async () => {
      await workerMock.streams[0]?.emit([{ type: 'h1', children: [{ text: 'Title' }] }])
    })
    expect(result.current).toBe(false)
    expect(editor.children).toEqual([{ type: 'h1', children: [{ text: 'Title' }] }])

    await act(async () => {
      await workerMock.streams[0]?.emit([{ type: 'p', children: [{ text: 'Body' }] }])
    })
    expect(result.current).toBe(false)
    expect(editor.children).toEqual([
      { type: 'h1', children: [{ text: 'Title' }] },
      { type: 'p', children: [{ text: 'Body' }] },
    ])
    expect(editor.api.onChange).toHaveBeenCalledTimes(2)

    await act(async () => workerMock.streams[0]?.resolve())
    expect(result.current).toBe(true)
    expect(editor.selection).toBeNull()
    expect(editor.operations).toEqual([])
    expect(editor.marks).toBeNull()
    expect(editor.history).toEqual({ redos: [], undos: [] })
  })

  it('splits worker transport chunks into frame-sized renderer commits', async () => {
    const { editor } = createStreamingEditor()
    renderHook(() =>
      usePlateAsyncInitialValue({ editor: editor as never, enabled: true, value: 'Large' }),
    )
    const nodes: Value = Array.from({ length: 130 }, (_, index) => ({
      type: 'p',
      children: [{ text: String(index) }],
    }))

    await act(async () => workerMock.streams[0]?.emit(nodes))

    expect(editor.api.onChange).toHaveBeenCalledTimes(11)
    expect(editor.children).toEqual(nodes)
  })

  it('aborts incremental hydration when the editor changes', () => {
    const createEditor = () => ({
      api: { onChange: vi.fn() },
      children: [] as Value,
      history: { redos: [], undos: [] },
      marks: null,
      operations: [],
      selection: null,
    })
    const firstEditor = createEditor()
    const { rerender } = renderHook(
      ({ editor }) =>
        usePlateAsyncInitialValue({ editor: editor as never, enabled: true, value: 'Large' }),
      { initialProps: { editor: firstEditor } },
    )
    const firstStream = workerMock.streams.at(-1)

    rerender({ editor: createEditor() })

    expect(firstStream?.signal?.aborted).toBe(true)
  })

  it('restarts pre-ready hydration for the latest value and ignores stale chunks', async () => {
    const { editor } = createStreamingEditor()
    const { rerender, result } = renderHook(
      ({ value }) => usePlateAsyncInitialValue({ editor: editor as never, enabled: true, value }),
      { initialProps: { value: 'Document A' } },
    )
    const staleStream = workerMock.streams[0]
    await act(async () => {
      await staleStream?.emit([{ type: 'p', children: [{ text: 'A prefix' }] }])
    })

    rerender({ value: 'Document B' })
    const latestStream = workerMock.streams[1]
    expect(staleStream?.signal?.aborted).toBe(true)
    expect(latestStream?.markdown).toBe('Document B')
    expect(result.current).toBe(false)

    await act(async () => {
      await staleStream?.emit([{ type: 'p', children: [{ text: 'A late' }] }])
      staleStream?.resolve()
      await latestStream?.emit([{ type: 'p', children: [{ text: 'B prefix' }] }])
    })
    expect(result.current).toBe(false)
    expect(editor.children).toEqual([{ type: 'p', children: [{ text: 'B prefix' }] }])

    await act(async () => {
      await latestStream?.emit([{ type: 'p', children: [{ text: 'B end' }] }])
      latestStream?.resolve()
    })
    expect(result.current).toBe(true)
    expect(editor.children).toEqual([
      { type: 'p', children: [{ text: 'B prefix' }] },
      { type: 'p', children: [{ text: 'B end' }] },
    ])
  })

  it('binds initial parsing to the editor instead of reparsing a local value echo', async () => {
    const editor = {
      api: { onChange: vi.fn() },
      children: [] as Value,
      history: { redos: [], undos: [] },
      marks: null,
      operations: [],
      selection: null,
    }
    const { rerender, result } = renderHook(
      ({ value }) =>
        usePlateAsyncInitialValue({
          editor: editor as never,
          enabled: true,
          value,
        }),
      { initialProps: { value: 'Initial' } },
    )
    expect(result.current).toBe(false)

    await act(async () => {
      await workerMock.streams.at(-1)?.emit([{ type: 'p', children: [{ text: 'Initial' }] }])
      workerMock.streams.at(-1)?.resolve()
    })
    expect(result.current).toBe(true)
    expect(editor.api.onChange).toHaveBeenCalledOnce()

    rerender({ value: 'Local echo' })

    expect(workerMock.streams).toHaveLength(1)
    expect(editor.api.onChange).toHaveBeenCalledOnce()
    expect(result.current).toBe(true)
  })
})
