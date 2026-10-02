import { describe, expect, it } from 'vitest'
import {
  createVirtualizedMarkdownDocument,
  updateVirtualizedMarkdownSegment,
} from '@/components/milkdown/virtualizedMarkdownDocument'

const section = (index: number) =>
  [
    `## Section ${index}`,
    '',
    ...Array.from({ length: 80 }, (_, line) => `Paragraph ${line}.`),
  ].join('\n\n')

describe('virtualized Markdown document', () => {
  it('splits a large document on semantic block boundaries and reconstructs it losslessly', () => {
    const markdown = Array.from({ length: 12 }, (_, index) => section(index)).join('\n\n')
    const document = createVirtualizedMarkdownDocument(markdown)

    expect(document.segments.length).toBeGreaterThan(1)
    expect(document.segments.every((segment) => segment.markdown.startsWith('## Section'))).toBe(
      true,
    )
    expect(document.toMarkdown()).toBe(markdown)
  })

  it('keeps fenced code and GFM tables inside a single segment', () => {
    const markdown = [
      section(0),
      '```mermaid',
      'graph TD',
      ...Array.from({ length: 800 }, (_, index) => `A${index} --> A${index + 1}`),
      '```',
      '',
      '| A | B |',
      '| --- | --- |',
      ...Array.from({ length: 300 }, (_, index) => `| ${index} | value |`),
      '',
      section(1),
    ].join('\n')
    const document = createVirtualizedMarkdownDocument(markdown)

    expect(document.segments.some((segment) => segment.markdown.includes('A799 --> A800'))).toBe(
      true,
    )
    expect(document.segments.some((segment) => segment.markdown.includes('| 299 | value |'))).toBe(
      true,
    )
    expect(document.toMarkdown()).toBe(markdown)
  })

  it('windows a line-dense paragraph that Markdown parses as one top-level node', () => {
    const markdown = Array.from({ length: 29_256 }, (_, index) => `line-${index}`).join('\n')
    const document = createVirtualizedMarkdownDocument(markdown)

    expect(document.segments.length).toBeGreaterThan(20)
    expect(document.segments.every((segment) => segment.markdown.length <= 17_000)).toBe(true)
    expect(document.toMarkdown()).toBe(markdown)
  })

  it('updates one segment while preserving untouched source slices and stable identities', () => {
    const markdown = Array.from({ length: 12 }, (_, index) => section(index)).join('\n\n')
    const document = createVirtualizedMarkdownDocument(markdown)
    const target = document.segments[1]
    const untouched = document.segments[0]
    const updated = updateVirtualizedMarkdownSegment(document, target.id, '# Edited')

    expect(updated.segments[0]).toBe(untouched)
    expect(updated.segments[1].id).toBe(target.id)
    expect(updated.toMarkdown()).toContain(`${target.leading}# Edited`)
    expect(updated.toMarkdown()).not.toContain(target.markdown)
  })
})
