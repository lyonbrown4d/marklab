import { z } from 'zod'
import {
  workspaceGraphNodeDetailsResultSchema,
  workspaceGraphPreviewSchema,
  type WorkspaceGraphNodeDetailsResult,
} from '@/services/fsApiSchemas'

// Older desktop details omitted previews. Keep this input compatibility separate
// from the current Rust contract and normalize it before it reaches callers.
const legacyGraphDetailsSchema = workspaceGraphNodeDetailsResultSchema.extend({
  items: z.array(
    workspaceGraphNodeDetailsResultSchema.shape.items.element.extend({
      preview: workspaceGraphPreviewSchema.optional(),
    }),
  ),
})

export const parseWorkspaceGraphNodeDetails = (value: unknown): WorkspaceGraphNodeDetailsResult => {
  const details = legacyGraphDetailsSchema.parse(value)
  return {
    ...details,
    items: details.items.map((item) => ({
      ...item,
      // An empty preview retains the renderer's escaped text fallback.
      preview: item.preview ?? { html: '', math: [] },
    })),
  }
}
