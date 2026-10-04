import type { StateCreator } from 'zustand'
import type { GraphContentMode, GraphMiniMapPosition, GraphMiniMapSize } from '@/store/appTypes'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type GraphPreferencesState = {
  graphContentMode: GraphContentMode
  graphMiniMapEnabled: boolean
  graphMiniMapPosition: GraphMiniMapPosition
  graphMiniMapSize: GraphMiniMapSize
  setGraphContentMode: (mode: GraphContentMode) => void
  setGraphMiniMapEnabled: (enabled: boolean) => void
  setGraphMiniMapPosition: (position: GraphMiniMapPosition) => void
  setGraphMiniMapSize: (size: GraphMiniMapSize) => void
}

export const createGraphPreferencesSlice: StateCreator<
  PreferencesState,
  [],
  [],
  GraphPreferencesState
> = (set) => ({
  graphContentMode: 'summary',
  graphMiniMapEnabled: true,
  graphMiniMapPosition: 'bottom-right',
  graphMiniMapSize: 'regular',
  setGraphContentMode: (graphContentMode) =>
    set((state) => (state.graphContentMode === graphContentMode ? state : { graphContentMode })),
  setGraphMiniMapEnabled: (graphMiniMapEnabled) =>
    set((state) =>
      state.graphMiniMapEnabled === graphMiniMapEnabled ? state : { graphMiniMapEnabled },
    ),
  setGraphMiniMapPosition: (graphMiniMapPosition) =>
    set((state) =>
      state.graphMiniMapPosition === graphMiniMapPosition ? state : { graphMiniMapPosition },
    ),
  setGraphMiniMapSize: (graphMiniMapSize) =>
    set((state) => (state.graphMiniMapSize === graphMiniMapSize ? state : { graphMiniMapSize })),
})
