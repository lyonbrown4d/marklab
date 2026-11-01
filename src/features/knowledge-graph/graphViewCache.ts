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
  positions: z.record(z.string(), pointSchema),
  camera: cameraSchema,
})
export type GraphViewSnapshot = z.infer<typeof entrySchema>
type CacheState = { entries: GraphViewSnapshot[] }
const MAX_POSITIONS = 12_000
const MAX_SNAPSHOTS = 8

const boundSnapshots = (entries: GraphViewSnapshot[]) => {
  let remaining = MAX_POSITIONS
  return entries.slice(0, MAX_SNAPSHOTS).flatMap((entry) => {
    const positions = Object.entries(entry.positions).slice(0, remaining)
    remaining -= positions.length
    return positions.length ? [{ ...entry, positions: Object.fromEntries(positions) }] : []
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
    version: 2,
    storage,
    merge: (persisted, current) => {
      const parsed = z
        .object({ entries: z.array(entrySchema).max(MAX_SNAPSHOTS) })
        .safeParse(persisted)
      return parsed.success ? { entries: boundSnapshots(parsed.data.entries) } : current
    },
  }),
)

export const readGraphView = (workspaceKey: string, topologyKey: string, viewKey = 'workspace') => {
  const entries = graphViewCache
    .getState()
    .entries.filter((entry) => entry.workspaceKey === workspaceKey && entry.viewKey === viewKey)
  const latest = entries[0]
  const exact = entries.find((entry) => entry.topologyKey === topologyKey)
  return exact && latest ? { ...exact, camera: latest.camera } : latest
}

export const saveGraphView = (
  workspaceKey: string,
  topologyKey: string,
  positions: Record<string, { x: number; y: number }>,
  camera: GraphCameraState,
  viewKey = 'workspace',
) => {
  const parsed = entrySchema.safeParse({ workspaceKey, viewKey, topologyKey, positions, camera })
  if (!parsed.success) return
  graphViewCache.setState((state) => ({
    entries: boundSnapshots([
      parsed.data,
      ...state.entries.filter(
        (entry) =>
          entry.workspaceKey !== workspaceKey ||
          entry.viewKey !== viewKey ||
          entry.topologyKey !== topologyKey,
      ),
    ]),
  }))
}
