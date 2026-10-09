import { createStore } from 'zustand/vanilla'
import type { FileViewKind } from '@/store/appTypes'

type NavigationFileLocation = {
  kind: 'file'
  path: string
  view: FileViewKind
}

type NavigationHeadingLocation = {
  kind: 'heading'
  path: string
  slug: string
}

type NavigationSourceLocation = {
  kind: 'source'
  path: string
  line: number
  column: number
  endColumn?: number
}

type NavigationGraphLocation = {
  kind: 'graph'
  nodeId: string
  viewport?: { x: number; y: number; zoom: number }
}

export type NavigationLocation =
  | NavigationFileLocation
  | NavigationHeadingLocation
  | NavigationSourceLocation
  | NavigationGraphLocation

type NavigationHistoryState = {
  workspaceKey: string
  entries: NavigationLocation[]
  index: number
  reset: (workspaceKey: string) => void
  visit: (location: NavigationLocation) => void
  back: () => NavigationLocation | null
  forward: () => NavigationLocation | null
  recent: () => NavigationLocation[]
}

const HISTORY_LIMIT = 80
const RECENT_LIMIT = 8

const locationKey = (location: NavigationLocation) => {
  if (location.kind === 'file') return `file:${location.path}:${location.view}`
  if (location.kind === 'heading') return `heading:${location.path}:${location.slug}`
  if (location.kind === 'source') {
    return `source:${location.path}:${location.line}:${location.column}:${location.endColumn ?? ''}`
  }
  const viewport = location.viewport
  return `graph:${location.nodeId}:${viewport?.x ?? ''}:${viewport?.y ?? ''}:${viewport?.zoom ?? ''}`
}

const isGenericViewOf = (current: NavigationLocation, next: NavigationLocation) => {
  if (next.kind !== 'file') return false
  if (current.kind === 'source') return next.view === 'source' && next.path === current.path
  if (current.kind === 'heading') return next.view === 'edit' && next.path === current.path
  return false
}

const mergeGraphViewport = (
  current: NavigationLocation | undefined,
  next: NavigationLocation,
): NavigationLocation | null => {
  if (current?.kind !== 'graph' || next.kind !== 'graph' || current.nodeId !== next.nodeId) {
    return null
  }
  return next.viewport ? next : current
}

export const recentNavigationLocations = (entries: readonly NavigationLocation[]) => {
  const seen = new Set<string>()
  return [...entries]
    .reverse()
    .filter((location) => {
      const key = locationKey(location)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, RECENT_LIMIT)
}

const move = (delta: -1 | 1, state: NavigationHistoryState, setIndex: (index: number) => void) => {
  const nextIndex = state.index + delta
  if (nextIndex < 0 || nextIndex >= state.entries.length) return null
  setIndex(nextIndex)
  return state.entries[nextIndex] ?? null
}

export const navigationHistoryStore = createStore<NavigationHistoryState>((set, get) => ({
  workspaceKey: '',
  entries: [],
  index: -1,
  reset: (workspaceKey) => set({ workspaceKey, entries: [], index: -1 }),
  visit: (location) =>
    set((state) => {
      const current = state.entries[state.index]
      const mergedGraphLocation = mergeGraphViewport(current, location)
      if (mergedGraphLocation) {
        const entries = [...state.entries]
        entries[state.index] = mergedGraphLocation
        return { entries }
      }
      if (
        locationKey(current ?? location) === locationKey(location) ||
        (current ? isGenericViewOf(current, location) : false)
      ) {
        return state.entries.length === 0 ? { entries: [location], index: 0 } : state
      }
      const branch = state.entries.slice(0, state.index + 1)
      const entries = [...branch, location].slice(-HISTORY_LIMIT)
      return { entries, index: entries.length - 1 }
    }),
  back: () => move(-1, get(), (index) => set({ index })),
  forward: () => move(1, get(), (index) => set({ index })),
  recent: () => recentNavigationLocations(get().entries),
}))
