import { act, render, screen } from '@testing-library/react'
import type { Value } from 'platejs'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const streamMock = vi.hoisted(() => ({
  complete: undefined as (() => void) | undefined,
  emit: undefined as ((value: Value) => Promise<void> | void) | undefined,
  serialize: vi.fn(() => ''),
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  loadPlateMarkdown: vi.fn(),
  serializePlateMarkdown: streamMock.serialize,
  shouldParsePlateMarkdownInWorker: () => true,
  streamPlateMarkdown: (
    _editor: unknown,
    _markdown: string,
    onChunk: (value: Value) => Promise<void> | void,
  ) =>
    new Promise<void>((resolve) => {
      streamMock.emit = onChunk
      streamMock.complete = resolve
    }),
}))

import { PlateEditorSurface } from '@/components/plate/PlateEditorSurface'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'

const paragraph = (text: string): Value => [{ type: 'p', children: [{ text }] }]

beforeEach(() => {
  streamMock.complete = undefined
  streamMock.emit = undefined
  streamMock.serialize.mockClear()
})

describe('PlateEditorSurface streamed hydration', () => {
  it('does not enter a nested update loop while hydrating many blocks in StrictMode', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const blocks: Value = Array.from({ length: 720 }, (_, index) => ({
      type: 'p',
      children: [{ text: `Block ${index}` }],
    }))

    render(
      <StrictMode>
        <PlateEditorSurface
          activePath="notes/large.md"
          onChange={vi.fn()}
          placeholder="Write"
          value="Initial"
        />
      </StrictMode>,
    )

    await act(async () => streamMock.emit?.(blocks))
    await act(async () => streamMock.complete?.())

    expect(
      consoleError.mock.calls.some((call) => String(call[0]).includes('Maximum update depth')),
    ).toBe(false)
    consoleError.mockRestore()
  })

  it('renders later chunks while editing remains disabled until completion', async () => {
    const onChange = vi.fn()
    render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={onChange}
        placeholder="Write"
        value="Initial"
      />,
    )

    await act(async () => streamMock.emit?.(paragraph('First streamed block')))
    expect(screen.getByText('First streamed block')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'loading')
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('inert')

    await act(async () => streamMock.emit?.(paragraph('Later streamed block')))
    expect(screen.getByText('Later streamed block')).toBeInTheDocument()
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'loading')
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => streamMock.complete?.())
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('contenteditable', 'true')
    expect(screen.getByTestId('markdown-editor')).not.toHaveAttribute('inert')
  })

  it('does not snapshot a partial external stream when the window closes', async () => {
    const onChange = vi.fn()
    render(
      <PlateEditorSurface
        activePath="notes/large.md"
        onChange={onChange}
        placeholder="Write"
        value="Complete external document"
      />,
    )

    await act(async () => streamMock.emit?.(paragraph('Only the first streamed block')))
    await flushEditorChangesForClose()

    expect(streamMock.serialize).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => streamMock.complete?.())
  })
})
