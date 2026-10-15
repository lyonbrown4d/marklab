import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GitDiffPage from '@/pages/GitDiffPage'

vi.mock('@/pages/EditorPaneFallback', () => ({ default: () => <p>Loading</p> }))
vi.mock('@/components/GitDiffView', () => ({ default: () => <p>Review diff</p> }))
vi.mock('@/components/git/GitConflictMergeView', () => ({
  default: ({ rootPath, request }: { rootPath: string; request: { path: string } }) => (
    <p>
      Merge result: {rootPath}/{request.path}
    </p>
  ),
}))

describe('GitDiffPage', () => {
  it('opens an editable merge view for conflicts without opening a file editor', async () => {
    const onOpenFile = vi.fn()
    render(
      <GitDiffPage
        rootPath="/repo"
        request={{ path: 'note.md', section: 'conflicts', status: 'conflicted' }}
        onClose={vi.fn()}
        onOpenFile={onOpenFile}
      />,
    )
    expect(await screen.findByText('Merge result: /repo/note.md')).toBeInTheDocument()
    expect(screen.queryByText('Review diff')).not.toBeInTheDocument()
    expect(onOpenFile).not.toHaveBeenCalled()
  })
  it('keeps ordinary staged changes in the review diff', async () => {
    render(
      <GitDiffPage
        rootPath="/repo"
        request={{ path: 'note.md', section: 'staged', status: 'modified' }}
        onClose={vi.fn()}
        onOpenFile={vi.fn()}
      />,
    )
    expect(await screen.findByText('Review diff')).toBeInTheDocument()
  })
})
