import type { WorkspaceBufferStore } from '@electron/services/workspace/workspaceBuffers'
import type { WorkspaceRootSwitchOptions } from '@electron/services/workspace/types'

type RootCommitBuffers = Pick<WorkspaceBufferStore, 'flush' | 'getBackgroundDirtyCount'>

export const runWorkspaceRootCommit = async <T>({
  buffers,
  commit,
  options,
}: {
  buffers: RootCommitBuffers
  commit: () => T
  options: WorkspaceRootSwitchOptions
}): Promise<T> => {
  options.signal?.throwIfAborted()
  await buffers.flush()
  options.signal?.throwIfAborted()
  const dirtyCount = buffers.getBackgroundDirtyCount()
  if (dirtyCount > 0) {
    throw new Error(`Workspace switch blocked by ${dirtyCount} unsaved buffer(s)`)
  }
  options.signal?.throwIfAborted()
  return commit()
}
