import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import {
  patchGraphHeadingContent,
  patchGraphHeadingDeleted,
  patchGraphHeadingInserted,
  patchGraphHeadingTitle,
} from '@/logic/graphOptimistic'

const createGraph = (): GraphData => ({
  nodes: [
    {
      id: 'file:notes/current.md',
      data: {
        label: 'current.md',
        path: 'notes/current.md',
      },
      position: { x: -240, y: 0 },
    },
    {
      id: 'heading:notes/current.md:intro',
      type: 'heading',
      data: {
        label: 'Intro',
        path: 'notes/current.md',
        line: 1,
        level: 1,
        content: 'Body',
        contentStartLine: 2,
        contentEndLine: 3,
        contentBlocks: [
          {
            id: 'heading:notes/current.md:intro:block:0',
            kind: 'paragraph',
            text: 'Body',
            editable: false,
          },
        ],
      },
      position: { x: 0, y: 0 },
    },
    {
      id: 'heading:notes/current.md:next',
      type: 'heading',
      data: {
        label: 'Next',
        line: 3,
        contentStartLine: 4,
        contentEndLine: 4,
      },
      position: { x: 0, y: 120 },
    },
  ],
  edges: [
    {
      id: 'file:notes/current.md->heading:notes/current.md:intro-0',
      source: 'file:notes/current.md',
      target: 'heading:notes/current.md:intro',
      type: 'smoothstep',
    },
    {
      id: 'file:notes/current.md->heading:notes/current.md:next-1',
      source: 'file:notes/current.md',
      target: 'heading:notes/current.md:next',
      type: 'smoothstep',
    },
  ],
  layoutKey: 'outline:file',
})

describe('graph optimistic patches', () => {
  it('patches heading titles without changing layout metadata', () => {
    const graph = createGraph()
    const next = patchGraphHeadingTitle(graph, 'heading:notes/current.md:intro', 'Updated')

    expect(next).not.toBe(graph)
    expect(next.layoutKey).toBe('outline:file')
    expect(
      next.nodes.find((node) => node.id === 'heading:notes/current.md:intro')?.data.label,
    ).toBe('Updated')
  })

  it('patches heading content and parsed blocks for inline graph edits', () => {
    const graph = createGraph()
    const nextBlocks = [
      {
        id: 'heading:notes/current.md:intro:block:0',
        kind: 'code' as const,
        text: 'const value = 2',
        language: 'ts',
        editable: true,
      },
    ]
    const next = patchGraphHeadingContent(
      graph,
      'heading:notes/current.md:intro',
      '```ts\nconst value = 2\n```',
      nextBlocks,
    )

    const updated = next.nodes.find((node) => node.id === 'heading:notes/current.md:intro')
    expect(updated?.data.content).toBe('```ts\nconst value = 2\n```')
    expect(updated?.data.contentBlocks).toEqual(nextBlocks)
  })

  it('keeps later heading line ranges aligned when content line counts change', () => {
    const graph = createGraph()
    const next = patchGraphHeadingContent(
      graph,
      'heading:notes/current.md:intro',
      'Line one\nLine two\nLine three',
    )

    const updated = next.nodes.find((node) => node.id === 'heading:notes/current.md:intro')
    const shifted = next.nodes.find((node) => node.id === 'heading:notes/current.md:next')
    expect(updated?.data.contentEndLine).toBe(5)
    expect(shifted?.data.line).toBe(5)
    expect(shifted?.data.contentStartLine).toBe(6)
    expect(shifted?.data.contentEndLine).toBe(6)
  })

  it('returns the same graph when the target is missing', () => {
    const graph = createGraph()

    expect(patchGraphHeadingTitle(graph, 'missing', 'Updated')).toBe(graph)
    expect(patchGraphHeadingContent(graph, 'missing', 'Updated')).toBe(graph)
  })

  it('optimistically inserts a selected heading and shifts later line metadata', () => {
    const graph = createGraph()
    const next = patchGraphHeadingInserted(graph, {
      insertLine: 3,
      level: 2,
      nodeId: 'heading:notes/current.md:new-topic',
      parentId: 'heading:notes/current.md:intro',
      targetId: 'heading:notes/current.md:intro',
      title: 'New Topic',
    })

    const inserted = next.nodes.find((node) => node.id === 'heading:notes/current.md:new-topic')
    const shifted = next.nodes.find((node) => node.id === 'heading:notes/current.md:next')

    expect(inserted?.selected).toBe(true)
    expect(inserted?.data.line).toBe(3)
    expect(inserted?.data.level).toBe(2)
    expect(shifted?.data.line).toBe(4)
    expect(next.edges.some((edge) => edge.target === inserted?.id)).toBe(true)
  })

  it('optimistically deletes a heading subtree and shifts later line metadata', () => {
    const graph = createGraph()
    const withChild = patchGraphHeadingInserted(graph, {
      insertLine: 3,
      level: 2,
      nodeId: 'heading:notes/current.md:child',
      parentId: 'heading:notes/current.md:intro',
      targetId: 'heading:notes/current.md:intro',
      title: 'Child',
    })
    const next = patchGraphHeadingDeleted(withChild, {
      deleteStartLine: 1,
      deleteEndLine: 4,
      targetId: 'heading:notes/current.md:intro',
    })

    expect(next.nodes.some((node) => node.id === 'heading:notes/current.md:intro')).toBe(false)
    expect(next.nodes.some((node) => node.id === 'heading:notes/current.md:child')).toBe(false)
    expect(next.nodes.find((node) => node.id === 'heading:notes/current.md:next')?.data.line).toBe(
      1,
    )
    expect(next.edges.some((edge) => edge.target === 'heading:notes/current.md:intro')).toBe(false)
  })
})
