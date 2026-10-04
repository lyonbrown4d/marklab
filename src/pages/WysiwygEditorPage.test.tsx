import { fireEvent, render, screen } from '@testing-library/react'
import { forwardRef, useImperativeHandle } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { MarkdownEditorHandle } from '@/components/editor/markdownEditorTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'

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
      </>
    )
  }),
}))

import WysiwygEditorPage from '@/pages/WysiwygEditorPage'

describe('WysiwygEditorPage workspace links', () => {
  it('opens an indexed extensionless Markdown target and ignores a missing target', async () => {
    const onOpenFile = vi.fn()
    const files = [
      { kind: 'file' as const, path: 'notes/current.md' },
      { kind: 'file' as const, path: 'notes/architecture-overview.md' },
    ]
    const workspaceIndex = {
      files: [{ path: 'notes/current.md' }, { path: 'notes/architecture-overview.md' }],
    } as FsWorkspaceIndex

    render(
      <WysiwygEditorPage
        activePath="notes/current.md"
        files={files}
        onChange={vi.fn()}
        onOpenFile={onOpenFile}
        readOnly={false}
        showStatusBar={false}
        value="[Architecture](architecture-overview)"
        workspaceIndex={workspaceIndex}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open architecture' }))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('notes/architecture-overview.md')

    fireEvent.click(screen.getByRole('button', { name: 'Open missing' }))
    expect(onOpenFile).toHaveBeenCalledTimes(1)
  })
})
