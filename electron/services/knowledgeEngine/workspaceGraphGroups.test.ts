import { describe, expect, it } from 'vitest'

import { buildNodeWorkspaceGraph } from '@electron/services/knowledgeEngine/nodeGraph.js'
import { deriveWorkspaceGraphGroups } from '@electron/services/knowledgeEngine/workspaceGraphGroups.js'
import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast.js'

describe('workspace graph groups', () => {
  it('derives groups from Markdown metadata and link communities', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        {
          path: 'deploy.md',
          content: '---\ngroup: Operations\n---\n# Deploy\n\n[Runbook](runbook.md)',
        },
        { path: 'runbook.md', content: '# Operations Runbook\n\n[Deploy](deploy.md)' },
        { path: 'sdk-core.md', content: '# SDK Core\n\n[SDK plugins](sdk-plugins.md)' },
        { path: 'sdk-plugins.md', content: '# SDK Plugins\n\n[SDK core](sdk-core.md)' },
      ],
      {
        paths: ['deploy.md', 'runbook.md', 'sdk-core.md', 'sdk-plugins.md'],
        assetPaths: [],
      },
    )
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))

    expect(nodes.get('file:deploy.md')?.group).toMatchObject({
      label: 'Operations',
      source: 'frontmatter',
    })
    expect(nodes.get('file:runbook.md')?.group?.key).toBe(nodes.get('file:deploy.md')?.group?.key)
    expect(nodes.get('file:sdk-core.md')?.group?.key).toBe(
      nodes.get('file:sdk-plugins.md')?.group?.key,
    )
    expect(nodes.get('file:sdk-core.md')?.group?.key).not.toBe(
      nodes.get('file:deploy.md')?.group?.key,
    )
  })

  it('uses heading links as file-level grouping evidence', () => {
    const documents = [
      { id: 'file:a.md', path: 'a.md', tree: parseMarkdownAst('# Source') },
      { id: 'file:b.md', path: 'b.md', tree: parseMarkdownAst('# Target\n\n## Details') },
      { id: 'file:unrelated.md', path: 'unrelated.md', tree: parseMarkdownAst('# Standalone') },
    ]
    const groups = deriveWorkspaceGraphGroups(documents, [
      {
        id: 'target-contains-details',
        kind: 'contains',
        source: 'heading:b.md:target',
        target: 'heading:b.md:details',
      },
      {
        id: 'b-contains-target',
        kind: 'contains',
        source: 'file:b.md',
        target: 'heading:b.md:target',
      },
      {
        id: 'a-references-details',
        kind: 'references_heading',
        source: 'file:a.md',
        target: 'heading:b.md:details',
      },
    ])

    expect(groups.get('file:a.md')?.key).toBe(groups.get('file:b.md')?.key)
    expect(groups.get('file:a.md')?.key).not.toBe(groups.get('file:unrelated.md')?.key)
    expect(groups.get('file:a.md')?.key).not.toBe('workspace:root')
  })

  it('safely ignores cyclic and missing heading ancestry', () => {
    const documents = [
      { id: 'file:a.md', path: 'a.md', tree: parseMarkdownAst('# Alpha') },
      { id: 'file:b.md', path: 'b.md', tree: parseMarkdownAst('# Beta') },
    ]
    const groups = deriveWorkspaceGraphGroups(documents, [
      { id: 'cycle-a', kind: 'contains', source: 'heading:two', target: 'heading:one' },
      { id: 'cycle-b', kind: 'contains', source: 'heading:one', target: 'heading:two' },
      {
        id: 'a-references-cycle',
        kind: 'references_heading',
        source: 'file:a.md',
        target: 'heading:one',
      },
      {
        id: 'b-references-missing',
        kind: 'references_heading',
        source: 'file:b.md',
        target: 'heading:missing',
      },
    ])

    expect(groups.size).toBe(2)
    expect(groups.get('file:a.md')?.key).not.toBe(groups.get('file:b.md')?.key)
  })

  it('preserves conflicting explicit groups across linked documents', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'alpha.md', content: '---\ngroup: Alpha\n---\n[Beta](beta.md)' },
        { path: 'beta.md', content: '---\ngroup: Beta\n---\n[Alpha](alpha.md)' },
      ],
      { paths: ['alpha.md', 'beta.md'], assetPaths: [] },
    )
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))

    expect(nodes.get('file:alpha.md')?.group?.label).toBe('Alpha')
    expect(nodes.get('file:beta.md')?.group?.label).toBe('Beta')
    expect(nodes.get('file:alpha.md')?.group?.key).not.toBe(nodes.get('file:beta.md')?.group?.key)
  })

  it('keeps explicit group keys distinct when readable slugs would collide', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'cpp.md', content: '---\ngroup: C++\n---' },
        { path: 'csharp.md', content: '---\ngroup: C#\n---' },
        { path: 'sparkles.md', content: '---\ngroup: "✨"\n---' },
        { path: 'rocket.md', content: '---\ngroup: "🚀"\n---' },
      ],
      { paths: ['cpp.md', 'csharp.md', 'sparkles.md', 'rocket.md'], assetPaths: [] },
    )
    const keys = graph.nodes.map((node) => node.group?.key)

    expect(new Set(keys).size).toBe(4)
    expect(keys.every((key) => key && !key.endsWith(':'))).toBe(true)
  })

  it('keeps large explicit groups together without all-pairs token edges', () => {
    const documents = Array.from({ length: 18 }, (_, index) => ({
      path: `guides/doc-${index}.md`,
      content: index < 17 ? '---\ngroup: Guides\n---' : '# Standalone guide',
    }))
    const graph = buildNodeWorkspaceGraph(documents, {
      paths: documents.map((document) => document.path),
      assetPaths: [],
    })
    const explicitNodes = graph.nodes.filter((node) => node.group?.source === 'frontmatter')

    expect(explicitNodes).toHaveLength(17)
    expect(new Set(explicitNodes.map((node) => node.group?.key)).size).toBe(1)
    expect(graph.nodes.find((node) => node.id.endsWith('doc-17.md'))?.group?.source).toBe('path')
  })

  it('aggregates disconnected singleton documents by their shared directory', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'docs/alpha.md', content: '# Apples' },
        { path: 'docs/beta.md', content: '# Bananas' },
      ],
      { paths: ['docs/alpha.md', 'docs/beta.md'], assetPaths: [] },
    )

    expect(graph.nodes[0]?.group?.source).toBe('path')
    expect(graph.nodes[0]?.group?.key).toBe(graph.nodes[1]?.group?.key)
  })

  it('safely accepts only string scalar YAML and TOML groups', () => {
    const graph = buildNodeWorkspaceGraph(
      [
        { path: 'yaml.md', content: '---\ngroup: "Release: Alpha"\n---' },
        { path: 'toml.md', content: '+++\ngroup = "C=Sharp"\n+++' },
        { path: 'number.md', content: '---\ngroup: 123\n---' },
        { path: 'array.md', content: '---\ngroup: [Alpha, Beta]\n---' },
        { path: 'invalid.md', content: '---\ngroup: [unterminated\n---' },
      ],
      { paths: ['yaml.md', 'toml.md', 'number.md', 'array.md', 'invalid.md'], assetPaths: [] },
    )
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))

    expect(nodes.get('file:yaml.md')?.group).toMatchObject({
      label: 'Release: Alpha',
      source: 'frontmatter',
    })
    expect(nodes.get('file:toml.md')?.group).toMatchObject({
      label: 'C=Sharp',
      source: 'frontmatter',
    })
    expect(nodes.get('file:number.md')?.group?.source).not.toBe('frontmatter')
    expect(nodes.get('file:array.md')?.group?.source).not.toBe('frontmatter')
    expect(nodes.get('file:invalid.md')?.group?.source).not.toBe('frontmatter')
  })

  it('handles malformed Unicode group labels without aborting graph construction', () => {
    expect(() =>
      buildNodeWorkspaceGraph(
        [{ path: 'malformed.md', content: '---\ngroup: "\\uD800"\n---\n# Safe fallback' }],
        { paths: ['malformed.md'], assetPaths: [] },
      ),
    ).not.toThrow()
  })
})
