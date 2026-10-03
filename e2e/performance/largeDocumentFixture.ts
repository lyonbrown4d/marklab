import fs from 'node:fs'
import path from 'node:path'
/* eslint-disable no-restricted-imports -- Performance E2E fixture contracts are sibling modules. */
import {
  createLargeMarkdown,
  inspectLargeMarkdown,
  LARGE_DOCUMENT_EXPECTATIONS,
  LARGE_DOCUMENT_SENTINELS,
  type LargeDocumentStats,
} from './largeDocumentFixtureContract.js'
export * from './largeDocumentFixtureContract.js'
/* eslint-enable no-restricted-imports */

export const LARGE_DOCUMENT_FILE_NAME = 'large-document.md'

export type LargeDocumentFixture = {
  filePath: string
  fileName: string
  sentinels: readonly string[]
  sourceStats: LargeDocumentStats
  workspacePath: string
}

export const writeLargeDocumentWorkspace = (runtimeRoot: string): LargeDocumentFixture => {
  const workspacePath = path.join(runtimeRoot, 'workspace')
  fs.mkdirSync(workspacePath, { recursive: true })
  const markdown = createLargeMarkdown()
  const sourceStats = inspectLargeMarkdown(markdown)
  if (JSON.stringify(sourceStats) !== JSON.stringify(LARGE_DOCUMENT_EXPECTATIONS)) {
    throw new Error(
      `Large document fixture drifted: ${JSON.stringify(sourceStats)}; expected ${JSON.stringify(LARGE_DOCUMENT_EXPECTATIONS)}`,
    )
  }
  const filePath = path.join(workspacePath, LARGE_DOCUMENT_FILE_NAME)
  fs.writeFileSync(filePath, markdown, 'utf8')
  return {
    filePath,
    fileName: LARGE_DOCUMENT_FILE_NAME,
    sentinels: LARGE_DOCUMENT_SENTINELS,
    sourceStats,
    workspacePath,
  }
}
