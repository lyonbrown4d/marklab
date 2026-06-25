import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

export type WorkspaceSidecarSpawnPlan = {
  command: string
  args: string[]
  cwd?: string
  windowsHide: true
}

export type CreateWorkspaceSidecarSpawnPlanOptions = {
  binary: KnowledgeEngineBinaryResolution
  identity: WorkspaceSidecarIdentity
}

export const createWorkspaceSidecarSpawnPlan = (
  options: CreateWorkspaceSidecarSpawnPlanOptions,
): WorkspaceSidecarSpawnPlan => ({
  command: options.binary.binaryPath,
  args: [
    '--workspace-instance-id',
    options.identity.workspaceInstanceId,
    '--workspace-root',
    options.identity.canonicalRoot,
    '--engine-data-dir',
    options.identity.engineDataDir,
    '--grpc-session-token',
    options.identity.sessionToken,
  ],
  windowsHide: true,
})

export const redactWorkspaceSidecarSpawnPlan = (plan: WorkspaceSidecarSpawnPlan) => ({
  command: plan.command,
  args: redactSpawnPlanArgs(plan.args),
  cwd: plan.cwd,
  env: {},
  windowsHide: plan.windowsHide,
})

const redactSpawnPlanArgs = (args: string[]): string[] =>
  args.map((arg, index) => (args[index - 1] === '--grpc-session-token' ? '<redacted>' : arg))
