import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { graphNodeShellClass } from '@/components/GraphNodeStyles'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('graph interaction styles', () => {
  const graphStyles = readStyle('./app/_graph.scss')
  const graphNavigationStyles = readStyle('./app/_graph-navigation.scss')
  const workspaceMapGroupComponent = readStyle(
    '../pages/workspace-map/WorkspaceMapGroupRegions.tsx',
  )
  const workspaceMapStyles = readStyle('./app/_workspace-map.scss')

  it('keeps graph node hover feedback from moving the React Flow drag target', () => {
    const hoverRule = graphStyles.match(
      /\.react-flow__node:focus-visible \.graph-node-shell \{[\s\S]*?\n}/,
    )?.[0]

    expect(hoverRule).toContain('border-color:')
    expect(hoverRule).toContain('box-shadow:')
    expect(hoverRule).not.toContain('transform:')
    expect(hoverRule).not.toContain('translateY(-1px)')
    expect(graphNodeShellClass).toContain('hover:border-')
    expect(graphNodeShellClass).toContain('hover:shadow-')
    expect(graphNodeShellClass).not.toMatch(/hover:(?:translate|transform|scale)/)
  })

  it('uses stable drag feedback and directional resize affordances', () => {
    const draggingRule = graphNavigationStyles.match(
      /\.workspace-map-canvas \.react-flow__node\.draggable\.dragging\s*\{[\s\S]*?\n}/,
    )?.[0]

    expect(graphNavigationStyles).toMatch(
      /\.workspace-map-canvas \.react-flow__node\.draggable:not\(\.dragging\)[\s\S]*?cursor: grab;/,
    )
    expect(graphNavigationStyles).toMatch(
      /\.workspace-map-canvas \.react-flow__node\.draggable\.dragging[\s\S]*?cursor: grabbing;/,
    )
    expect(draggingRule).not.toContain('transform:')
    expect(graphNavigationStyles).toMatch(
      /resize-line:is\(\.left, \.right\)[\s\S]*?cursor: ew-resize;/,
    )
    expect(graphNavigationStyles).toMatch(
      /resize-line:is\(\.top, \.bottom\)[\s\S]*?cursor: ns-resize;/,
    )
    expect(graphNavigationStyles).toMatch(/resize-handle:is\(\.top\.left, \.bottom\.right\)/)
    expect(graphNavigationStyles).toMatch(/resize-handle:is\(\.top\.right, \.bottom\.left\)/)
  })

  it('only advertises preview drag handles from draggable React Flow nodes', () => {
    expect(graphNavigationStyles).toMatch(
      /\.react-flow__node\.draggable[\s\S]*?workspace-map-web-drag-handle[\s\S]*?cursor: grab;/,
    )
    expect(graphNavigationStyles).toMatch(
      /\.react-flow__node:not\(\.draggable\)[\s\S]*?embedded-preview-drag-handle[\s\S]*?cursor: default;/,
    )
  })

  it('drives every resize affordance from the focusable React Flow node', () => {
    expect(graphNavigationStyles).toMatch(
      /\.react-flow__node:is\(:focus-visible, :focus-within\)[\s\S]*?workspace-map-node__resize-handle/,
    )
    expect(graphNavigationStyles).toMatch(
      /\.react-flow__node:is\(:focus-visible, :focus-within\)[\s\S]*?workspace-map-node__resize-line/,
    )
    expect(graphNavigationStyles).not.toContain(
      '.workspace-map-node__resize-handle:is(:hover, :focus-visible)',
    )
  })

  it('themes graph shells through the shared node accent', () => {
    expect(graphNodeShellClass).toContain('[--graph-node-accent:hsl(var(--foreground))]')
    expect(graphNodeShellClass).toContain('var(--graph-node-accent)')
  })

  it('keeps workspace relationships quiet until a node is engaged', () => {
    expect(workspaceMapStyles).toContain(
      '.workspace-map-canvas .graph-edge--reference .react-flow__edge-path',
    )
    expect(workspaceMapStyles).toContain('stroke-dasharray: none;')
    expect(workspaceMapStyles).toMatch(/workspace-map-flow-edge--muted[\s\S]*?opacity: 0\.03;/)
  })

  it('keeps workspace group surfaces opaque inside the transformed canvas', () => {
    expect(workspaceMapGroupComponent).toContain('[contain:layout_paint_style]')
    expect(workspaceMapGroupComponent).toContain(
      'bg-[color-mix(in_srgb,hsl(var(--workspace-group-color))_5.5%,hsl(var(--background)))]',
    )
    expect(workspaceMapGroupComponent).not.toMatch(/bg-\[[^\]]*\/\s*[\d.]+%/)
  })
})
