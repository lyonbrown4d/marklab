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
        resolve: (value) => void onChunk(value).then(resolve),
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

beforeEach(() => {
  workerMock.requests.length = 0
  workerMock.serialize.mockClear()
  workerMock.workerSerialize.mockClear()
})

describe('PlateEditorSurface external value synchronization', () => {
  it('applies only the latest external large value while editing is disabled', async () => {
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
    await waitFor(() =>
      expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready'),
    )

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

    const editor = screen.getByTestId('markdown-editor')
    expect(editor).toHaveAttribute('contenteditable', 'true')
    expect(editor).toHaveAttribute('inert')
    const beforeInput = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: 'blocked',
      inputType: 'insertText',
    })
    expect(editor.dispatchEvent(beforeInput)).toBe(false)
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
})
