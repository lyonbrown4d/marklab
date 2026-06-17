import { describe, expect, it } from 'vitest'

import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import { getMarkdownHover } from '@electron/services/markdownLanguage/hover.js'

const workspaceIndex = {
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
          level: 1,
          text: 'Known Heading',
          slug: 'known-heading',
          line: 1,
          column: 1,
        },
      ],
      links: [],
      assets: [],
    },
  ],
} satisfies FsWorkspaceIndex

const getHover = (content: string, column: number) =>
  getMarkdownHover(
    {
      path: 'notes/current.md',
      content,
      line: 1,
      column,
    },
    () => Promise.resolve(workspaceIndex),
  )

describe('getMarkdownHover', () => {
  it('returns the target heading hover for a resolvable markdown link', async () => {
    const hover = await getHover('See [Known](target.md#known-heading)', 18)

    expect(hover).toMatchObject({
      path: 'notes/target.md',
      line: 1,
      heading: 'Known Heading',
    })
    expect(hover?.markdown).toContain('### Known Heading')
  })

  it('returns a broken link hover for a missing markdown file', async () => {
    const hover = await getHover('See [Missing](missing.md)', 18)

    expect(hover?.markdown).toContain('Broken Markdown link')
    expect(hover?.markdown).toContain('missing.md')
    expect(hover?.markdown).toContain('create the missing Markdown file')
  })

  it('returns a missing anchor hover for an unresolved heading link', async () => {
    const hover = await getHover('See [Missing](target.md#missing-heading)', 18)

    expect(hover).toMatchObject({
      path: 'notes/target.md',
      line: 1,
      heading: null,
    })
    expect(hover?.markdown).toContain('Missing heading anchor')
    expect(hover?.markdown).toContain('#missing-heading')
  })

  it('uses unsaved current-document headings for same-document anchor hovers', async () => {
    const hover = await getHover('See [Draft](#draft)\n\n## Draft', 14)

    expect(hover).toMatchObject({
      path: 'notes/current.md',
      line: 3,
      heading: 'Draft',
    })
    expect(hover?.markdown).toContain('### Draft')
  })
})
