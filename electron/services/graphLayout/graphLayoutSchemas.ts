import { z } from 'zod'

const boundedText = (max: number) => z.string().trim().min(1).max(max)
const coordinate = z.number().min(-10_000_000).max(10_000_000)
const dimension = z.number().min(24).max(20_000)

export const graphLayoutModeSchema = z.enum(['focus', 'overview'])

export const graphLayoutRequestSchema = z
  .object({
    engineVersion: boundedText(128),
    graphRevision: boundedText(512),
    layoutKey: boundedText(512),
    mode: graphLayoutModeSchema,
  })
  .strict()

export const graphLayoutNodeSchema = z
  .object({
    collapsed: z.boolean(),
    height: dimension,
    id: boundedText(1_024),
    pinned: z.boolean(),
    userModified: z.boolean(),
    width: dimension,
    x: coordinate,
    y: coordinate,
  })
  .strict()

export const graphLayoutViewportSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    zoom: z.number().min(0.1).max(4),
  })
  .strict()

export const graphLayoutSaveSchema = graphLayoutRequestSchema.extend({
  nodes: z.array(graphLayoutNodeSchema).max(5_000),
  viewport: graphLayoutViewportSchema.nullable(),
})

export type GraphLayoutRequest = z.infer<typeof graphLayoutRequestSchema>
export type GraphLayoutSave = z.infer<typeof graphLayoutSaveSchema>
export type GraphLayoutNode = z.infer<typeof graphLayoutNodeSchema>
export type GraphLayoutViewport = z.infer<typeof graphLayoutViewportSchema>
export type GraphLayoutResult = {
  match: 'exact' | 'miss' | 'stale'
  nodes: GraphLayoutNode[]
  viewport: GraphLayoutViewport | null
}
