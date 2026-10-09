export type WorkspaceMapViewportLod = 'far' | 'mid' | 'near'

export const getWorkspaceMapViewportLod = (zoom: number): WorkspaceMapViewportLod => {
  if (zoom < 0.55) return 'far'
  if (zoom < 0.9) return 'mid'
  return 'near'
}
