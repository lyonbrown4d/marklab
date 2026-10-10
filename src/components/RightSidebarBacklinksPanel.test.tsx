import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RightSidebarBacklinksPanel } from '@/components/RightSidebarBacklinksPanel'

const props = {
  backlinks: [
    {
      sourcePath: 'linked.md',
      text: 'Target',
      context: 'See [Target](target.md)',
      line: 2,
      column: 5,
    },
  ],
  mentions: [
    {
      sourcePath: 'notes/plain.md',
      text: 'Target',
      context: 'Target appears without a link',
      line: 4,
      column: 1,
      endColumn: 7,
    },
  ],
  mentionsError: null,
  mentionsLoading: false,
  targetLabel: 'Target',
  onOpenBacklink: vi.fn(),
  onOpenMention: vi.fn(),
  onRetryMentions: vi.fn(),
}

describe('RightSidebarBacklinksPanel', () => {
  it('keeps probable mentions in a distinct group and opens their source', () => {
    render(<RightSidebarBacklinksPanel {...props} />)

    expect(screen.getByText('File references')).toBeInTheDocument()
    expect(screen.getByText('Unlinked mentions')).toBeInTheDocument()
    const mention = screen.getByText('plain').closest('button')
    expect(mention).toBeInTheDocument()
    fireEvent.click(mention!)
    expect(props.onOpenMention).toHaveBeenCalledWith(props.mentions[0])
    expect(props.onOpenBacklink).not.toHaveBeenCalled()
  })

  it('filters explicit backlinks and mentions with the same search field', async () => {
    render(<RightSidebarBacklinksPanel {...props} />)
    const search = screen.getByRole('searchbox')

    await userEvent.type(search, 'plain')

    expect(screen.queryByText('linked')).not.toBeInTheDocument()
    expect(screen.getByText('plain')).toBeInTheDocument()
  })
})
