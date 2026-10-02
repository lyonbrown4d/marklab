import fs from 'node:fs'
import path from 'node:path'

export const LARGE_DOCUMENT_FILE_NAME = 'large-document.md'
export const LARGE_DOCUMENT_LINE_COUNT = 29_256

export type LargeDocumentFixture = {
  filePath: string
  sourceStats: {
    bytes: number
    characters: number
    lines: number
  }
  workspacePath: string
}

export const createLargeMarkdown = () => {
  const lines: string[] = []
  for (let line = 0; line < LARGE_DOCUMENT_LINE_COUNT; line += 1) {
    if (line % 120 === 0) {
      lines.push(`## S${Math.floor(line / 120) + 1}`)
      continue
    }
    lines.push(line % 9 === 0 ? 'x' : '')
  }
  return lines.join('\n')
}

export const writeLargeDocumentWorkspace = (runtimeRoot: string): LargeDocumentFixture => {
  const workspacePath = path.join(runtimeRoot, 'workspace')
  fs.mkdirSync(workspacePath, { recursive: true })
  const markdown = createLargeMarkdown()
  const filePath = path.join(workspacePath, LARGE_DOCUMENT_FILE_NAME)
  fs.writeFileSync(filePath, markdown, 'utf8')
  return {
    filePath,
    sourceStats: {
      bytes: Buffer.byteLength(markdown),
      characters: markdown.length,
      lines: markdown.split('\n').length,
    },
    workspacePath,
  }
}
