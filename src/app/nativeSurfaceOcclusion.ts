import { useEffect } from 'react'
import { create } from 'zustand'

type OcclusionState = {
  reasons: Record<string, number>
  commandPaletteBlockers: Record<string, number>
  occupy: (reason: string, options?: NativeSurfaceOcclusionOptions) => () => void
}

type NativeSurfaceOcclusionOptions = {
  blocksCommandPalette?: boolean
}

const incrementReason = (reasons: Record<string, number>, reason: string) => ({
  ...reasons,
  [reason]: (reasons[reason] ?? 0) + 1,
})

const decrementReason = (reasons: Record<string, number>, reason: string) => {
  const current = reasons[reason] ?? 0
  if (current > 1) return { ...reasons, [reason]: current - 1 }
  const next = { ...reasons }
  delete next[reason]
  return next
}

export const useNativeSurfaceOcclusionStore = create<OcclusionState>((set) => ({
  reasons: {},
  commandPaletteBlockers: {},
  occupy: (reason, { blocksCommandPalette = false } = {}) => {
    set((state) => ({
      reasons: incrementReason(state.reasons, reason),
      commandPaletteBlockers: blocksCommandPalette
        ? incrementReason(state.commandPaletteBlockers, reason)
        : state.commandPaletteBlockers,
    }))
    let released = false
    return () => {
      if (released) return
      released = true
      set((state) => ({
        reasons: decrementReason(state.reasons, reason),
        commandPaletteBlockers: blocksCommandPalette
          ? decrementReason(state.commandPaletteBlockers, reason)
          : state.commandPaletteBlockers,
      }))
    }
  },
}))

export const useNativeSurfaceOcclusion = (
  reason: string,
  active: boolean,
  { blocksCommandPalette = false }: NativeSurfaceOcclusionOptions = {},
) => {
  useEffect(() => {
    if (!active) return
    return useNativeSurfaceOcclusionStore.getState().occupy(reason, { blocksCommandPalette })
  }, [active, blocksCommandPalette, reason])
}

export const useNativeSurfaceOccluded = () =>
  useNativeSurfaceOcclusionStore((state) => Object.keys(state.reasons).length > 0)

export const isCommandPaletteBlockedByActiveSurface = () =>
  Object.keys(useNativeSurfaceOcclusionStore.getState().commandPaletteBlockers).length > 0
