import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Node-run fixture modules share explicit ESM imports.
import type { LargeDocumentFixture } from './largeDocumentFixture.js'
/* eslint-disable no-restricted-imports -- Node-run fixture modules use explicit ESM imports. */
import {
  BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
  BLOCK_HEAVY_DOCUMENT_SENTINELS,
  createBlockHeavyMarkdown,
  inspectBlockHeavyMarkdown,
} from './blockHeavyDocumentFixtureContract.js'
export * from './blockHeavyDocumentFixtureContract.js'
/* eslint-enable no-restricted-imports */

export const BLOCK_HEAVY_DOCUMENT_FILE_NAME = 'block-heavy-document.md'

export const writeBlockHeavyDocumentWorkspace = (runtimeRoot: string): LargeDocumentFixture => {
  const workspacePath = path.join(runtimeRoot, 'workspace')
  fs.mkdirSync(workspacePath, { recursive: true })
  const markdown = createBlockHeavyMarkdown()
  const sourceStats = inspectBlockHeavyMarkdown(markdown)
  if (JSON.stringify(sourceStats) !== JSON.stringify(BLOCK_HEAVY_DOCUMENT_EXPECTATIONS)) {
    throw new Error(
      `Block-heavy fixture drifted: ${JSON.stringify(sourceStats)}; expected ${JSON.stringify(BLOCK_HEAVY_DOCUMENT_EXPECTATIONS)}`,
    )
  }
  const filePath = path.join(workspacePath, BLOCK_HEAVY_DOCUMENT_FILE_NAME)
  fs.writeFileSync(filePath, markdown, 'utf8')
  return {
    fileName: BLOCK_HEAVY_DOCUMENT_FILE_NAME,
    filePath,
    sentinels: BLOCK_HEAVY_DOCUMENT_SENTINELS,
    sourceStats,
    workspacePath,
  }
}
