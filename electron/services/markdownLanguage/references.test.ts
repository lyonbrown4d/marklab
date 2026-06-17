import { describe, expect, it } from 'vitest'

import { getMarkdownReferences } from '@electron/services/markdownLanguage/references.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [],
      links: [],
      assets: [],
    },
    {
      path: 'notes/other.md',
      headings: [],
      links: [
        {
          source_path: 'notes/other.md',
          text: 'Draft',
          target: 'current.md#draft',
          link_type: 'markdown',
          target_path: 'notes/current.md',
          target_anchor: 'draft',
          target_heading_slug: 'draft',
          is_external: false,
          context: 'See [Draft](current.md#draft)',
          line: 1,
          column: 5,
        },
      ],
      assets: [],
    },
  ],
} satisfies FsWorkspaceIndex

const getReferences = (content: string, column: number) =>
  getMarkdownReferences(
    {
      path: 'notes/current.md',
      content,
      line: 1,
      column,
    },
    () => Promise.resolve(workspaceIndex),
  )

describe('getMarkdownReferences', () => {
  it('includes references from the unsaved current document', async () => {
    const references = await getReferences('See [Draft](#draft)\n\n## Draft', 14)

    expect(references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'notes/current.md',
          line: 1,
          text: 'Draft',
          targetAnchor: 'draft',
          targetHeadingSlug: 'draft',
        }),
        expect.objectContaining({
          path: 'notes/other.md',
          line: 1,
          text: 'Draft',
          targetAnchor: 'draft',
          targetHeadingSlug: 'draft',
        }),
      ]),
    )
  })
})
