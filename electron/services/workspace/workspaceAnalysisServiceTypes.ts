import type { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import type { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import type { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex'

export type WorkspaceAnalysisServiceOptions = {
  workspaceAnalysisScheduler?: WorkspaceAnalysisScheduler
  graphPrecomputeDelayMs?: number
  workspaceIndexPrecomputeDelayMs?: number
  workspaceGraphScheduler?: WorkspaceGraphComputationScheduler
  workspaceGraphStore?: WorkspaceGraphStore
}

export type WorkspaceSearchIndexFactory = () => WorkspaceSearchIndex
