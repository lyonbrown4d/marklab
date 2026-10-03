import { act, render, screen } from '@testing-library/react'
import type { Value } from 'platejs'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workerMock = vi.hoisted(() => ({
  requests: [] as Array<{
    markdown: string
    resolve: (value: Value) => void
    signal?: AbortSignal
  }>,
  serialize: vi.fn((editor: { children: Value }, value?: Value) =>
    (value ?? editor.children)
      .flatMap((node) => ('children' in node ? node.children : []))
      .map((child) => ('text' in child ? child.text : ''))
      .join(''),
  ),
  workerSerialize: vi.fn(async (editor: { children: Value }, value?: Value) =>
    (value ?? editor.children)
      .flatMap((node) => ('children' in node ? node.children : []))
      .map((child) => ('text' in child ? child.text : ''))
      .join(''),
  ),
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  shouldParsePlateMarkdownInWorker: () => true,
  loadPlateMarkdown: (_editor: unknown, markdown: string, signal?: AbortSignal) =>
    new Promise<Value>((resolve) => workerMock.requests.push({ markdown, resolve, signal })),
  serializePlateMarkdown: workerMock.workerSerialize,
}))

vi.mock('@/components/plate/plateMarkdownSerialization', () => ({
  serializePlateMarkdown: workerMock.serialize,
}))

import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

const paragraph = (text: string): Value => [{ type: 'p', children: [{ text }] }]

beforeEach(() => {
  workerMock.requests.length = 0
  workerMock.serialize.mockClear()
  workerMock.workerSerialize.mockClear()
})

describe('PlateEditorSurface async value lifecycle', () => {
  it('exposes loading and ready states for rendering performance probes', async () => {
    render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Initial"
      />,
    )

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'loading')

    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
    expect(workerMock.serialize).not.toHaveBeenCalled()
  })

  it('applies only the latest external large value without making the editor read-only', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Initial"
      />,
    )
    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })

    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="External one"
      />,
    )
    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="External two"
      />,
    )

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'true')
    expect((await ref.current?.getMarkdown())?.trim()).toBe('Initial')
    const firstExternal = workerMock.requests.find((request) => request.markdown === 'External one')
    const latestExternal = workerMock.requests.find(
      (request) => request.markdown === 'External two',
    )
    expect(firstExternal?.signal?.aborted).toBe(true)

    await act(async () => {
      latestExternal?.resolve(paragraph('External two'))
      firstExternal?.resolve(paragraph('External one'))
      await Promise.resolve()
    })

    expect((await ref.current?.getMarkdown())?.trim()).toBe('External two')
  })

  it('loads the latest external value after initial parsing finishes', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="First"
      />,
    )
    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Second"
      />,
    )

    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('First'))
      await Promise.resolve()
    })
    const second = workerMock.requests.find((request) => request.markdown === 'Second')
    expect(second).toBeDefined()
    await act(async () => {
      second?.resolve(paragraph('Second'))
      await Promise.resolve()
    })

    expect((await ref.current?.getMarkdown())?.trim()).toBe('Second')
  })

  it('does not serialize the previous large document while applying an external value', async () => {
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Initial"
      />,
    )
    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })
    workerMock.serialize.mockClear()

    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        value="Restored"
      />,
    )
    const restored = workerMock.requests.find((request) => request.markdown === 'Restored')
    await act(async () => {
      restored?.resolve(paragraph('Restored'))
      await Promise.resolve()
    })

    expect(workerMock.serialize).not.toHaveBeenCalled()
  })

  it('serializes imperative large-document requests through the worker client', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Initial"
      />,
    )
    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })

    expect((await ref.current?.getMarkdown())?.trim()).toBe('Initial')
    expect(workerMock.workerSerialize).toHaveBeenCalledOnce()
    expect(workerMock.serialize).not.toHaveBeenCalled()
  })

  it('reports loading while an external document is parsed and ready after it is applied', async () => {
    const onStatusChange = vi.fn()
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        onStatusChange={onStatusChange}
        placeholder="Write"
        value="Initial"
      />,
    )
    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })
    onStatusChange.mockClear()

    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        onStatusChange={onStatusChange}
        placeholder="Write"
        value="Restored"
      />,
    )

    expect(onStatusChange).toHaveBeenLastCalledWith({ phase: 'loading' })
    const restored = workerMock.requests.find((request) => request.markdown === 'Restored')
    await act(async () => {
      restored?.resolve(paragraph('Restored'))
      await Promise.resolve()
    })
    expect(onStatusChange).toHaveBeenLastCalledWith({ phase: 'ready' })
  })

  it('does not overwrite a local edit made while an external value is parsing', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Initial"
      />,
    )
    await act(async () => {
      workerMock.requests[0]?.resolve(paragraph('Initial'))
      await Promise.resolve()
    })

    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value="Restored"
      />,
    )
    const restored = workerMock.requests.find((request) => request.markdown === 'Restored')
    act(() => ref.current?.getEditor().tf.setValue(paragraph('Local edit')))
    await act(async () => {
      restored?.resolve(paragraph('Restored'))
      await Promise.resolve()
    })

    expect((await ref.current?.getMarkdown())?.trim()).toBe('Local edit')
  })
})
