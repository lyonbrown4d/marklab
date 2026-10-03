import fs from 'node:fs'
import { LocalHistoryService } from '@electron/services/localHistory/service.js'
/* eslint-disable no-restricted-imports -- Performance fixture helpers are Node-run sibling modules. */
import {
  inspectLargeMarkdown,
  LARGE_DOCUMENT_FILE_NAME,
  writeLargeDocumentWorkspace,
} from './largeDocumentFixture.js'
/* eslint-enable no-restricted-imports */

export const LOCAL_HISTORY_RESTORED_MARKER = 'MARKLAB_HISTORY_RESTORED_7Q9X'

const LEGACY_SNAPSHOT_LIMIT_BYTES = 2 * 1024 * 1024
const FIRST_HEADING = '## Section 0001'

export type LocalHistoryRestoreFixture = ReturnType<typeof writeLargeDocumentWorkspace> & {
  historyContent: string
  historyEntryId: string
  historyStats: ReturnType<typeof inspectLargeMarkdown>
  marker: string
}

export const writeLocalHistoryRestoreFixture = async (
  runtimeRoot: string,
  userDataPath: string,
): Promise<LocalHistoryRestoreFixture> => {
  const fixture = writeLargeDocumentWorkspace(runtimeRoot)
  const currentContent = fs.readFileSync(fixture.filePath, 'utf8')
  if (!currentContent.includes(FIRST_HEADING)) {
    throw new Error(`Large document fixture is missing ${JSON.stringify(FIRST_HEADING)}`)
  }
  const historyContent = currentContent.replace(
    FIRST_HEADING,
    `## ${LOCAL_HISTORY_RESTORED_MARKER}`,
  )
  if (historyContent === currentContent || currentContent.includes(LOCAL_HISTORY_RESTORED_MARKER)) {
    throw new Error('Local-history fixture did not create a unique restored document')
  }

  const history = new LocalHistoryService({
    maxFileSizeBytes: LEGACY_SNAPSHOT_LIMIT_BYTES,
    userDataPath,
  })
  const captured = await history.capture(
    { kind: 'external', path: fixture.workspacePath },
    LARGE_DOCUMENT_FILE_NAME,
    historyContent,
  )
  if (captured.status === 'skipped') {
    throw new Error(`Unable to seed large local-history snapshot: ${captured.reason}`)
  }

  return {
    ...fixture,
    historyContent,
    historyEntryId: captured.entry.id,
    historyStats: inspectLargeMarkdown(historyContent),
    marker: LOCAL_HISTORY_RESTORED_MARKER,
  }
}
