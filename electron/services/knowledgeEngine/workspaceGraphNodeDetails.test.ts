import { describe, expect, it, vi } from 'vitest'

vi.mock('@electron/services/workspace/markdown/ast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/services/workspace/markdown/ast')>()
  return { ...actual, parseMarkdownAst: vi.fn(actual.parseMarkdownAst) }
})

import {
  MAX_GRAPH_NODE_MARKDOWN_CHARACTERS,
  parseWorkspaceGraphNodeDetailsQuery,
  queryWorkspaceGraphNodeDetails,
  selectWorkspaceGraphNodeDocuments,
} from '@electron/services/knowledgeEngine/workspaceGraphNodeDetails'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast'

const documents = [
  { path: 'notes/a.md', content: '# Alpha\n\nAlpha summary.\n\nMore detail.' },
  { path: 'notes/b.md', content: '# Beta\n\nBeta summary.' },
]

describe('queryWorkspaceGraphNodeDetails', () => {
  it('returns bounded summaries only for requested file nodes', () => {
    const result = queryWorkspaceGraphNodeDetails(documents, {
      mode: 'summary',
      node_ids: ['file:notes/a.md', 'file:missing.md'],
    })

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'file:notes/a.md',
          content: expect.stringContaining('Alpha summary.'),
        }),
      ],
      truncated: false,
    })
    expect(result.items[0]?.content.length).toBeLessThanOrEqual(420)
  })

  it('deduplicates and caps requested nodes before producing full details', () => {
    vi.mocked(parseMarkdownAst).mockClear()
    const result = queryWorkspaceGraphNodeDetails(documents, {
      mode: 'full',
      max_nodes: 1,
      node_ids: ['file:notes/a.md', 'file:notes/a.md', 'file:notes/b.md'],
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ id: 'file:notes/a.md' })
    expect(result.items[0]?.content_blocks?.length).toBeGreaterThan(0)
    expect(result.truncated).toBe(true)
    expect(parseMarkdownAst).toHaveBeenCalledOnce()
  })

  it('rejects an unbounded node request', () => {
    expect(() =>
      queryWorkspaceGraphNodeDetails(documents, { mode: 'summary', node_ids: [] }),
    ).toThrow(/node_ids/i)
  })

  it('requires the topology revision at the IPC boundary', () => {
    expect(() =>
      parseWorkspaceGraphNodeDetailsQuery({ mode: 'summary', node_ids: ['file:notes/a.md'] }),
    ).toThrow(/revision/i)
  })

  it('bounds full detail payloads for very large documents', () => {
    const result = queryWorkspaceGraphNodeDetails(
      [{ path: 'large.md', content: `# Large\n\n${'x'.repeat(100_000)}` }],
      { mode: 'full', node_ids: ['file:large.md'] },
    )
    const serializedBlocks = JSON.stringify(result.items[0]?.content_blocks ?? [])

    expect(result.items[0]?.content.length).toBeLessThanOrEqual(420)
    expect(serializedBlocks.length).toBeLessThanOrEqual(17_000)
  })

  it('bounds document content before crossing the worker boundary', () => {
    const selected = selectWorkspaceGraphNodeDocuments(
      [{ path: 'large.md', content: 'x'.repeat(MAX_GRAPH_NODE_MARKDOWN_CHARACTERS + 1_000) }],
      { mode: 'summary', node_ids: ['file:large.md'] },
    )

    expect(selected[0]?.content).toHaveLength(MAX_GRAPH_NODE_MARKDOWN_CHARACTERS)
  })

  it('keeps semantic excerpts isolated and excludes metadata and code', () => {
    const result = queryWorkspaceGraphNodeDetails(
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
      { mode: 'summary', node_ids: ['file:notes/a.md', 'file:notes/b.md'] },
    )
    const alpha = result.items.find((item) => item.id === 'file:notes/a.md')
    const beta = result.items.find((item) => item.id === 'file:notes/b.md')

    expect(alpha?.content).toContain('Opening paragraph explains the actual document.')
    expect(alpha?.content).toContain('First useful item')
    expect(alpha?.content).not.toMatch(/Generated metadata|moon run desktop|beyond/)
    expect(beta?.content).toBe('Beta belongs to the second document.')
  })

  it.each([
    {
      name: 'body text following TOML frontmatter',
      content: ['+++', 'title = "Metadata"', '+++', 'Body starts immediately.'].join('\n'),
      expected: 'Body starts immediately.',
    },
    {
      name: 'Markdown hard breaks',
      content: 'Alpha  \nBeta',
      expected: 'Alpha\nBeta',
    },
  ])('keeps $name in summaries', ({ content, expected }) => {
    const result = queryWorkspaceGraphNodeDetails([{ path: 'notes/a.md', content }], {
      mode: 'summary',
      node_ids: ['file:notes/a.md'],
    })

    expect(result.items[0]?.content).toBe(expected)
  })

  it('excludes code while keeping surrounding list guidance', () => {
    const content = [
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
    ].join('\n')
    const result = queryWorkspaceGraphNodeDetails([{ path: 'notes/a.md', content }], {
      mode: 'summary',
      node_ids: ['file:notes/a.md'],
    })

    expect(result.items[0]?.content).toContain('Use only during development')
    expect(result.items[0]?.content).toContain('Deployment notes')
    expect(result.items[0]?.content).toContain('Recovery notes')
    expect(result.items[0]?.content).not.toContain('moon run')
  })

  it('falls back to structural headings without repeating the document title', () => {
    const content = [
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
    ].join('\n')
    const result = queryWorkspaceGraphNodeDetails([{ path: 'notes/a.md', content }], {
      mode: 'summary',
      node_ids: ['file:notes/a.md'],
    })

    expect(result.items[0]?.content).toBe('Goals\n\nMilestones\n\nRisks')
  })
})
