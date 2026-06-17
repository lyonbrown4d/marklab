import { describe, expect, it } from 'vitest'

import { createMarkdownRequestContext } from '@electron/services/markdownLanguage/requestContext.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const workspaceIndex = {
  paths: ['notes/current.md', 'notes/other.md'],
  asset_paths: ['assets/image.png'],
  files: [
    {
      path: 'notes/current.md',
      headings: [
        {
          path: 'notes/current.md',
          level: 1,
          text: 'Indexed',
          slug: 'indexed',
          line: 1,
          column: 1,
        },
      ],
      links: [],
      assets: [],
    },
    {
      path: 'notes/other.md',
      headings: [],
      links: [],
      assets: [],
    },
  ],
} satisfies FsWorkspaceIndex

describe('createMarkdownRequestContext', () => {
  it('replaces the indexed current file with the unsaved request content', () => {
    const context = createMarkdownRequestContext(
      {
        path: 'notes/current.md',
        content: '# Draft\n\nSee [Other](other.md)',
        line: 1,
        column: 3,
      },
      workspaceIndex,
    )

    expect(context.currentFile).toMatchObject({
      path: 'notes/current.md',
      headings: [
        expect.objectContaining({
          text: 'Draft',
          slug: 'draft',
          line: 1,
        }),
      ],
    })
    expect(context.index.files.map((file) => file.path)).toEqual([
      'notes/current.md',
      'notes/other.md',
    ])
    expect(context.index.files[0]?.headings[0]?.slug).toBe('draft')
    expect(context.index.paths).toBe(workspaceIndex.paths)
    expect(context.index.asset_paths).toBe(workspaceIndex.asset_paths)
  })

  it('keeps the original index when the request has no path', () => {
    const context = createMarkdownRequestContext(
      {
        path: null,
        content: '# Draft',
        line: 1,
        column: 3,
      },
      workspaceIndex,
    )

    expect(context.currentFile).toBeNull()
    expect(context.index).toBe(workspaceIndex)
  })
})
