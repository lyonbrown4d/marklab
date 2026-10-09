import { useCallback, useEffect, useMemo } from 'react'
import { useStore } from 'zustand'
import {
  navigationHistoryStore,
  recentNavigationLocations,
  type NavigationLocation,
} from '@/features/navigation/navigationHistory'

type UseNavigationHistoryOptions = {
  workspaceKey: string
  currentLocation: NavigationLocation | null
  onNavigate: (location: NavigationLocation) => void
}

export const useNavigationHistory = ({
  workspaceKey,
  currentLocation,
  onNavigate,
}: UseNavigationHistoryOptions) => {
  const entries = useStore(navigationHistoryStore, (state) => state.entries)

  useEffect(() => {
    navigationHistoryStore.getState().reset(workspaceKey)
  }, [workspaceKey])

  useEffect(() => {
    if (currentLocation) navigationHistoryStore.getState().visit(currentLocation)
  }, [currentLocation, workspaceKey])

  const visit = useCallback((location: NavigationLocation) => {
    navigationHistoryStore.getState().visit(location)
  }, [])
  const move = useCallback(
    (direction: 'back' | 'forward') => {
      const location = navigationHistoryStore.getState()[direction]()
      if (location) onNavigate(location)
    },
    [onNavigate],
  )
  const back = useCallback(() => move('back'), [move])
  const forward = useCallback(() => move('forward'), [move])
  const recentLocations = useMemo(() => recentNavigationLocations(entries), [entries])

  return { back, forward, recentLocations, visit }
}
