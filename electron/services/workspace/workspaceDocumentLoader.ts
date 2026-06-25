import pLimit from 'p-limit'

import type { FsEntry } from '@electron/services/workspace/types.js'
import { isSearchIndexablePath } from '@electron/services/workspace/path.js'

export type WorkspaceDocument = {
  path: string
  content: string
}

type LoadWorkspaceDocumentsOptions = {
  batchSize: number
  entries: FsEntry[]
  readFile: (path: string) => Promise<string>
  replaceContent?: string
  replacePath?: string
}

export const loadWorkspaceDocuments = async ({
  batchSize,
  entries,
  readFile,
  replaceContent,
  replacePath,
}: LoadWorkspaceDocumentsOptions): Promise<WorkspaceDocument[]> => {
  const files = entries.filter(
    (entry) => entry.kind === 'file' && isSearchIndexablePath(entry.path),
  )
  const limit = pLimit(batchSize)

  return Promise.all(
    files.map((entry) =>
      limit(async () => ({
        path: entry.path,
        content:
          entry.path === replacePath && replaceContent != null
            ? replaceContent
            : await readFile(entry.path),
      })),
    ),
  )
}
