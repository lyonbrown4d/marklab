import { describe, expect, it, vi } from 'vitest'
import {
  createKnowledgeTopology,
  readGraphPalette,
  type GraphPalette,
} from '@/features/knowledge-graph/graphologyAdapter'
import { testExternalGraphNode, testGraph } from '@/features/knowledge-graph/testGraph'

const palette: GraphPalette = {
  file: '#111111',
  preview: '#222222',
  missing: '#333333',
  foreground: '#444444',
  muted: '#555555',
  edge: '#666666',
  primary: '#777777',
  background: '#ffffff',
}

describe('Graphology domain adapter', () => {
  it('renders website nodes as bundled globes with a safe existing palette fallback', () => {
    const data = testGraph()
    const website = testExternalGraphNode()
    data.nodes.push(website)
    const graph = createKnowledgeTopology(data, {}, palette)
    expect(graph.getNodeAttributes(website.id)).toMatchObject({
      kind: 'external',
      label: website.label,
      iconKind: 'website',
      color: palette.preview,
      layoutGroup: 'website:example.com',
    })
  })
  it('resolves local and root theme colors for WebGL with a fallback and no leftover probes', () => {
    const container = document.createElement('div')
    const marker = document.createElement('span')
    container.append(marker)
    document.body.append(container)
    const theme = document.createElement('div').style
    theme.setProperty('--primary', '0 100% 50%')
    theme.setProperty('--chart-2', '240 100% 50%')
    container.style.setProperty('--primary', '120 100% 50%')
    const computedStyle = globalThis.getComputedStyle
    const style = vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element) => {
      if (element === document.documentElement) return theme
      if (element === container) return container.style
      return computedStyle(element)
    })
    try {
      expect(readGraphPalette(container)).toEqual({
        file: 'rgb(0, 255, 0)',
        primary: 'rgb(0, 255, 0)',
        preview: 'rgb(0, 0, 255)',
        missing: 'rgb(100, 116, 139)',
        external: 'rgb(0, 0, 255)',
        foreground: 'rgb(100, 116, 139)',
        muted: 'rgb(100, 116, 139)',
        edge: 'rgb(100, 116, 139)',
        background: 'rgb(100, 116, 139)',
      })
      container.style.removeProperty('--primary')
      expect(readGraphPalette(container).primary).toBe('rgb(255, 0, 0)')
      expect(Array.from(container.children)).toEqual([marker])
    } finally {
      style.mockRestore()
      container.remove()
    }
  })
  it('preserves directed reference weights and restored positions with degree-based node sizes', () => {
    const graph = createKnowledgeTopology(testGraph(), { 'file:a.md': { x: 10, y: 20 } }, palette)
    expect(graph.getNodeAttributes('file:a.md')).toMatchObject({
      x: 10,
      y: 20,
      label: 'Alpha',
      kind: 'file',
      size: 10 + Math.sqrt(2),
      iconKind: 'markdown',
      image: expect.stringContaining('data:image/svg+xml'),
    })
    expect(graph.getNodeAttribute('missing:c.md', 'color')).toBe('#333333')
    expect(graph.getNodeAttribute('missing:c.md', 'iconKind')).toBe('missing')
    expect(graph.getNodeAttribute('file:a.md', 'layoutGroup')).toBe('directory:.')
    expect(graph.getNodeAttribute('missing:c.md', 'layoutGroup')).toBe('directory:.')
    expect(graph.source('a-b')).toBe('file:a.md')
    expect(graph.target('a-b')).toBe('file:b.md')
    expect(graph.getEdgeAttribute('a-b', 'weight')).toBe(3)
    const first = graph.getNodeAttributes('file:b.md')
    const second = graph.getNodeAttributes('missing:c.md')
    expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(true)
    expect(Number.isFinite(second.x) && Number.isFinite(second.y)).toBe(true)
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(0)
  })
  it('omits dangling edges and supports parallel edges and self links', () => {
    const data = testGraph()
    data.edges.push(
      { ...data.edges[0], id: 'parallel' },
      { ...data.edges[0], id: 'self', target: 'file:a.md' },
      { ...data.edges[0], id: 'dangling', target: 'absent' },
    )
    const graph = createKnowledgeTopology(data, {}, palette)
    expect(graph.size).toBe(4)
    expect(graph.hasEdge('parallel')).toBe(true)
    expect(graph.hasEdge('self')).toBe(true)
    expect(graph.hasEdge('dangling')).toBe(false)
  })
})
