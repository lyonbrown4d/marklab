import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import type {
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types'
import type { WorkspaceSidecarRuntimeSummary } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'
import { workspaceStatusWorkspaceId } from '@electron/services/knowledgeEngine/workspaceStatusPayload'
import type { KnowledgeWorkspaceStatus } from '@electron/services/knowledgeEngine/knowledgeEngineTypes'

type KnowledgeEngineCommandTarget = {
  getStatus: () => KnowledgeEngineStatus
  getWorkspaceStatus: (workspaceId: string) => Promise<KnowledgeWorkspaceStatus>
  initialize: () => Promise<KnowledgeEngineInitializeResult>
  listWorkspaces: () => Promise<WorkspaceSidecarRuntimeSummary[]>
  stop: () => KnowledgeEngineStatus
}

export const createKnowledgeEngineCommandHandlers = (
  service: KnowledgeEngineCommandTarget,
): NativeCommandHandlers => ({
  'knowledge.engine.status': () => service.getStatus(),
  'knowledge.engine.initialize': () => service.initialize(),
  'knowledge.engine.stop': () => service.stop(),
  'knowledge.engine.workspaceStatus': (payload) =>
    service.getWorkspaceStatus(workspaceStatusWorkspaceId(payload)),
  'knowledge.engine.workspaces': () => service.listWorkspaces(),
})
