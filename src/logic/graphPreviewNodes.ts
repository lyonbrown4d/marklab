import type { Node } from '@xyflow/react'
import type { GraphData, GraphNodeData } from '@/logic/graph'
import { getPreviewFileKind } from '@/logic/fileTypes'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'
import { createFileLabel } from '@/logic/paths'
import type { FsWorkspaceIndex } from '@/services/fsApi'

type PreviewReference = {
  sourcePath: string
  target: string
  targetPath?: string | null
}

export const appendPreviewNodesFromWorkspaceIndex = (
  graph: GraphData,
  index: FsWorkspaceIndex | null,
  sourcePath?: string | null,
): GraphData => {
  if (!index) return graph

  const nodes = graph.nodes.map((node) => ({ ...node, data: { ...node.data } }))
  const edges = graph.edges.map((edge) => ({
    ...edge,
    data: edge.data ? { ...edge.data } : edge.data,
  }))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edgeIds = new Set(edges.map((edge) => edge.id))
  let changed = false

  index.files
    .filter((file) => !sourcePath || file.path === sourcePath)
    .flatMap((file) => previewReferencesForFile(file))
    .forEach((reference, index) => {
      if (!reference.targetPath) return
      const previewKind = getPreviewFileKind(reference.targetPath)
      if (!previewKind) return

      const previewId = `preview:${reference.targetPath}`
      if (!nodeIds.has(previewId)) {
        nodeIds.add(previewId)
        changed = true
        nodes.push(createPreviewNode(reference, previewId, previewKind, nodes, index))
      }

      if (!nodeIds.has(`file:${reference.sourcePath}`)) return
      const edgeId = `file:${reference.sourcePath}->${previewId}`
      if (edgeIds.has(edgeId)) return

      edgeIds.add(edgeId)
      changed = true
      edges.push({
        id: edgeId,
        source: `file:${reference.sourcePath}`,
        target: previewId,
        data: { kind: 'previews' },
      })
    })

  if (!changed) return graph
  return {
    nodes,
    edges,
    layoutKey: createGraphLayoutKey(`${graph.layoutKey ?? 'graph'}:preview`, nodes, edges),
  }
}

const previewReferencesForFile = (file: FsWorkspaceIndex['files'][number]): PreviewReference[] => [
  ...(file.assets ?? []).map((asset) => ({
    sourcePath: file.path,
    target: asset.target,
    targetPath: asset.target_path,
  })),
  ...file.links.map((link) => ({
    sourcePath: file.path,
    target: link.target,
    targetPath: link.target_path,
  })),
]

const createPreviewNode = (
  reference: PreviewReference,
  previewId: string,
  previewKind: NonNullable<GraphNodeData['previewKind']>,
  nodes: Node<GraphNodeData>[],
  index: number,
): Node<GraphNodeData> => {
  const sourceNode = nodes.find((node) => node.id === `file:${reference.sourcePath}`)
  return {
    id: previewId,
    type: 'preview',
    data: {
      label: createFileLabel(reference.targetPath ?? reference.target),
      path: reference.targetPath ?? reference.target,
      previewKind,
      sourcePath: reference.sourcePath,
      subtitle: `${previewKind.toUpperCase()} · ${reference.targetPath ?? reference.target}`,
      target: reference.targetPath ?? reference.target,
    },
    position: {
      x: (sourceNode?.position.x ?? 0) + 260,
      y: (sourceNode?.position.y ?? 0) + 120 + index * 34,
    },
  }
}
