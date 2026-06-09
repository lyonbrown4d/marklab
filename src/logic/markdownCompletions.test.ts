import { describe, expect, it } from 'vitest'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import type { FileEntry } from '@/store/appTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'

const files: FileEntry[] = [
  { path: 'notes/current.md', kind: 'file' },
  { path: 'notes/target.md', kind: 'file' },
  { path: 'daily/today.md', kind: 'file' },
  { path: 'assets/logo.png', kind: 'file' },
]

const fileContents = {
  'notes/current.md': '# Current\n## Local Heading\n',
  'notes/target.md': '# Target\n## Details\n## API & UI\n',
  'daily/today.md': '# Today\n',
}

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [{ path: 'notes/current.md', level: 1, text: 'Current', slug: 'current', line: 1 }],
      links: [],
    },
    {
      path: 'notes/target.md',
      headings: [
        { path: 'notes/target.md', level: 1, text: 'Target', slug: 'target', line: 1 },
        {
          path: 'notes/target.md',
          level: 2,
          text: 'Indexed Details',
          slug: 'indexed-details',
          line: 2,
        },
      ],
      links: [],
    },
    {
      path: 'daily/today.md',
      headings: [{ path: 'daily/today.md', level: 1, text: 'Today', slug: 'today', line: 1 }],
      links: [],
    },
  ],
} satisfies FsWorkspaceIndex

describe('markdown completions', () => {
  it('suggests markdown file links relative to the active file', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: 'See [Target](',
        line: 1,
        column: 14,
        files,
        fileContents,
      }),
    ).toEqual([
      {
        label: 'current',
        kind: 'file',
        insertText: 'current.md',
        detail: 'notes/current.md',
        replacementStartColumn: 14,
      },
      {
        label: 'target',
        kind: 'file',
        insertText: 'target.md',
        detail: 'notes/target.md',
        replacementStartColumn: 14,
      },
      {
        label: 'today',
        kind: 'file',
        insertText: '../daily/today.md',
        detail: 'daily/today.md',
        replacementStartColumn: 14,
      },
    ])
  })

  it('suggests heading anchors for a target markdown file', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: 'See [Target](target.md#d',
        line: 1,
        column: 25,
        files,
        fileContents,
      }),
    ).toEqual([
      {
        label: 'Details',
        kind: 'heading',
        insertText: 'details',
        detail: 'notes/target.md#details',
        replacementStartColumn: 24,
      },
    ])
  })

  it('suggests heading anchors from the workspace index for other files', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: 'See [Target](target.md#index',
        line: 1,
        column: 29,
        files,
        fileContents: {},
        workspaceIndex,
      }),
    ).toEqual([
      {
        label: 'Indexed Details',
        kind: 'heading',
        insertText: 'indexed-details',
        detail: 'notes/target.md#indexed-details',
        replacementStartColumn: 24,
      },
    ])
  })

  it('suggests heading anchors from the current unsaved content', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: '# Current\n## Draft Heading\nSee [Draft](#dra',
        line: 3,
        column: 17,
        files,
        fileContents,
        workspaceIndex,
      }),
    ).toEqual([
      {
        label: 'Draft Heading',
        kind: 'heading',
        insertText: 'draft-heading',
        detail: 'notes/current.md#draft-heading',
        replacementStartColumn: 14,
      },
    ])
  })

  it('suggests wiki link labels without markdown extensions', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: 'Related [[tod',
        line: 1,
        column: 14,
        files,
        fileContents,
      }),
    ).toEqual([
      {
        label: 'today',
        kind: 'file',
        insertText: 'today',
        detail: 'daily/today.md',
        replacementStartColumn: 11,
      },
    ])
  })

  it('suggests code fence languages', () => {
    expect(
      getMarkdownCompletions({
        activePath: 'notes/current.md',
        content: '```ts',
        line: 1,
        column: 6,
        files,
        fileContents,
      }).map((item) => item.label),
    ).toEqual(['tsx', 'typescript'])
  })
})
