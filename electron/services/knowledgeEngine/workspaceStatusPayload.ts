export const workspaceStatusWorkspaceId = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object' || !('workspaceId' in payload)) {
    throw new Error('workspaceId is required')
  }

  const workspaceId = (payload as { workspaceId: unknown }).workspaceId
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) {
    throw new Error('workspaceId is required')
  }

  return workspaceId
}
