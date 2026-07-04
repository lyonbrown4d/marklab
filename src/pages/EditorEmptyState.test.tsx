import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EditorEmptyState from '@/pages/EditorEmptyState'
import { onFileSearchFocusRequest } from '@/utils/appEvents'
import type { FileEntry } from '@/store/appTypes'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'editor.emptyDescription': 'Choose a file from the sidebar or search the workspace.',
        'editor.emptyRecent': 'Available files',
        'editor.emptySearch': 'Search files',
        'editor.emptyTitle': 'Open a Markdown file to start editing',
      }
      return labels[key] ?? key
    },
  }),
}))

vi.mock('@/components/AppLogo', () => ({
  default: ({ className }: { className?: string }) => (
    <span aria-hidden="true" className={className} data-testid="app-logo" />
  ),
}))

const files = [
  { kind: 'file', path: 'notes/one.md' },
  { kind: 'file', path: 'notes/two.md' },
] satisfies FileEntry[]

describe('EditorEmptyState', () => {
  it('guides users to search files and open recent files', () => {
    const onOpenFile = vi.fn()
    const onSearch = vi.fn()
    const unsubscribe = onFileSearchFocusRequest(onSearch)

    render(<EditorEmptyState files={files} onOpenFile={onOpenFile} />)

    expect(
      screen.getByRole('heading', { name: 'Open a Markdown file to start editing' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Choose a file from the sidebar or search the workspace.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Available files')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Search files' }))
    fireEvent.click(screen.getByRole('button', { name: 'notes/two.md' }))

    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(onOpenFile).toHaveBeenCalledWith('notes/two.md')
    unsubscribe()
  })

  it('omits the recent file section when there are no files', () => {
    render(<EditorEmptyState files={[]} onOpenFile={vi.fn()} />)

    expect(screen.queryByText('Available files')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search files' })).toBeInTheDocument()
  })
})
