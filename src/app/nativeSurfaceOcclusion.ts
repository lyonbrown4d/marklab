import { useEffect } from 'react'
import { create } from 'zustand'

type OcclusionState = {
  reasons: Record<string, number>
  occupy: (reason: string) => () => void
}

export const useNativeSurfaceOcclusionStore = create<OcclusionState>((set) => ({
  reasons: {},
  occupy: (reason) => {
    set((state) => ({
      reasons: { ...state.reasons, [reason]: (state.reasons[reason] ?? 0) + 1 },
    }))
    let released = false
    return () => {
      if (released) return
      released = true
      set((state) => {
        const current = state.reasons[reason] ?? 0
        if (current <= 1) {
          const reasons = { ...state.reasons }
          delete reasons[reason]
          return { reasons }
        }
        return { reasons: { ...state.reasons, [reason]: current - 1 } }
      })
    }
  },
}))

export const useNativeSurfaceOcclusion = (reason: string, active: boolean) => {
  useEffect(() => {
    if (!active) return
    return useNativeSurfaceOcclusionStore.getState().occupy(reason)
  }, [active, reason])
}

export const useNativeSurfaceOccluded = () =>
  useNativeSurfaceOcclusionStore((state) => Object.keys(state.reasons).length > 0)
