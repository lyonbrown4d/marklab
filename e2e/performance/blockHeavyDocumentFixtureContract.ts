// eslint-disable-next-line no-restricted-imports -- Performance fixtures share one stable stats shape.
import type { LargeDocumentStats } from './largeDocumentFixtureContract.js'

export const BLOCK_HEAVY_DOCUMENT_LINE_COUNT = 29_256
export const BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT = 4_000
export const BLOCK_HEAVY_DOCUMENT_SENTINELS = [
  'MARKLAB_BLOCK_START',
  'MARKLAB_BLOCK_MIDDLE',
  'MARKLAB_BLOCK_END',
] as const

export const BLOCK_HEAVY_DOCUMENT_EXPECTATIONS: LargeDocumentStats = Object.freeze({
  blockCount: BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT,
  bytes: 33_308,
  characters: 33_308,
  headingCount: 0,
  lines: BLOCK_HEAVY_DOCUMENT_LINE_COUNT,
  nonEmptyLines: BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT,
})

export const createBlockHeavyMarkdown = () => {
  const blankLineCount = BLOCK_HEAVY_DOCUMENT_LINE_COUNT - BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT
  const gaps = BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT - 1
  const minimumGap = Math.floor(blankLineCount / gaps)
  const widerGapCount = blankLineCount - minimumGap * gaps
  const lines: string[] = []

  for (let block = 0; block < BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT; block += 1) {
    if (block === 0) lines.push(BLOCK_HEAVY_DOCUMENT_SENTINELS[0])
    else if (block === Math.floor(BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT / 2)) {
      lines.push(BLOCK_HEAVY_DOCUMENT_SENTINELS[1])
    } else if (block === BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT - 1) {
      lines.push(BLOCK_HEAVY_DOCUMENT_SENTINELS[2])
    } else lines.push('x')

    if (block === BLOCK_HEAVY_DOCUMENT_BLOCK_COUNT - 1) continue
    const gap = minimumGap + (block < widerGapCount ? 1 : 0)
    for (let line = 0; line < gap; line += 1) lines.push('')
  }
  return lines.join('\n')
}

export const inspectBlockHeavyMarkdown = (markdown: string): LargeDocumentStats => {
  const lines = markdown.split('\n')
  let blockCount = 0
  let insideBlock = false
  for (const line of lines) {
    if (!line.trim()) {
      insideBlock = false
      continue
    }
    if (!insideBlock) blockCount += 1
    insideBlock = true
  }
  return {
    blockCount,
    bytes: new TextEncoder().encode(markdown).byteLength,
    characters: markdown.length,
    headingCount: 0,
    lines: lines.length,
    nonEmptyLines: lines.filter((line) => line.length > 0).length,
  }
}
