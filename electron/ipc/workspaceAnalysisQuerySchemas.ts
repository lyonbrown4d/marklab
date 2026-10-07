import { z } from 'zod'
import type {
  WorkspaceNavigationQuery,
  WorkspacePageQuery,
} from '@electron/services/workspace/workspaceIndexQueryTypes'

const optionalBoundedText = (max: number) => z.string().max(max).optional()

const workspacePageQuerySchema = z
  .object({
    folder: optionalBoundedText(1_024),
    issues_only: z.boolean().optional(),
    query: optionalBoundedText(512),
    sort: z.enum(['title', 'path', 'headings', 'links', 'issues']).optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict()

const workspaceNavigationQuerySchema = z
  .object({
    active_path: z.string().max(32_768).nullable().optional(),
    query: optionalBoundedText(512),
    scope: z.enum(['all', 'files', 'headings']).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()

const workspaceDocumentInsightsRequestSchema = z
  .object({
    path: z.string().trim().min(1).max(32_768),
    asset_limit: z.number().int().min(0).max(500).optional(),
  })
  .strict()

export const parseWorkspacePageQuery = (value: unknown): WorkspacePageQuery =>
  workspacePageQuerySchema.parse(value ?? {})

export const parseWorkspaceNavigationQuery = (value: unknown): WorkspaceNavigationQuery =>
  workspaceNavigationQuerySchema.parse(value ?? {})

export const parseWorkspaceDocumentInsightsRequest = (value: unknown) =>
  workspaceDocumentInsightsRequestSchema.parse(value)
