import { describe, expect, it } from 'vitest'

import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions.js'
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

const getDefinition = (content: string, column: number) =>
  getMarkdownDefinition(
    {
      path: 'notes/current.md',
      content,
      line: 1,
      column,
    },
    () => Promise.resolve(workspaceIndex),
  )

const columnInside = (content: string, needle: string) => content.indexOf(needle) + 1

describe('getMarkdownDefinition', () => {
  it('returns the target heading for a resolvable markdown link', async () => {
    const definition = await getDefinition('See [Known](target.md#known-heading)', 18)

    expect(definition).toMatchObject({
      path: 'notes/target.md',
      line: 1,
      column: 1,
      headingSlug: 'known-heading',
    })
  })

  it('uses AST link URLs for markdown links with titles', async () => {
    const content = 'See [Known](target.md#known-heading "Target")'
    const definition = await getDefinition(content, columnInside(content, 'Target'))

    expect(definition).toMatchObject({
      path: 'notes/target.md',
      line: 1,
      column: 1,
      headingSlug: 'known-heading',
    })
  })

  it('supports wiki links with display aliases', async () => {
    const content = 'See [[target#known-heading|Known]]'
    const definition = await getDefinition(content, columnInside(content, 'Known'))

    expect(definition).toMatchObject({
      path: 'notes/target.md',
      line: 1,
      column: 1,
      headingSlug: 'known-heading',
    })
  })

  it('uses unsaved current-document headings for same-document anchors', async () => {
    const definition = await getDefinition('See [Draft](#draft)\n\n## Draft', 14)

    expect(definition).toMatchObject({
      path: 'notes/current.md',
      line: 3,
      column: 1,
      headingSlug: 'draft',
    })
  })

  it('returns null for a missing heading anchor', async () => {
    const definition = await getDefinition('See [Missing](target.md#missing-heading)', 18)

    expect(definition).toBeNull()
  })
})
