import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

export type WorkspaceSidecarSpawnPlan = {
  command: string
  args: string[]
  cwd?: string
  env: NodeJS.ProcessEnv
  windowsHide: true
}

export type CreateWorkspaceSidecarSpawnPlanOptions = {
  binary: KnowledgeEngineBinaryResolution
  identity: WorkspaceSidecarIdentity
  processEnv?: NodeJS.ProcessEnv
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
  ],
  env: {
    ...(options.processEnv ?? process.env),
    GRPC_SESSION_TOKEN: options.identity.sessionToken,
  },
  windowsHide: true,
})

export const redactWorkspaceSidecarSpawnPlan = (plan: WorkspaceSidecarSpawnPlan) => ({
  command: plan.command,
  args: plan.args,
  cwd: plan.cwd,
  env: {
    GRPC_SESSION_TOKEN: plan.env.GRPC_SESSION_TOKEN ? '<redacted>' : undefined,
  },
  windowsHide: plan.windowsHide,
})
