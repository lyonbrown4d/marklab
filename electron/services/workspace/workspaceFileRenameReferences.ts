import { rewriteMarkdownFileReferencesForRename } from '@electron/services/markdownLanguage/fileRenames.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

type RenameHost = Parameters<typeof rewriteMarkdownFileReferencesForRename>[0]['host']

type RewriteWorkspaceReferencesForRenameOptions = {
  host: RenameHost
  logger: Logger
  workspaceIndex: FsWorkspaceIndex
  from: string
  to: string
}

export const rewriteWorkspaceReferencesForRename = async ({
  from,
  host,
  logger,
  to,
  workspaceIndex,
}: RewriteWorkspaceReferencesForRenameOptions): Promise<void> => {
  const rewrite = await rewriteMarkdownFileReferencesForRename({
    host,
    workspaceIndex,
    fromPath: from,
    toPath: to,
  })
  if (rewrite.appliedEdits === 0) return

  logger.info('markdown rename references updated', {
    from,
    to,
    appliedEdits: rewrite.appliedEdits,
    touchedFiles: rewrite.touchedFiles.length,
  })
}
