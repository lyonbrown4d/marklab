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
  args: [],
  env: {
    ...(options.processEnv ?? process.env),
    ...options.identity.env,
  },
  windowsHide: true,
})

export const redactWorkspaceSidecarSpawnPlan = (plan: WorkspaceSidecarSpawnPlan) => ({
  command: plan.command,
  args: plan.args,
  cwd: plan.cwd,
  env: {
    ENGINE_DATA_DIR: plan.env.ENGINE_DATA_DIR,
    GRPC_SESSION_TOKEN: plan.env.GRPC_SESSION_TOKEN ? '<redacted>' : undefined,
    WORKSPACE_INSTANCE_ID: plan.env.WORKSPACE_INSTANCE_ID,
    WORKSPACE_ROOT: plan.env.WORKSPACE_ROOT,
  },
  windowsHide: plan.windowsHide,
})
