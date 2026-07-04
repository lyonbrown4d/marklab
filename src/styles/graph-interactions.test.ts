// @ts-expect-error Vitest runs this stylesheet regression in Node; the renderer tsconfig intentionally omits Node module types.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readStyle = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8') as string

describe('graph interaction styles', () => {
  const graphStyles = readStyle('./app/_graph.scss')

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
})
