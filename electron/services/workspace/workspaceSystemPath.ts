import type { Shell } from 'electron'

import type { Logger } from '@electron/services/logger'
import { resolveWorkspacePath } from '@electron/services/workspace/path'
import type { FsStateData } from '@electron/services/workspace/types'
import { stringArg } from '@electron/services/workspace/workspaceUtils'

export const openWorkspacePath = async (
  state: FsStateData,
  shell: Shell,
  logger: Logger,
  value: unknown,
): Promise<void> => {
  const relativePath = stringArg(value, 'path')
  const error = await shell.openPath(resolveWorkspacePath(state, relativePath))
  if (error) logger.warn('open path in system failed', { path: relativePath, error })
  if (error) throw new Error(`Failed to open path: ${error}`)
  logger.info('path opened in system', { path: relativePath })
}
