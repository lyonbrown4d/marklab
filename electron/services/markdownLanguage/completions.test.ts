import { describe, expect, it } from 'vitest'

import { createMarkdownCompletions } from '@electron/services/markdownLanguage/completions.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [],
      links: [],
      assets: [],
    },
  ],
  paths: ['notes', 'notes/current.md', 'notes/calendar.ics', 'assets/logo.png', 'docs/spec.pdf'],
  asset_paths: ['assets/logo.png', 'docs/spec.pdf'],
} satisfies FsWorkspaceIndex

const completeAtEnd = (content: string, index: FsWorkspaceIndex = workspaceIndex) =>
  createMarkdownCompletions(
    {
      path: 'notes/current.md',
      content,
      line: 1,
      column: content.length + 1,
    },
    async () => index,
  )

describe('createMarkdownCompletions', () => {
  it('suggests calendar files from workspace paths for markdown links', async () => {
    const completions = await completeAtEnd('See [Calendar](cal')

    expect(completions).toEqual([
      expect.objectContaining({
        label: 'calendar',
        kind: 'file',
        insertText: 'calendar.ics',
        detail: 'notes/calendar.ics',
        replacementStartColumn: 16,
      }),
    ])
  })

  it('suggests previewable local files for markdown links', async () => {
    const completions = await completeAtEnd('See [Spec](spe')

    expect(completions).toEqual([
      expect.objectContaining({
        label: 'spec.pdf',
        kind: 'file',
        insertText: '../docs/spec.pdf',
        detail: 'docs/spec.pdf',
        replacementStartColumn: 12,
      }),
    ])
  })

  it('uses fuzzy matching for file path completions', async () => {
    const completions = await completeAtEnd('See [Spec](spc', {
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [],
          assets: [],
        },
      ],
      paths: ['notes/current.md', 'docs/specification.pdf'],
      asset_paths: ['docs/specification.pdf'],
    })

    expect(completions[0]).toEqual(
      expect.objectContaining({
        label: 'specification.pdf',
        insertText: '../docs/specification.pdf',
        detail: 'docs/specification.pdf',
      }),
    )
  })

  it('keeps same-directory files ahead of equally relevant distant files', async () => {
    const completions = await completeAtEnd('See [Guide](gui', {
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [],
          assets: [],
        },
        {
          path: 'notes/guide.md',
          headings: [],
          links: [],
          assets: [],
        },
        {
          path: 'docs/guide.md',
          headings: [],
          links: [],
          assets: [],
        },
      ],
      paths: ['notes/current.md', 'notes/guide.md', 'docs/guide.md'],
      asset_paths: [],
    })

    expect(completions.map((completion) => completion.detail).slice(0, 2)).toEqual([
      'notes/guide.md',
      'docs/guide.md',
    ])
  })

  it('uses fuzzy matching for heading anchor completions', async () => {
    const completions = await completeAtEnd('See [Install](target.md#inst guid', {
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [],
          assets: [],
        },
        {
          path: 'notes/target.md',
          headings: [
            {
              path: 'notes/target.md',
              level: 2,
              text: 'Installation Guide',
              slug: 'installation-guide',
              line: 4,
              column: 1,
            },
          ],
          links: [],
          assets: [],
        },
      ],
      paths: ['notes/current.md', 'notes/target.md'],
      asset_paths: [],
    })

    expect(completions[0]).toEqual(
      expect.objectContaining({
        label: 'Installation Guide',
        insertText: 'installation-guide',
        detail: 'notes/target.md#installation-guide',
      }),
    )
  })
})
