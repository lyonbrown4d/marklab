import { createStore } from 'zustand/vanilla'

export type FocusWorkspaceMapNodeRequest = {
  nodeId: string
  workspaceKey: string
  viewport?: { x: number; y: number; zoom: number }
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
