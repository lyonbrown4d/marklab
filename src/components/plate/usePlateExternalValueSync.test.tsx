import { act, renderHook } from '@testing-library/react'
import type { Value } from 'platejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => ({
  loads: [] as Array<{ markdown: string; resolve: (value: Value) => void; signal?: AbortSignal }>,
  streams: [] as Array<{
    emit: (value: Value) => Promise<void>
    markdown: string
    reject: (error: Error) => void
    resolve: () => void
    signal?: AbortSignal
  }>,
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  loadPlateMarkdown: (_editor: unknown, markdown: string, signal?: AbortSignal) =>
    new Promise<Value>((resolve) => workerMock.loads.push({ markdown, resolve, signal })),
  streamPlateMarkdown: (
    _editor: unknown,
    markdown: string,
    onChunk: (value: Value) => Promise<void>,
    signal?: AbortSignal,
  ) =>
    new Promise<void>((resolve, reject) =>
      workerMock.streams.push({ emit: onChunk, markdown, reject, resolve, signal }),
    ),
}))

import { usePlateExternalValueSync } from '@/components/plate/usePlateExternalValueSync'

const paragraph = (text: string) => ({ type: 'p', children: [{ text }] })

const createEditor = (initialTexts = ['Initial']) => {
  const children = initialTexts.map(paragraph) as Value
  const editor = {
    apply: vi.fn(
      (operation: {
        offset: number
        path: number[]
        text: string
        type: 'insert_text' | 'remove_text'
      }) => {
        let node: unknown = children
        for (const segment of operation.path) {
          node = Array.isArray(node)
            ? node[segment]
            : (node as { children: unknown[] }).children[segment]
        }
        const textNode = node as { text: string }
        textNode.text =
          operation.type === 'remove_text'
            ? `${textNode.text.slice(0, operation.offset)}${textNode.text.slice(operation.offset + operation.text.length)}`
            : `${textNode.text.slice(0, operation.offset)}${operation.text}${textNode.text.slice(operation.offset)}`
      },
    ),
    api: { onChange: vi.fn() },
    children,
    history: { redos: [] as unknown[], undos: [] as unknown[] },
    marks: null as unknown,
    operations: [] as unknown[],
    selection: null as unknown,
    tf: {
      insertNodes: vi.fn((node, options: { at: number[] }) => {
        children.splice(options.at[0], 0, node)
      }),
      removeNodes: vi.fn((options: { at: number[] }) => {
        children.splice(options.at[0], 1)
      }),
      withoutNormalizing: (apply: () => void) => {
        apply()
        editor.api.onChange()
      },
    },
  }
  return editor
}

const createOptions = (editor: ReturnType<typeof createEditor>) => ({
  cancelSnapshot: vi.fn(),
  changeRevisionRef: { current: 0 },
  composingRef: { current: false },
  editableRef: { current: document.createElement('div') },
  editor: editor as never,
  externalApplyRef: { current: false },
  latestExternalValueRef: { current: 'Initial' },
  localEchoRef: { current: null as string | null },
  onStatusChange: vi.fn(),
  readOnly: false,
  ready: true,
})

const renderSyncHook = (options: ReturnType<typeof createOptions>) =>
  renderHook(({ value }) => usePlateExternalValueSync({ ...options, value }), {
    initialProps: { value: 'Initial' },
  })

beforeEach(() => {
  workerMock.loads.length = 0
  workerMock.streams.length = 0
})

describe('usePlateExternalValueSync', () => {
  it('streams an external document through bounded renderer commits and exposes loading', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })

    expect(workerMock.loads).toHaveLength(0)
    expect(workerMock.streams[0]?.markdown).toBe('Restored')
    expect(result.current.loading).toBe(true)
    expect(options.onStatusChange).toHaveBeenLastCalledWith({ phase: 'loading' })

    const nodes = Array.from({ length: 130 }, (_, index) => paragraph(String(index)))
    await act(async () => workerMock.streams[0]?.emit(nodes))

    expect(editor.api.onChange).toHaveBeenCalledTimes(11)
    expect(editor.children).toEqual(nodes)
    expect(result.current.loading).toBe(true)

    await act(async () => workerMock.streams[0]?.resolve())

    expect(result.current.loading).toBe(false)
    expect(options.onStatusChange).toHaveBeenLastCalledWith({ phase: 'ready' })
  })

  it('aborts stale streams without letting their chunks or completion win', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'First restore' })
    const stale = workerMock.streams[0]
    rerender({ value: 'Latest restore' })
    const latest = workerMock.streams[1]

    expect(stale?.signal?.aborted).toBe(true)
    await act(async () => {
      await stale?.emit([paragraph('stale')])
      stale?.resolve()
      await latest?.emit([paragraph('latest')])
    })
    expect(editor.children).toEqual([paragraph('latest')])
    expect(result.current.loading).toBe(true)

    await act(async () => latest?.resolve())
    expect(result.current.loading).toBe(false)
  })

  it('rolls back a partially applied current stream when a later chunk is rejected', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    const nodes = Array.from({ length: 25 }, (_, index) => paragraph(String(index)))
    const emit = workerMock.streams[0]?.emit(nodes)
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    options.editableRef.current.focus()
    await act(async () => {
      await emit
      workerMock.streams[0]?.resolve()
    })

    expect(editor.children).toEqual([paragraph('Initial')])
    expect(result.current.loading).toBe(false)
    options.editableRef.current.remove()
  })

  it('copy-on-write rollback restores every changed baseline block', async () => {
    const editor = createEditor(['one', 'two', 'three'])
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    const emit = workerMock.streams[0]?.emit([
      paragraph('changed one'),
      paragraph('changed two'),
      paragraph('changed three'),
    ])
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    options.editableRef.current.focus()
    await act(async () => {
      await emit
      workerMock.streams[0]?.resolve()
    })

    expect(editor.children).toEqual([paragraph('one'), paragraph('two'), paragraph('three')])
    expect(result.current.loading).toBe(false)
    options.editableRef.current.remove()
  })

  it('preserves the stable baseline across superseding streams', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'First restore' })
    await act(async () => workerMock.streams[0]?.emit([paragraph('partial')]))
    rerender({ value: 'Second restore' })
    await act(async () => {
      await workerMock.streams[1]?.emit([paragraph('second partial')])
      workerMock.streams[1]?.reject(new Error('parse failed'))
    })

    expect(editor.children).toEqual([paragraph('Initial')])
    expect(result.current.loading).toBe(false)
  })

  it('defers an external stream while composing and starts it after composition ends', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    options.composingRef.current = true
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })

    expect(workerMock.streams).toHaveLength(0)
    expect(result.current.loading).toBe(false)
    options.composingRef.current = false

    act(() => expect(result.current.applyPending()).toBe(true))

    expect(workerMock.streams[0]?.markdown).toBe('Restored')
    expect(result.current.loading).toBe(true)
  })

  it('defers an external stream while the editor has focus', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    options.editableRef.current.focus()
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    expect(workerMock.streams).toHaveLength(0)

    options.editableRef.current.blur()
    act(() => expect(result.current.applyPending()).toBe(true))

    expect(workerMock.streams[0]?.markdown).toBe('Restored')
    options.editableRef.current.remove()
  })

  it('drops a focused pending value when the desired value returns to the baseline', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    options.editableRef.current.focus()
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Pending' })
    rerender({ value: 'Initial' })
    options.editableRef.current.blur()

    act(() => expect(result.current.applyPending()).toBe(false))
    expect(workerMock.streams).toHaveLength(0)
    options.editableRef.current.remove()
  })

  it('does not revive a cancelled in-flight value after a focused value cycle', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'In flight' })
    const stale = workerMock.streams[0]
    options.editableRef.current.focus()
    rerender({ value: 'Pending' })
    rerender({ value: 'Initial' })
    options.editableRef.current.blur()

    expect(stale?.signal?.aborted).toBe(true)
    act(() => expect(result.current.applyPending()).toBe(false))
    expect(workerMock.streams).toHaveLength(1)
    options.editableRef.current.remove()
  })

  it('streams immediately when a read-only editor has focus', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    options.readOnly = true
    options.editableRef.current.tabIndex = 0
    document.body.append(options.editableRef.current)
    options.editableRef.current.focus()
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })

    expect(workerMock.streams[0]?.markdown).toBe('Restored')
    expect(result.current.loading).toBe(true)
    options.editableRef.current.remove()
  })

  it('leaves loading and reports a current stream failure', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    await act(async () => workerMock.streams[0]?.reject(new Error('parse failed')))

    expect(result.current.loading).toBe(false)
    expect(options.latestExternalValueRef.current).toBe('Initial')
    expect(options.onStatusChange).toHaveBeenLastCalledWith({
      message: 'parse failed',
      phase: 'error',
    })
    act(() => expect(result.current.applyPending()).toBe(true))
    expect(workerMock.streams[1]?.markdown).toBe('Restored')
  })

  it('rolls back when a renderer patch throws after partially mutating the editor', async () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const apply = editor.apply.getMockImplementation()
    let operationCount = 0
    editor.apply.mockImplementation((operation) => {
      operationCount += 1
      if (operationCount === 2) throw new Error('plugin transform failed')
      apply?.(operation)
    })
    const { result, rerender } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    const stream = workerMock.streams[0]
    await expect(stream?.emit([paragraph('Restored')])).rejects.toThrow('plugin transform failed')
    await act(async () => stream?.reject(new Error('plugin transform failed')))

    expect(editor.children).toEqual([paragraph('Initial')])
    expect(result.current.loading).toBe(false)
  })

  it('cancels loading when the owning controller unmounts', () => {
    const editor = createEditor()
    const options = createOptions(editor)
    const { result, rerender, unmount } = renderSyncHook(options)

    rerender({ value: 'Restored' })
    const stale = workerMock.streams[0]
    expect(result.current.loading).toBe(true)

    unmount()

    expect(stale?.signal?.aborted).toBe(true)
    expect(workerMock.streams).toHaveLength(1)
  })
})
