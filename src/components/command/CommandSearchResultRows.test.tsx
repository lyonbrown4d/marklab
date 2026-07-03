import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  CommandResultRowItem,
  toFileRows,
  toFullTextRows,
  toHeadingRows,
  type CommandResultRow,
} from '@/components/command/CommandSearchResultRows'
import type { FsSearchResult } from '@/services/fsApi'

const clipboard = vi.hoisted(() => ({
  writeClipboardText: vi.fn<() => Promise<void>>(),
}))

const messages: Record<string, string> = {
  'context.actionFailed': 'Failed',
  'context.copied': 'Copied',
  'context.copyMarkdownLink': 'Copy markdown link',
  'edit.copy': 'Copy',
}

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

vi.mock('@/runtime/clipboard', () => ({
  writeClipboardText: clipboard.writeClipboardText,
}))

vi.mock('@/components/SearchResultPreview', () => ({
  default: ({ result }: { compact?: boolean; result: FsSearchResult }) => (
    <span>Search preview: {result.title}</span>
  ),
}))

vi.mock('@/components/ui/command', () => ({
  CommandItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode
    onSelect?: () => void
    value?: string
  }) => (
    <div onClick={() => onSelect?.()} role="button" tabIndex={0}>
      {children}
    </div>
  ),
}))

const baseCallbacks = () => ({
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
})

const renderRow = (row: CommandResultRow) => {
  const callbacks = baseCallbacks()
  render(<CommandResultRowItem row={row} {...callbacks} />)
  return callbacks
}

describe('CommandSearchResultRows', () => {
  it('creates stable row ids for files, headings, and full text results', () => {
    expect(toFileRows([{ label: 'Guide.md', path: 'docs/Guide.md' }], 'title-file')).toEqual([
      {
        file: { label: 'Guide.md', path: 'docs/Guide.md' },
        id: 'title-file:docs/Guide.md',
        kind: 'title-file',
      },
    ])
    expect(
      toHeadingRows([
        { label: 'Guide.md', level: 2, path: 'docs/Guide.md', slug: 'setup', text: 'Setup' },
      ]),
    ).toEqual([
      {
        heading: {
          label: 'Guide.md',
          level: 2,
          path: 'docs/Guide.md',
          slug: 'setup',
          text: 'Setup',
        },
        id: 'heading:docs/Guide.md#setup',
        kind: 'heading',
      },
    ])

    const result = {
      column: 4,
      line: 7,
      path: 'docs/Guide.md',
      snippet: 'Install Marklab',
      title: 'Guide',
    } as FsSearchResult

    expect(toFullTextRows([result])).toEqual([
      {
        id: 'full-text:docs/Guide.md:7:4',
        kind: 'full-text',
        result,
      },
    ])
  })

  it('opens a file row and copies a markdown link without triggering row selection', async () => {
    clipboard.writeClipboardText.mockResolvedValueOnce(undefined)
    const callbacks = renderRow({
      file: { label: 'Guide.md', path: 'docs/Guide.md' },
      id: 'title-file:docs/Guide.md',
      kind: 'title-file',
    })

    fireEvent.click(screen.getByText('Guide.md').closest('[role="button"]') as HTMLElement)

    expect(callbacks.onOpenFile).toHaveBeenCalledWith('docs/Guide.md')

    callbacks.onOpenFile.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Copy markdown link docs/Guide.md' }))

    expect(callbacks.onOpenFile).not.toHaveBeenCalled()
    expect(clipboard.writeClipboardText).toHaveBeenCalledWith('[Guide.md](<docs/Guide.md>)')
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
  })

  it('escapes markdown link labels and angle brackets in copied links', () => {
    clipboard.writeClipboardText.mockResolvedValueOnce(undefined)
    renderRow({
      file: { label: 'Guide ] Windows\\Path', path: 'docs/Guide>.md' },
      id: 'title-file:docs/Guide>.md',
      kind: 'title-file',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy markdown link docs/Guide>.md' }))

    expect(clipboard.writeClipboardText).toHaveBeenCalledWith(
      '[Guide \\] Windows\\\\Path](<docs/Guide%3E.md>)',
    )
  })
  it('opens a heading row and copies a markdown link with the heading slug', () => {
    clipboard.writeClipboardText.mockResolvedValueOnce(undefined)
    const callbacks = renderRow({
      heading: {
        label: 'Guide.md',
        level: 3,
        path: 'docs/Guide.md',
        slug: 'deep-setup',
        text: 'Deep setup',
      },
      id: 'heading:docs/Guide.md#deep-setup',
      kind: 'heading',
    })

    fireEvent.click(screen.getByText('### Deep setup').closest('[role="button"]') as HTMLElement)
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy markdown link docs/Guide.md#deep-setup' }),
    )

    expect(callbacks.onOpenHeading).toHaveBeenCalledWith('docs/Guide.md', 'deep-setup')
    expect(clipboard.writeClipboardText).toHaveBeenCalledWith(
      '[Deep setup](<docs/Guide.md#deep-setup>)',
    )
  })

  it('opens a full-text result row through its preview', () => {
    const result = {
      column: 1,
      line: 5,
      path: 'docs/Search.md',
      snippet: 'Query hit',
      title: 'Search Title',
    } as FsSearchResult
    const callbacks = renderRow({
      id: 'full-text:docs/Search.md:5:1',
      kind: 'full-text',
      result,
    })

    fireEvent.click(
      screen.getByText('Search preview: Search Title').closest('[role="button"]') as HTMLElement,
    )

    expect(callbacks.onOpenSearchResult).toHaveBeenCalledWith(result)
  })
})
