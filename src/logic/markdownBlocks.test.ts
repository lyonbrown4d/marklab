import { describe, expect, it } from 'vitest'
import {
  createHeadingSectionBlocks,
  createHeadingSectionViewModel,
  normalizeMarkdownBlocks,
  serializeMarkdownBlocks,
  updateMarkdownBlockText,
} from '@/logic/markdownBlocks'

describe('createHeadingSectionBlocks', () => {
  it('creates editable heading and full content blocks', () => {
    expect(
      createHeadingSectionBlocks({
        headingId: 'heading:notes/current.md:intro',
        level: 2,
        title: 'Intro',
        content: 'Body',
        contentMode: 'full',
        editable: true,
      }),
    ).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:content',
        kind: 'paragraph',
        text: 'Body',
        editable: true,
      },
    ])
  })

  it('keeps summarized content read-only', () => {
    const blocks = createHeadingSectionBlocks({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'A'.repeat(160),
      contentMode: 'summary',
      editable: true,
    })

    expect(blocks[1]).toEqual(
      expect.objectContaining({
        kind: 'paragraph',
        text: `${'A'.repeat(140)}...`,
        editable: false,
      }),
    )
  })

  it('creates an empty editable content block for graph editing', () => {
    expect(
      createHeadingSectionBlocks({
        headingId: 'heading:notes/current.md:intro',
        level: 2,
        title: 'Intro',
        contentMode: 'full',
        editable: true,
      }),
    ).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:content',
        kind: 'paragraph',
        text: '',
        editable: true,
      },
    ])
  })

  it('uses knowledge-engine parsed blocks for full content mode', () => {
    const blocks = createHeadingSectionBlocks({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      content: 'Fallback',
      contentBlocks: normalizeMarkdownBlocks([
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'code',
          text: 'const value = 1',
          language: 'ts',
        },
        {
          id: 'heading:notes/current.md:intro:block:1',
          kind: 'list',
          ordered: false,
          items: ['One', 'Two'],
        },
      ]),
      contentMode: 'full',
      editable: true,
    })

    expect(blocks).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        kind: 'heading',
        level: 2,
        text: 'Intro',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'code',
        text: 'const value = 1',
        language: 'ts',
        editable: true,
      },
      {
        id: 'heading:notes/current.md:intro:block:1',
        kind: 'list',
        ordered: false,
        items: ['One', 'Two'],
        editable: true,
      },
    ])
  })

  it('keeps editable knowledge-engine parsed content blocks in graph full content mode', () => {
    const blocks = createHeadingSectionBlocks({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      contentBlocks: normalizeMarkdownBlocks([
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'paragraph',
          text: 'Body',
        },
        {
          id: 'heading:notes/current.md:intro:block:1',
          kind: 'blockquote',
          text: 'Quote',
        },
        {
          id: 'heading:notes/current.md:intro:block:2',
          kind: 'code',
          text: 'const value = 1',
          language: 'ts',
        },
      ]),
      contentMode: 'full',
      editable: true,
    })

    expect(blocks.slice(1).map((block) => block.editable)).toEqual([true, true, true])
  })

  it('marks graph commit targets for heading and content blocks', () => {
    const blocks = createHeadingSectionViewModel({
      headingId: 'heading:notes/current.md:intro',
      level: 2,
      title: 'Intro',
      contentBlocks: normalizeMarkdownBlocks([
        {
          id: 'heading:notes/current.md:intro:block:0',
          kind: 'paragraph',
          text: 'Body',
        },
        {
          id: 'heading:notes/current.md:intro:block:1',
          kind: 'code',
          text: 'const value = 1',
          language: 'ts',
        },
      ]),
      contentMode: 'full',
      editable: true,
    })

    expect(
      blocks.map((block) => ({
        id: block.id,
        role: block.role,
        commitTarget: block.commitTarget,
      })),
    ).toEqual([
      {
        id: 'heading:notes/current.md:intro:heading',
        role: 'title',
        commitTarget: 'title',
      },
      {
        id: 'heading:notes/current.md:intro:block:0',
        role: 'content',
        commitTarget: 'block',
      },
      {
        id: 'heading:notes/current.md:intro:block:1',
        role: 'content',
        commitTarget: 'block',
      },
    ])
  })

  it('serializes edited text blocks back to markdown content', () => {
    const blocks = normalizeMarkdownBlocks([
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'paragraph',
        text: 'Body',
      },
      {
        id: 'heading:notes/current.md:intro:block:1',
        kind: 'blockquote',
        text: 'Quote',
      },
    ])
    const nextBlocks = updateMarkdownBlockText(blocks, {
      id: 'heading:notes/current.md:intro:block:1',
      text: 'Updated quote',
    })

    expect(nextBlocks).not.toBeNull()
    expect(serializeMarkdownBlocks(nextBlocks ?? [])).toBe('Body\n\n> Updated quote')
  })

  it('serializes edited code blocks back to markdown content', () => {
    const blocks = normalizeMarkdownBlocks([
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'code',
        text: 'const value = 1',
        language: 'ts',
      },
    ])
    const nextBlocks = updateMarkdownBlockText(blocks, {
      id: 'heading:notes/current.md:intro:block:0',
      text: 'const value = 2',
    })

    expect(nextBlocks).not.toBeNull()
    expect(serializeMarkdownBlocks(nextBlocks ?? [])).toBe('```ts\nconst value = 2\n```')
  })

  it('normalizes edited list text back to markdown content', () => {
    const blocks = normalizeMarkdownBlocks([
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'list',
        ordered: true,
        items: ['One', 'Two'],
      },
    ])
    const nextBlocks = updateMarkdownBlockText(blocks, {
      id: 'heading:notes/current.md:intro:block:0',
      text: '1. First\n- Second\nThird',
    })

    expect(nextBlocks).not.toBeNull()
    expect(serializeMarkdownBlocks(nextBlocks ?? [])).toBe('1. First\n2. Second\n3. Third')
  })
})
