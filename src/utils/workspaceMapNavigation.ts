import { createStore } from 'zustand/vanilla'
import type { GraphCameraState } from '@/features/knowledge-graph/types'

export type FocusWorkspaceMapNodeRequest = {
  nodeId: string
  workspaceKey: string
  viewId?: string
  viewport?: GraphCameraState
}

type WorkspaceMapNavigationState = {
  request: FocusWorkspaceMapNodeRequest | null
}

export const workspaceMapNavigationStore = createStore<WorkspaceMapNavigationState>(() => ({
  request: null,
}))

export const requestWorkspaceMapNodeFocus = (request: FocusWorkspaceMapNodeRequest) => {
  workspaceMapNavigationStore.setState({ request })
}

export const clearWorkspaceMapNodeFocusRequest = (request: FocusWorkspaceMapNodeRequest) => {
  if (workspaceMapNavigationStore.getState().request === request) {
    workspaceMapNavigationStore.setState({ request: null })
  }
}

export const clearPendingWorkspaceMapNavigation = () => {
  workspaceMapNavigationStore.setState({ request: null })
}
