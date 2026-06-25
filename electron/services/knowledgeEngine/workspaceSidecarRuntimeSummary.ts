import { redactWorkspaceSidecarSpawnPlan } from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type {
  WorkspaceSidecarRuntime,
  WorkspaceSidecarRuntimeSummary,
} from '@electron/services/knowledgeEngine/workspaceSidecarTypes.js'

export const summarizeWorkspaceSidecarRuntimes = (
  runtimes: Iterable<WorkspaceSidecarRuntime>,
): WorkspaceSidecarRuntimeSummary[] =>
  [...runtimes].map((runtime) => ({
    address: runtime.address,
    identity: {
      canonicalRoot: runtime.identity.canonicalRoot,
      engineDataDir: runtime.identity.engineDataDir,
      workspaceInstanceId: runtime.identity.workspaceInstanceId,
    },
    indexPath: runtime.indexPath,
    lastActivityAt: runtime.lastActivityAt,
    lastError: runtime.lastError,
    openedAt: runtime.openedAt,
    pid: runtime.child?.pid,
    spawnPlan: redactWorkspaceSidecarSpawnPlan(runtime.spawnPlan),
    state: runtime.state,
    workspaceId: runtime.workspaceId,
  }))
