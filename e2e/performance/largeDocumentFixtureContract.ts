export const LARGE_DOCUMENT_LINE_COUNT = 29_256

export type LargeDocumentStats = {
  blockCount: number
  bytes: number
  characters: number
  headingCount: number
  lines: number
  nonEmptyLines: number
}

export const LARGE_DOCUMENT_EXPECTATIONS: LargeDocumentStats = Object.freeze({
  blockCount: 488,
  bytes: 1_367_467,
  characters: 1_367_467,
  headingCount: 244,
  lines: LARGE_DOCUMENT_LINE_COUNT,
  nonEmptyLines: LARGE_DOCUMENT_LINE_COUNT,
})

export const createLargeMarkdown = () => {
  const lines: string[] = []
  for (let line = 0; line < LARGE_DOCUMENT_LINE_COUNT; line += 1) {
    if (line % 120 === 0) {
      lines.push(`## Section ${String(Math.floor(line / 120) + 1).padStart(4, '0')}`)
      continue
    }
    lines.push(`Line ${String(line + 1).padStart(5, '0')}: Plate performance fixture content.`)
  }
  return lines.join('\n')
}

export const inspectLargeMarkdown = (markdown: string): LargeDocumentStats => {
  const lines = markdown.split('\n')
  let blockCount = 0
  let headingCount = 0
  let insideContentBlock = false

  for (const line of lines) {
    if (line.startsWith('## ')) {
      headingCount += 1
      blockCount += 1
      insideContentBlock = false
      continue
    }
    if (line.trim()) {
      if (!insideContentBlock) blockCount += 1
      insideContentBlock = true
    } else {
      insideContentBlock = false
    }
  }

  return {
    blockCount,
    bytes: new TextEncoder().encode(markdown).byteLength,
    characters: markdown.length,
    headingCount,
    lines: lines.length,
    nonEmptyLines: lines.filter((line) => line.trim().length > 0).length,
  }
}
