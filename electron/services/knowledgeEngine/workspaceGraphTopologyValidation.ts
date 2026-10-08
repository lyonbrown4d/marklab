import { z } from 'zod'

import type {
  FsGraph,
  FsGraphEdge,
  FsGraphGroup,
  FsGraphNode,
} from '@electron/services/workspace/types'

const nodeKindSchema = z.enum(['file', 'heading', 'missing', 'external', 'preview'])
const topologyNodeKindSchema = z.enum(['file', 'missing', 'external'])
const previewKindSchema = z.enum([
  'audio',
  'docx',
  'drawio',
  'excalidraw',
  'image',
  'pdf',
  'source',
  'video',
])
const edgeKindSchema = z.enum(['contains', 'links_to', 'references_heading', 'previews'])
const groupSchema = z.object({
  key: z.string(),
  label: z.string(),
  source: z.enum(['frontmatter', 'path', 'semantic', 'workspace']),
})
const strictGroupSchema = groupSchema.strict()

const sharedNodeFields = {
  id: z.string(),
  label: z.string(),
  path: z.string().nullable().optional(),
  group: strictGroupSchema.nullable().optional(),
}
const strictTopologyNodeSchema = z.union([
  z.object({ ...sharedNodeFields, kind: topologyNodeKindSchema }).strict(),
  z
    .object({
      ...sharedNodeFields,
      kind: z.literal('preview'),
      preview_kind: previewKindSchema.nullable().optional(),
      source_path: z.string().nullable().optional(),
      target: z.string().nullable().optional(),
    })
    .strict(),
])
const strictEdgeSchema = z
  .object({
    id: z.string(),
    kind: edgeKindSchema,
    source: z.string(),
    target: z.string(),
  })
  .strict()
const strictTopologySchema = z
  .object({
    mode: z.literal('mindmap'),
    revision: z.string().optional(),
    nodes: z.array(strictTopologyNodeSchema),
    edges: z.array(strictEdgeSchema),
  })
  .strict()

const nodeCoreSchema = z.object({
  id: z.string(),
  kind: nodeKindSchema,
  label: z.string(),
})
const edgeSchema = z.object({
  id: z.string(),
  kind: edgeKindSchema,
  source: z.string(),
  target: z.string(),
})
const nullableStringSchema = z.string().nullable()

export type WorkspaceGraphCandidate = {
  nodes: unknown[]
  edges: unknown[]
  revision?: string
}

export const isStrictTopologyShape = (value: unknown): value is FsGraph =>
  strictTopologySchema.safeParse(value).success

export const parseWorkspaceGraphCandidate = (
  value: unknown,
): WorkspaceGraphCandidate | undefined => {
  if (!isRecord(value) || value.mode !== 'mindmap') return undefined
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return undefined
  return {
    nodes: value.nodes,
    edges: value.edges,
    ...(typeof value.revision === 'string' ? { revision: value.revision } : {}),
  }
}

export const normalizeGraphNodeCandidate = (value: unknown): FsGraphNode | undefined => {
  const parsed = nodeCoreSchema.safeParse(value)
  if (!parsed.success || !isRecord(value)) return undefined
  const result: FsGraphNode = parsed.data
  copyNullableString(value, result, 'path')

  if (value.group === null) result.group = null
  else {
    const group = groupSchema.safeParse(value.group)
    if (group.success) result.group = group.data as FsGraphGroup
  }

  if (result.kind === 'preview') {
    const previewKind = previewKindSchema.nullable().safeParse(value.preview_kind)
    if (value.preview_kind !== undefined && previewKind.success) {
      result.preview_kind = previewKind.data
    }
    copyNullableString(value, result, 'source_path')
    copyNullableString(value, result, 'target')
  }
  return result
}

export const normalizeGraphEdgeCandidate = (value: unknown): FsGraphEdge | undefined => {
  const parsed = edgeSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const copyNullableString = (
  source: Record<string, unknown>,
  target: FsGraphNode,
  key: 'path' | 'source_path' | 'target',
): void => {
  if (source[key] === undefined) return
  const parsed = nullableStringSchema.safeParse(source[key])
  if (parsed.success) target[key] = parsed.data
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
