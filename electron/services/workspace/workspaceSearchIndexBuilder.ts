import type { Logger } from '@electron/services/logger'
import { fileLabel } from '@electron/services/workspace/markdown/utils'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'
import type { WorkspaceSearchIndexBuildCoordinator } from '@electron/services/workspace/workspaceSearchIndexBuildCoordinator'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

type Options = {
  coordinator: WorkspaceSearchIndexBuildCoordinator
  currentSearchKey: () => string
  index: WorkspaceSearchIndex
  loadDocuments: (signal?: AbortSignal) => Promise<Array<{ content: string; path: string }>>
  logger: Logger
  signal?: AbortSignal
}

export const rebuildWorkspaceSearchIndex = ({
  coordinator,
  currentSearchKey,
  index,
  loadDocuments,
  logger,
  signal,
}: Options): Promise<boolean> => {
  signal?.throwIfAborted()
  const searchKey = currentSearchKey()
  return coordinator.run(searchKey, async (isCurrent) => {
    const documents = await loadDocuments(signal)
    signal?.throwIfAborted()
    if (!isCurrent() || searchKey !== currentSearchKey()) return false
    const indexable = documents.map<WorkspaceSearchDocument>((document) => ({
      path: document.path,
      title: fileLabel(document.path),
      content: document.content,
    }))
    logger.info('workspace search index rebuild started', {
      documentCount: indexable.length,
      searchKey: searchKey.slice(0, 12),
    })
    await index.rebuild(indexable)
    signal?.throwIfAborted()
    return isCurrent() && searchKey === currentSearchKey()
  })
}
