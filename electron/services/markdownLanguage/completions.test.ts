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

describe('createMarkdownCompletions', () => {
  it('suggests calendar files from workspace paths for markdown links', async () => {
    const completions = await createMarkdownCompletions(
      {
        path: 'notes/current.md',
        content: 'See [Calendar](cal',
        line: 1,
        column: 19,
      },
      async () => workspaceIndex,
    )

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
    const completions = await createMarkdownCompletions(
      {
        path: 'notes/current.md',
        content: 'See [Spec](spe',
        line: 1,
        column: 15,
      },
      async () => workspaceIndex,
    )

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
})
