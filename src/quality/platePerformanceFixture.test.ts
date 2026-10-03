import { describe, expect, it } from 'vitest'
import {
  createLargeMarkdown,
  inspectLargeMarkdown,
  LARGE_DOCUMENT_EXPECTATIONS,
} from '@/../e2e/performance/largeDocumentFixtureContract'

describe('Plate large-document fixture', () => {
  it('keeps the fixed line, byte, non-empty, and block scale', () => {
    const markdown = createLargeMarkdown()
    const stats = inspectLargeMarkdown(markdown)

    expect(stats).toEqual(LARGE_DOCUMENT_EXPECTATIONS)
    expect(stats.lines).toBe(29_256)
    expect(stats.nonEmptyLines).toBe(29_256)
    expect(stats.bytes).toBeGreaterThan(500_000)
    expect(stats.blockCount).toBeGreaterThan(400)
  })
})
