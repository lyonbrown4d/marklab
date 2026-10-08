import { NodeSidecarProcessPool } from '@electron/services/knowledgeEngine/nodeSidecarProcessPool'
import { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager'
import type { WorkspaceSidecarManagerOptions } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'

export const createWorkspaceSidecarManager = (
  options: WorkspaceSidecarManagerOptions,
): WorkspaceSidecarManager => {
  const processPool = new NodeSidecarProcessPool(options.logger)
  return new WorkspaceSidecarManager({
    ...options,
    startSidecar: (_plan, identity) => processPool.acquire(identity),
  })
}
