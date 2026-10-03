import fs from 'node:fs'
import { LocalHistoryService } from '@electron/services/localHistory/service.js'
/* eslint-disable no-restricted-imports -- Performance fixture helpers are Node-run sibling modules. */
import { inspectLargeMarkdown, writeLargeDocumentWorkspace } from './largeDocumentFixture.js'
import {
  BLOCK_HEAVY_DOCUMENT_SENTINELS,
  inspectBlockHeavyMarkdown,
  writeBlockHeavyDocumentWorkspace,
} from './blockHeavyDocumentFixture.js'
/* eslint-enable no-restricted-imports */

export const LOCAL_HISTORY_RESTORED_MARKER = 'MARKLAB_HISTORY_RESTORED_7Q9X'

const LEGACY_SNAPSHOT_LIMIT_BYTES = 2 * 1024 * 1024
const FIRST_HEADING = '## Section 0001'
export type LocalHistoryDocumentKind = 'block-heavy' | 'text-heavy'

export type LocalHistoryRestoreFixture = ReturnType<typeof writeLargeDocumentWorkspace> & {
  historyContent: string
  historyEntryId: string
  historyStats: ReturnType<typeof inspectLargeMarkdown>
  marker: string
}

export const writeLocalHistoryRestoreFixture = async (
  runtimeRoot: string,
  userDataPath: string,
  documentKind: LocalHistoryDocumentKind = 'text-heavy',
): Promise<LocalHistoryRestoreFixture> => {
  const fixture =
    documentKind === 'block-heavy'
      ? writeBlockHeavyDocumentWorkspace(runtimeRoot)
      : writeLargeDocumentWorkspace(runtimeRoot)
  const currentContent = fs.readFileSync(fixture.filePath, 'utf8')
  const restoreTarget =
    documentKind === 'block-heavy' ? BLOCK_HEAVY_DOCUMENT_SENTINELS[0] : FIRST_HEADING
  const restoredMarker =
    documentKind === 'block-heavy'
      ? LOCAL_HISTORY_RESTORED_MARKER
      : `## ${LOCAL_HISTORY_RESTORED_MARKER}`
  if (!currentContent.includes(restoreTarget)) {
    throw new Error(`Large document fixture is missing ${JSON.stringify(restoreTarget)}`)
  }
  const historyContent = currentContent.replace(restoreTarget, restoredMarker)
  if (historyContent === currentContent || currentContent.includes(LOCAL_HISTORY_RESTORED_MARKER)) {
    throw new Error('Local-history fixture did not create a unique restored document')
  }

  const history = new LocalHistoryService({
    maxFileSizeBytes: LEGACY_SNAPSHOT_LIMIT_BYTES,
    userDataPath,
  })
  const captured = await history.capture(
    { kind: 'external', path: fixture.workspacePath },
    fixture.fileName,
    historyContent,
  )
  if (captured.status === 'skipped') {
    throw new Error(`Unable to seed large local-history snapshot: ${captured.reason}`)
  }

  return {
    ...fixture,
    historyContent,
    historyEntryId: captured.entry.id,
    historyStats:
      documentKind === 'block-heavy'
        ? inspectBlockHeavyMarkdown(historyContent)
        : inspectLargeMarkdown(historyContent),
    marker: LOCAL_HISTORY_RESTORED_MARKER,
  }
}
