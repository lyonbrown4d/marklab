import { act, render, screen, waitFor } from '@testing-library/react'
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
  streamPlateMarkdown: (
    _editor: unknown,
    markdown: string,
    onChunk: (value: Value) => Promise<void>,
    signal?: AbortSignal,
  ) =>
    new Promise<void>((resolve) =>
      workerMock.requests.push({
        markdown,
        resolve: (value) => {
          void onChunk(value).then(resolve)
        },
        signal,
      }),
    ),
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

const resolveRequest = (request: (typeof workerMock.requests)[number] | undefined, text: string) =>
  act(async () => {
    request?.resolve(paragraph(text))
    await Promise.resolve()
  })

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

    await resolveRequest(workerMock.requests[0], 'Initial')

    await waitFor(() =>
      expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready'),
    )
    expect(workerMock.requests).toHaveLength(1)
    expect(workerMock.serialize).not.toHaveBeenCalled()
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

    await resolveRequest(workerMock.requests[0], 'First')
    const second = workerMock.requests.find((request) => request.markdown === 'Second')
    expect(second).toBeDefined()
    await act(async () => {
      second?.resolve(paragraph('Second'))
      await Promise.resolve()
    })

    expect(workerMock.requests.filter((request) => request.markdown === 'Second')).toHaveLength(1)
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
    await resolveRequest(workerMock.requests[0], 'Initial')
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
    await resolveRequest(workerMock.requests[0], 'Initial')

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
    await resolveRequest(workerMock.requests[0], 'Initial')
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
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith({ phase: 'ready' }))
  })

  it('does not overwrite a local edit made while an external value is parsing', async () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    const onChange = vi.fn()
    const view = render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Initial"
      />,
    )
    await resolveRequest(workerMock.requests[0], 'Initial')

    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Restored"
      />,
    )
    const restored = workerMock.requests.find((request) => request.markdown === 'Restored')
    await act(async () => {
      const editor = ref.current?.getEditor()
      if (!editor) return
      editor.tf.select({
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 'Initial'.length, path: [0, 0] },
      })
      editor.tf.insertText('Local edit')
      await Promise.resolve()
    })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    view.rerender(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={onChange}
        placeholder="Write"
        ref={ref}
        value="Local edit"
      />,
    )
    await act(async () => {
      restored?.resolve(paragraph('Restored'))
      await Promise.resolve()
    })

    expect((await ref.current?.getMarkdown())?.trim()).toBe('Local edit')
  })
})
