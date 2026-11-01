import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

export const workspaceGraphRequestSchema = z
  .object({
    center_path: z
      .string()
      .min(1)
      .max(4_096)
      .refine(
        (path) =>
          path.trim() === path &&
          !path.includes('\\') &&
          !path.includes('\0') &&
          !path.includes(':') &&
          !path.startsWith('/') &&
          path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
        'Expected a canonical workspace-relative document path',
      )
      .nullable(),
    depth: z.union([z.literal(1), z.literal(2)]),
    direction: z.enum(['both', 'incoming', 'outgoing']),
    include_attachments: z.boolean(),
    include_missing: z.boolean(),
    max_nodes: z.number().int().min(1).max(10_000),
    max_edges: z.number().int().min(1).max(50_000),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphRequest>

export const fsMarkdownBlockSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('paragraph'), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal('blockquote'), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal('code'), text: z.string(), language: z.string() }),
]) satisfies z.ZodType<FsMarkdownBlock>

const graphPreviewNodeFields = {
  id: z.string(),
  label: z.string(),
  path: z.string(),
  source_path: z.string(),
  target: z.string(),
  preview_kind: z.enum([
    'audio',
    'docx',
    'drawio',
    'excalidraw',
    'image',
    'pdf',
    'source',
    'spreadsheet',
    'video',
  ]),
}
export const fsGraphNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    label: z.string(),
    path: z.string(),
    group: z.object({ key: z.string(), label: z.string(), source: z.literal('path') }),
  }),
  z.object({ ...graphPreviewNodeFields, kind: z.literal('preview') }),
  z.object({ ...graphPreviewNodeFields, kind: z.literal('missing') }),
  z
    .object({
      id: z.string(),
      kind: z.literal('external'),
      label: z.string(),
      url: z.url().refine((value) => {
        try {
          const url = new URL(value)
          return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        } catch {
          return false
        }
      }, 'Expected an HTTP or HTTPS website URL without credentials'),
    })
    .strict(),
]) satisfies z.ZodType<FsGraphNode>

export const fsGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['links_to', 'references_heading', 'previews']),
  count: z.number().int().positive(),
}) satisfies z.ZodType<FsGraphEdge>

export const fsGraphSchema = z
  .object({
    mode: z.literal('relations'),
    topology_key: z.string().min(1),
    truncated: z.boolean(),
    total_nodes: z.number().int().nonnegative(),
    total_edges: z.number().int().nonnegative(),
    revision: z.string(),
    nodes: z.array(fsGraphNodeSchema).max(10_000),
    edges: z.array(fsGraphEdgeSchema).max(50_000),
  })
  .strict()
  .refine((graph) => {
    const ids = new Set(graph.nodes.map((node) => node.id))
    return (
      ids.size === graph.nodes.length &&
      graph.total_nodes >= graph.nodes.length &&
      graph.total_edges >= graph.edges.length &&
      new Set(graph.edges.map((edge) => edge.id)).size === graph.edges.length &&
      graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))
    )
  }, 'Invalid graph topology') satisfies z.ZodType<FsGraph>

export const workspaceGraphNodeDetailsRequestSchema = z
  .object({
    node_ids: z.array(z.string().min(1).max(1_024)).min(1).max(256),
    mode: z.enum(['summary', 'full']),
    max_nodes: z.number().int().min(1).max(64).nullish(),
    revision: z.string().min(1),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphNodeDetailsRequest>

export const workspaceGraphPreviewSchema = z
  .object({
    html: z.string().max(32_768),
    math: z
      .array(
        z
          .object({
            id: z.string().regex(/^graph-math-\d{1,2}$/),
            expression: z.string().max(1_680),
            displayMode: z.boolean(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphPreview>

export type WorkspaceGraphPreview =
  DesktopCommandResults['fs_get_workspace_graph_node_details']['items'][number]['preview']

export const workspaceGraphNodeDetailsResultSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          content: z.string(),
          preview: workspaceGraphPreviewSchema,
          content_blocks: z.array(fsMarkdownBlockSchema).optional(),
        })
        .strict(),
    ),
    revision: z.string().min(1),
    truncated: z.boolean(),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphNodeDetailsResult>

export type WorkspaceGraphNodeDetailsRequest =
  DesktopCommandArgs['fs_get_workspace_graph_node_details']['request']
export type WorkspaceGraphNodeDetailsResult =
  DesktopCommandResults['fs_get_workspace_graph_node_details']
export type FsMarkdownBlock = NonNullable<
  WorkspaceGraphNodeDetailsResult['items'][number]['content_blocks']
>[number]
export type FsGraphNode = FsGraph['nodes'][number]
export type FsGraphEdge = FsGraph['edges'][number]
export type FsGraph = DesktopCommandResults['fs_get_workspace_graph']
export type WorkspaceGraphRequest = DesktopCommandArgs['fs_get_workspace_graph']['request']
