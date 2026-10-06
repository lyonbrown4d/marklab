import type { FsRootInfo } from '@electron/services/workspace/types'
import { createWorkspaceStorageKey } from '@electron/services/workspace/workspaceIdentity'

export const createGraphLayoutWorkspaceKey = (root: FsRootInfo): string =>
  createWorkspaceStorageKey(root)
