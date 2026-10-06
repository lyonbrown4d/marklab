import { z } from 'zod'

import { invoke } from '@/runtime/ipc'

const text = (max: number) => z.string().trim().min(1).max(max)
const coordinate = z.number().min(-10_000_000).max(10_000_000)
const dimension = z.number().min(24).max(20_000)
const modeSchema = z.enum(['focus', 'overview'])
const requestSchema = z
  .object({
    engineVersion: text(128),
    graphRevision: text(512),
    layoutKey: text(512),
    mode: modeSchema,
  })
  .strict()
const nodeSchema = z
  .object({
    collapsed: z.boolean(),
    height: dimension,
    id: text(1_024),
    pinned: z.boolean(),
    userModified: z.boolean(),
    width: dimension,
    x: coordinate,
    y: coordinate,
  })
  .strict()
const viewportSchema = z
  .object({ x: coordinate, y: coordinate, zoom: z.number().min(0.1).max(4) })
  .strict()
const saveSchema = requestSchema.extend({
  nodes: z.array(nodeSchema).max(5_000),
  viewport: viewportSchema.nullable(),
})
const resultSchema = z
  .object({
    match: z.enum(['exact', 'miss', 'stale']),
    nodes: z.array(nodeSchema).max(5_000),
    viewport: viewportSchema.nullable(),
  })
  .strict()

export type GraphLayoutRequest = z.infer<typeof requestSchema>
export type GraphLayoutSave = z.infer<typeof saveSchema>
export type GraphLayoutNode = z.infer<typeof nodeSchema>
export type GraphLayoutViewport = z.infer<typeof viewportSchema>
export type GraphLayoutResult = z.infer<typeof resultSchema>

export const graphLayoutApi = {
  async get(request: GraphLayoutRequest): Promise<GraphLayoutResult> {
    const payload = requestSchema.parse(request)
    return resultSchema.parse(await invoke<unknown>('fs_get_workspace_graph_layout', payload))
  },
  async save(value: GraphLayoutSave): Promise<void> {
    await invoke('fs_save_workspace_graph_layout', saveSchema.parse(value))
  },
}
