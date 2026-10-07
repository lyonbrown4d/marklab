import pLimit from 'p-limit'

import type { Logger } from '@electron/services/logger'
import { fileLabel } from '@electron/services/workspace/markdown/utils'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

type LoadWorkspaceSearchDocumentsOptions = {
  concurrency: number
  logger: Pick<Logger, 'warn'>
  paths: string[]
  readFile: (path: string) => Promise<string>
}

export const loadWorkspaceSearchDocuments = async (
  options: LoadWorkspaceSearchDocumentsOptions,
): Promise<WorkspaceSearchDocument[]> => {
  const limit = pLimit(Math.max(1, Math.floor(options.concurrency)))
  const documents = await Promise.all(
    options.paths.map((path) =>
      limit(async (): Promise<WorkspaceSearchDocument | null> => {
        try {
          return {
            content: await options.readFile(path),
            path,
            title: fileLabel(path),
          }
        } catch (error) {
          options.logger.warn('failed to read flushed file for search index update', {
            error,
            path,
          })
          return null
        }
      }),
    ),
  )
  return documents.filter((document): document is WorkspaceSearchDocument => document !== null)
}
