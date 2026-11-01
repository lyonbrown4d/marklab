import { createStore } from 'zustand/vanilla'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import type { GraphCameraState } from '@/features/knowledge-graph/types'

const pointSchema = z.object({ x: z.number(), y: z.number() })
const cameraSchema = pointSchema.extend({
  ratio: z.number().positive(),
  angle: z.number(),
})
const entrySchema = z.object({
  workspaceKey: z.string(),
  viewKey: z.string(),
  topologyKey: z.string(),
  manualOverrides: z.record(z.string(), pointSchema),
  camera: cameraSchema,
})
export type GraphViewSnapshot = z.infer<typeof entrySchema>
type CacheState = { entries: GraphViewSnapshot[] }
const MAX_POSITIONS = 12_000
const MAX_SNAPSHOTS = 8

const boundSnapshots = (entries: GraphViewSnapshot[]) => {
  let remaining = MAX_POSITIONS
  return entries.slice(0, MAX_SNAPSHOTS).map((entry) => {
    const manualOverrides = Object.entries(entry.manualOverrides).slice(0, remaining)
    remaining -= manualOverrides.length
    return { ...entry, manualOverrides: Object.fromEntries(manualOverrides) }
  })
}

const storage = createJSONStorage<CacheState>(() => ({
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* Layout remains available in memory. */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch {
      /* Storage can be unavailable. */
    }
  },
}))

export const graphViewCache = createStore<CacheState>()(
  persist<CacheState>(() => ({ entries: [] }), {
    name: 'marklab.knowledgeGraph.views',
    // Earlier versions contained renderer-computed layouts, not explicit user drags.
    version: 3,
    migrate: () => ({ entries: [] }),
    storage,
    merge: (persisted, current) => {
      const parsed = z
        .object({ entries: z.array(entrySchema).max(MAX_SNAPSHOTS) })
        .safeParse(persisted)
      return parsed.success ? { entries: boundSnapshots(parsed.data.entries) } : current
    },
  }),
)

export const readGraphView = (workspaceKey: string, viewKey = 'workspace') =>
  graphViewCache
    .getState()
    .entries.find((entry) => entry.workspaceKey === workspaceKey && entry.viewKey === viewKey)

export const saveGraphView = (
  workspaceKey: string,
  topologyKey: string,
  manualOverrides: Record<string, { x: number; y: number }>,
  camera: GraphCameraState,
  viewKey = 'workspace',
) => {
  const parsed = entrySchema.safeParse({
    workspaceKey,
    viewKey,
    topologyKey,
    manualOverrides,
    camera,
  })
  if (!parsed.success) return
  graphViewCache.setState((state) => ({
    entries: boundSnapshots([
      parsed.data,
      ...state.entries.filter(
        (entry) => entry.workspaceKey !== workspaceKey || entry.viewKey !== viewKey,
      ),
    ]),
  }))
}
