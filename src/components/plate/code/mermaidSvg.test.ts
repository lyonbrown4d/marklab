import { describe, expect, it } from 'vitest'
import { createSafeMermaidSvgNode } from '@/components/plate/code/mermaidSvg'

describe('createSafeMermaidSvgNode', () => {
  it('keeps safe Mermaid SVG output', () => {
    const node = createSafeMermaidSvgNode('<svg><text>Diagram</text></svg>')

    expect(node?.querySelector('text')?.textContent).toBe('Diagram')
  })

  it('normalizes HTML entities emitted by Mermaid labels', () => {
    const node = createSafeMermaidSvgNode('<svg><text>First&nbsp;line</text></svg>')

    expect(node?.querySelector('text')?.textContent).toBe('First line')
  })

  it('removes executable SVG content and unsafe links', () => {
    const node = createSafeMermaidSvgNode(
      '<svg onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a></svg>',
    )

    expect(node?.querySelector('script')).toBeNull()
    expect(node?.getAttribute('onload')).toBeNull()
    expect(node?.querySelector('a')?.getAttribute('href')).toBeNull()
  })

  it('keeps only fragment URL attributes and fragment CSS references', () => {
    const node = createSafeMermaidSvgNode(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs><linearGradient id="fade" /></defs>
        <a id="safe" href="#fade" xlink:href="#fade" style="fill:url(#fade)"><text>x</text></a>
        <image id="external" href="https://example.com/a.png" src="data:image/png;base64,AA==" />
      </svg>
    `)

    expect(node?.querySelector('#safe')?.getAttribute('href')).toBe('#fade')
    expect(node?.querySelector('#safe')?.getAttribute('xlink:href')).toBe('#fade')
    expect(node?.querySelector('#safe')?.getAttribute('style')).toBe('fill:url(#fade)')
    expect(node?.querySelector('#external')?.getAttribute('href')).toBeNull()
    expect(node?.querySelector('#external')?.getAttribute('src')).toBeNull()
  })

  it('removes XML bases, foreign content, and externally loading styles', () => {
    const node = createSafeMermaidSvgNode(`
      <svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.com/">
        <style>@import url('https://example.com/theme.css'); .node { fill: red; }</style>
        <g id="unsafe-style" style="fill:url(https://example.com/pixel.svg)"></g>
        <foreignObject><div>HTML</div></foreignObject>
      </svg>
    `)

    expect(node?.getAttribute('xml:base')).toBeNull()
    expect(node?.querySelector('style')).toBeNull()
    expect(node?.querySelector('#unsafe-style')?.getAttribute('style')).toBeNull()
    expect(node?.querySelector('foreignObject')).toBeNull()
  })

  it('rejects invalid non-SVG output', () => {
    expect(createSafeMermaidSvgNode('<html></html>')).toBeNull()
  })
})
