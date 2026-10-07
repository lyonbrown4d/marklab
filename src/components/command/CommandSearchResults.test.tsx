import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CommandSearchResults from '@/components/command/CommandSearchResults'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/command/CommandSearchStatus', () => ({
  default: () => null,
}))

vi.mock('@/components/command/CommandSearchResultRows', () => ({
  CommandResultRowItem: ({ row }: { row: { id: string } }) => <div>{row.id}</div>,
  toFileRows: (files: Array<{ path: string }>, kind: string) =>
    files.map((file) => ({ id: `${kind}:${file.path}`, kind, file })),
  toFullTextRows: () => [],
  toHeadingRows: () => [],
}))

vi.mock('@/components/ui/command', () => ({
  CommandGroup: ({ children, heading }: { children: ReactNode; heading: ReactNode }) => (
    <section>
      <header>{heading}</header>
      {children}
    </section>
  ),
  CommandSeparator: () => <hr />,
}))

describe('CommandSearchResults', () => {
  it('shows the total result count next to each flat result group', () => {
    render(
      <CommandSearchResults
        query="arch"
        scope="files"
        files={[
          { label: 'Architecture.md', path: 'docs/Architecture.md' },
          { label: 'Architecture notes.md', path: 'notes/Architecture.md' },
        ]}
        headings={[]}
        fullTextResults={[]}
        fullTextFetching={false}
        fullTextError={false}
        workspaceIndexed
        indexedFileCount={2}
        searchIndexRebuilding={false}
        onOpenFile={vi.fn()}
        onOpenHeading={vi.fn()}
        onOpenSearchResult={vi.fn()}
      />,
    )

    const heading = screen.getByText('command.search.titleMatches').closest('header')
    expect(heading).not.toBeNull()
    expect(within(heading as HTMLElement).getByText('2')).toBeInTheDocument()
  })
})
