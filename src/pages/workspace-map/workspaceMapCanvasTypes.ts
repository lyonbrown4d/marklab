import type { GraphData, WorkspaceMapEditorLoadState } from '@/logic/graph'

export type WorkspaceMapCanvasProps = {
  activePath: string | null
  editorLoadState: WorkspaceMapEditorLoadState
  graph: GraphData
  graphIdentity: string
  viewId?: string
  searchNodes?: GraphData['nodes']
  onNavigateNode?: (nodeId: string) => void
  onActivateEditor: (path: string) => void
  onChange: (value: string) => void
  onCloseEditor: () => void
  onOpenFile: (path: string) => void
  onRetryEditor: () => void
  readOnly: boolean
  showMiniMap: boolean
}
