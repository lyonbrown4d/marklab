import { describe, expect, it, vi } from 'vitest'

vi.mock('@electron/services/workspace/markdown/ast.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@electron/services/workspace/markdown/ast.js')>()

  return { ...actual, parseMarkdownAst: vi.fn(actual.parseMarkdownAst) }
})

import {
  buildNodeOutlineGraph,
  buildNodeWorkspaceGraph,
} from '@electron/services/knowledgeEngine/nodeGraph.js'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast.js'

describe('Node outline graph content blocks', () => {
  it('preserves the structured Markdown blocks owned by each heading', () => {
    const graph = buildNodeOutlineGraph(
      'notes/guide.md',
      [
        '# Guide',
        'Opening paragraph',
        'continues here.',
        '',
        '> Quoted context',
        '>> Nested detail',
        '',
        '```ts',
        'const value = 1',
        '```',
        '',
        '- first',
        '- second',
        '',
        '1. alpha',
        '2. beta',
        '',
        '---',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| A | B |',
        '',
        '## Next',
        'This belongs to the next heading.',
      ].join('\n'),
    )

    const guide = graph.nodes.find((node) => node.id === 'heading:notes/guide.md:guide')
    const next = graph.nodes.find((node) => node.id === 'heading:notes/guide.md:next')

    expect(guide?.content_blocks).toEqual([
      {
        id: 'heading:notes/guide.md:guide:block:0',
        kind: 'paragraph',
        text: 'Opening paragraph\ncontinues here.',
      },
      {
        id: 'heading:notes/guide.md:guide:block:1',
        kind: 'blockquote',
        level: 2,
        text: 'Quoted context\nNested detail',
      },
      {
        id: 'heading:notes/guide.md:guide:block:2',
        kind: 'code',
        language: 'ts',
        text: 'const value = 1',
      },
      {
        id: 'heading:notes/guide.md:guide:block:3',
        items: ['first', 'second'],
        kind: 'list',
        ordered: false,
      },
      {
        id: 'heading:notes/guide.md:guide:block:4',
        items: ['alpha', 'beta'],
        kind: 'list',
        ordered: true,
      },
      { id: 'heading:notes/guide.md:guide:block:5', kind: 'divider' },
      {
        id: 'heading:notes/guide.md:guide:block:6',
        kind: 'table',
        text: '| Name | Value |\n| --- | --- |\n| A | B |',
      },
    ])
    expect(next?.content_blocks).toEqual([
      {
        id: 'heading:notes/guide.md:next:block:0',
        kind: 'paragraph',
        text: 'This belongs to the next heading.',
      },
    ])
  })
})

describe('Node workspace graph file summaries', () => {
  it('resolves extensionless Markdown links against indexed files in the same directory', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'docs/current.md', content: '[架构总览](architecture-overview)' },
        { path: 'docs/architecture-overview.md', content: '# 架构总览' },
      ],
      {
        paths: ['docs/current.md', 'docs/architecture-overview.md'],
        assetPaths: [],
      },
    )

    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        source: 'file:docs/current.md',
        target: 'file:docs/architecture-overview.md',
      }),
    )
    expect(graph.nodes.some((node) => node.kind === 'missing')).toBe(false)
  })

  it('parses each Markdown document exactly once while building summaries', () => {
    vi.mocked(parseMarkdownAst).mockClear()

    buildNodeWorkspaceGraph(
      [
        { path: 'notes/a.md', content: '# Alpha\n\nAlpha summary.' },
        { path: 'notes/b.md', content: '# Beta\n\nBeta summary.' },
      ],
      { paths: ['notes/a.md', 'notes/b.md'], assetPaths: [] },
    )

    expect(parseMarkdownAst).toHaveBeenCalledTimes(2)
  })

  it('keeps a bounded semantic excerpt attached to its normalized file path', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'notes/b.md', content: '# Beta\n\nBeta belongs to the second document.' },
        {
          path: 'notes/a.md',
          content: [
            '---',
            'title: Generated metadata',
            '---',
            '# Alpha',
            '',
            '<!-- generated placeholder -->',
            '',
            '```sh',
            'moon run desktop:electron-dev',
            '```',
            '',
            'Opening paragraph explains the actual document.',
            '',
            '- First useful item',
            '- Second useful item',
            '',
            'A final useful detail.',
            '',
            'This text is intentionally beyond the first meaningful blocks.',
          ].join('\n'),
        },
      ],
      { paths: ['notes/a.md', 'notes/b.md'], assetPaths: [] },
    )

    const alpha = graph.nodes.find((node) => node.id === 'file:notes/a.md')
    const beta = graph.nodes.find((node) => node.id === 'file:notes/b.md')

    expect(alpha?.content).toContain('Opening paragraph explains the actual document.')
    expect(alpha?.content).toContain('First useful item')
    expect(alpha?.content).not.toMatch(/Generated metadata|moon run desktop|beyond/)
    expect(alpha?.content?.length).toBeLessThanOrEqual(420)
    expect(beta?.content).toBe('Beta belongs to the second document.')
    expect(beta?.content).not.toContain('Opening paragraph')
  })

  it('keeps body text that shares an AST block with TOML frontmatter', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        {
          path: 'notes/toml.md',
          content: ['+++', 'title = "Metadata"', '+++', 'Body starts immediately.'].join('\n'),
        },
      ],
      { paths: ['notes/toml.md'], assetPaths: [] },
    )

    expect(graph.nodes.find((node) => node.id === 'file:notes/toml.md')?.content).toBe(
      'Body starts immediately.',
    )
  })

  it('excludes inline code and fenced code nested inside list items', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        {
          path: 'notes/runbook.md',
          content: [
            '# Runbook',
            '',
            'Use `moon run desktop:electron-dev` only during development; readers need this guidance.',
            '',
            '- Deployment notes',
            '',
            '  ```sh',
            '  moon run desktop:build',
            '  ```',
            '',
            '- Recovery notes',
          ].join('\n'),
        },
      ],
      { paths: ['notes/runbook.md'], assetPaths: [] },
    )

    const runbook = graph.nodes.find((node) => node.id === 'file:notes/runbook.md')

    expect(runbook?.content).toContain('Use only during development; readers need this guidance.')
    expect(runbook?.content).toContain('Deployment notes')
    expect(runbook?.content).toContain('Recovery notes')
    expect(runbook?.content).not.toContain('moon run')
  })

  it('separates text around Markdown hard breaks', () => {
    const graph = buildNodeWorkspaceGraph(
      [{ path: 'notes/line-break.md', content: 'Alpha  \nBeta' }],
      { paths: ['notes/line-break.md'], assetPaths: [] },
    )

    expect(graph.nodes.find((node) => node.id === 'file:notes/line-break.md')?.content).toBe(
      'Alpha\nBeta',
    )
  })

  it('falls back to structural headings without repeating the document title', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        {
          path: 'notes/outline.md',
          content: [
            '---',
            'status: draft',
            '---',
            '# Project Outline',
            '',
            '## Goals',
            '',
            '### Milestones',
            '',
            '## Risks',
            '',
            '## This fourth heading is beyond the summary block limit',
          ].join('\n'),
        },
      ],
      { paths: ['notes/outline.md'], assetPaths: [] },
    )

    const outline = graph.nodes.find((node) => node.id === 'file:notes/outline.md')

    expect(outline?.content).toBe('Goals\n\nMilestones\n\nRisks')
    expect(outline?.content).not.toContain('Project Outline')
    expect(outline?.content?.length).toBeLessThanOrEqual(420)
  })
})
