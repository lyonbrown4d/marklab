import { describe, expect, it } from 'vitest'

import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types'

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
  paths: [
    'notes',
    'notes/current.md',
    'notes/target.md',
    'src/example.ts',
    'docs/spec.pdf',
    'assets/logo.png',
  ],
  asset_paths: ['docs/spec.pdf', 'assets/logo.png'],
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

  it('opens a known source link even when it is absent from the Markdown index', async () => {
    const content = 'See [implementation](../src/example.ts)'
    const definition = await getDefinition(content, columnInside(content, 'example.ts'))

    expect(definition).toEqual({
      path: 'src/example.ts',
      line: 1,
      column: 1,
    })
  })

  it('does not treat known directories or preview assets as source definitions', async () => {
    const directoryLink = 'See [notes](../notes)'
    const pdfLink = 'See [spec](../docs/spec.pdf)'
    const imageLink = 'See [logo](../assets/logo.png)'

    await expect(
      getDefinition(directoryLink, columnInside(directoryLink, '../notes')),
    ).resolves.toBeNull()
    await expect(getDefinition(pdfLink, columnInside(pdfLink, 'spec.pdf'))).resolves.toBeNull()
    await expect(getDefinition(imageLink, columnInside(imageLink, 'logo.png'))).resolves.toBeNull()
  })
})
