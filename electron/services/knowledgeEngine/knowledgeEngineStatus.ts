import type {
  KnowledgeEngineInitializeResult,
  KnowledgeEngineStatus,
} from '@electron/services/knowledgeEngine/types'
import type { WorkspaceSidecarRuntimeSummary } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'

export const getKnowledgeEngineStatus = (
  runtimes: WorkspaceSidecarRuntimeSummary[],
): KnowledgeEngineStatus => {
  const active = runtimes.find((runtime) => runtime.state === 'ready') ?? runtimes[0]
  const state: KnowledgeEngineStatus['state'] = active
    ? active.state === 'opening'
      ? 'starting'
      : active.state === 'closing'
        ? 'stopped'
        : active.state
    : 'stopped'
  return {
    binaryPath: null,
    state,
    ...(active?.pid ? { pid: active.pid } : {}),
    ...(active?.lastError ? { lastError: active.lastError } : {}),
  }
}

export const initializeKnowledgeEngine = (
  status: KnowledgeEngineStatus,
): KnowledgeEngineInitializeResult =>
  status.state === 'error'
    ? {
        error: status.lastError ?? 'Knowledge engine runtime is not available.',
        ok: false,
        status,
      }
    : {
        ok: true,
        response: { mode: 'node-utility-process' },
        status,
      }
