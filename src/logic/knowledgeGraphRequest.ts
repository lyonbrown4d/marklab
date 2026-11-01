import type { DesktopCommandArgs } from '@/generated/desktop/bindings'

export type KnowledgeGraphRequest = DesktopCommandArgs['fs_get_workspace_graph']['request']

export const workspaceGraphRequest = (
  includeAttachments = false,
  includeMissing = true,
): KnowledgeGraphRequest => ({
  center_path: null,
  depth: 1,
  direction: 'both',
  include_attachments: includeAttachments,
  include_missing: includeMissing,
  max_nodes: 10_000,
  max_edges: 30_000,
})

export const workspaceGraphQueryKey = (workspaceKey: string, request: KnowledgeGraphRequest) =>
  ['workspace-graph', workspaceKey, request] as const
