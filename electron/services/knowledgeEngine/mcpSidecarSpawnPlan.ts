import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

export type McpSidecarSpawnPlan = {
  command: string
  args: string[]
  cwd?: string
  windowsHide: true
}

export type CreateMcpSidecarSpawnPlanOptions = {
  binary: KnowledgeEngineBinaryResolution
  defaultSearchLimit?: number
  identity: Pick<WorkspaceSidecarIdentity, 'canonicalRoot' | 'engineDataDir'>
}

export const createMcpSidecarSpawnPlan = (
  options: CreateMcpSidecarSpawnPlanOptions,
): McpSidecarSpawnPlan => {
  const args = [
    '--workspace-root',
    options.identity.canonicalRoot,
    '--engine-data-dir',
    options.identity.engineDataDir,
  ]

  if (options.defaultSearchLimit !== undefined) {
    args.push('--default-search-limit', String(options.defaultSearchLimit))
  }

  return {
    command: options.binary.binaryPath,
    args,
    windowsHide: true,
  }
}

export const redactMcpSidecarSpawnPlan = (plan: McpSidecarSpawnPlan) => ({
  command: plan.command,
  args: plan.args,
  cwd: plan.cwd,
  env: {},
  windowsHide: plan.windowsHide,
})
