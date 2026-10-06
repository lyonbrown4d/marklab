// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('graph interaction styles', () => {
  const graphStyles = readStyle('./app/_graph.scss')
  const workspaceMapStyles = readStyle('./app/_workspace-map.scss')

  it('keeps graph node hover feedback from moving the React Flow drag target', () => {
    const hoverRule = graphStyles.match(
      /\.graph-node-shell:hover,\n\.graph-node-shell:focus-visible,[\s\S]*?\n}/,
    )?.[0]

    expect(hoverRule).toContain('border-color:')
    expect(hoverRule).toContain('box-shadow:')
    expect(hoverRule).not.toContain('transform:')
    expect(hoverRule).not.toContain('translateY(-1px)')
  })

  it('themes file graph nodes through the shared graph node shell', () => {
    expect(graphStyles).toContain('.graph-node-shell--file')
    expect(graphStyles).toContain('--graph-node-accent: hsl(var(--primary));')
  })

  it('keeps workspace relationships quiet until a node is engaged', () => {
    expect(workspaceMapStyles).toContain(
      '.workspace-map-canvas .graph-edge--reference .react-flow__edge-path',
    )
    expect(workspaceMapStyles).toContain('stroke-dasharray: none;')
    expect(workspaceMapStyles).toMatch(/workspace-map-flow-edge--muted[\s\S]*?opacity: 0\.03;/)
  })
})
