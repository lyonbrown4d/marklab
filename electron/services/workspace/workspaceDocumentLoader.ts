import pLimit from 'p-limit'

import type { FsEntry } from '@electron/services/workspace/types'
import { isSearchIndexablePath } from '@electron/services/workspace/path'

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
  signal?: AbortSignal
}

export const loadWorkspaceDocuments = async ({
  batchSize,
  entries,
  readFile,
  replaceContent,
  replacePath,
  signal,
}: LoadWorkspaceDocumentsOptions): Promise<WorkspaceDocument[]> => {
  signal?.throwIfAborted()
  const files: FsEntry[] = []
  for (const entry of entries) {
    signal?.throwIfAborted()
    if (entry.kind === 'file' && isSearchIndexablePath(entry.path)) files.push(entry)
  }
  const limit = pLimit(batchSize)

  return Promise.all(
    files.map((entry) =>
      limit(async () => {
        signal?.throwIfAborted()
        const content =
          entry.path === replacePath && replaceContent != null
            ? replaceContent
            : await readFile(entry.path)
        signal?.throwIfAborted()
        return { path: entry.path, content }
      }),
    ),
  )
}
