import { describe, expect, it } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Unit coverage locks the Node-run fixture contract.
import {
  BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
  BLOCK_HEAVY_DOCUMENT_SENTINELS,
  createBlockHeavyMarkdown,
  inspectBlockHeavyMarkdown,
} from '../../../e2e/performance/blockHeavyDocumentFixtureContract'
// eslint-disable-next-line no-restricted-imports -- Unit coverage locks the Node-run fixture contract.
import {
  createLargeMarkdown,
  inspectLargeMarkdown,
  LARGE_DOCUMENT_EXPECTATIONS,
  LARGE_DOCUMENT_SENTINELS,
} from '../../../e2e/performance/largeDocumentFixtureContract'

describe('block-heavy performance fixture', () => {
  it('keeps the target line, character, and short-block shape stable', () => {
    const markdown = createBlockHeavyMarkdown()
    const stats = inspectBlockHeavyMarkdown(markdown)

    expect(stats).toEqual(BLOCK_HEAVY_DOCUMENT_EXPECTATIONS)
    expect(stats.lines).toBe(29_256)
    expect(stats.characters).toBeGreaterThanOrEqual(33_000)
    expect(stats.characters).toBeLessThanOrEqual(38_000)
    expect(stats.blockCount).toBe(4_000)
  })

  it('places hydration sentinels in document order', () => {
    const markdown = createBlockHeavyMarkdown()
    const positions = BLOCK_HEAVY_DOCUMENT_SENTINELS.map((sentinel) => markdown.indexOf(sentinel))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
  })
})

describe('text-heavy performance fixture', () => {
  it('preserves its exact shape and ordered hydration sentinels', () => {
    const markdown = createLargeMarkdown()
    const positions = LARGE_DOCUMENT_SENTINELS.map((sentinel) => markdown.indexOf(sentinel))

    expect(inspectLargeMarkdown(markdown)).toEqual(LARGE_DOCUMENT_EXPECTATIONS)
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((left, right) => left - right))
  })
})
