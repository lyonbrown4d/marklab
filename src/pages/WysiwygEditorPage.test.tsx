import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MarkdownEditorHandle } from '@/components/editor/markdownEditorTypes'

vi.mock('@/components/MarkdownEditor', () => ({
  default: forwardRef<
    MarkdownEditorHandle,
    { onWorkspaceLink?: (target: string, documentPath: string | null) => void }
  >(({ onWorkspaceLink }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: vi.fn(),
      getMarkdown: async () => '',
    }))
    return (
      <>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('architecture-overview', 'notes/current.md')}
        >
          Open architecture
        </button>
        <button type="button" onClick={() => onWorkspaceLink?.('missing-page', 'notes/current.md')}>
          Open missing
        </button>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('../src/example.ts', 'notes/current.md')}
        >
          Open source
        </button>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('../docs/spec.pdf', 'notes/current.md')}
        >
          Open PDF
        </button>
      </>
    )
  }),
}))

import WysiwygEditorPage from '@/pages/WysiwygEditorPage'

describe('WysiwygEditorPage workspace links', () => {
  it('opens an indexed extensionless Markdown target and ignores a missing target', async () => {
    const onOpenFile = vi.fn()
    const onOpenFileView = vi.fn()
    const files = [
      { kind: 'file' as const, path: 'notes/current.md' },
      { kind: 'file' as const, path: 'notes/architecture-overview.md' },
      { kind: 'file' as const, path: 'src/example.ts' },
      { kind: 'file' as const, path: 'docs/spec.pdf' },
    ]
    render(
      <WysiwygEditorPage
        activePath="notes/current.md"
        files={files}
        onChange={vi.fn()}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        readOnly={false}
        showStatusBar={false}
        value="[Architecture](architecture-overview)"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open architecture' }))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('notes/architecture-overview.md')

    fireEvent.click(screen.getByRole('button', { name: 'Open missing' }))
    expect(onOpenFile).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Open source' }))
    expect(onOpenFileView).toHaveBeenCalledWith('src/example.ts', 'source')

    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }))
    expect(onOpenFile).toHaveBeenCalledWith('docs/spec.pdf')
  })
})
