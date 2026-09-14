import type { GraphData } from '@/logic/graph'
import type { GraphContentMode } from '@/store/appTypes'
import { formatShortcut, type ShortcutBindings } from '@/logic/shortcuts'
import { createGraphHotkeyBindings } from '@/pages/graphKeyboardActions'

export const mindmapCanvasClassName = [
  '[&_.graph-node-shell]:!border-border [&_.graph-node-shell]:!bg-card',
  '[&_.graph-node-shell]:!text-foreground [&_.graph-node-shell]:!shadow-sm',
  '[&_.graph-node-shell--selected]:!border-ring [&_.graph-node-shell--selected]:!ring-1',
  '[&_.graph-node-shell--selected]:!ring-ring',
  '[&_.graph-node-shell:focus-within]:!ring-2 [&_.graph-node-shell:focus-within]:!ring-ring',
  '[&_.graph-node-shell:focus-within]:!ring-offset-2',
  '[&_.graph-node-shell:focus-within]:!ring-offset-background',
].join(' ')

const hintActions = [
  ['edit-title', 'shortcuts.graphEditTitle'],
  ['add-child', 'shortcuts.graphAddChild'],
  ['add-sibling', 'shortcuts.graphAddSibling'],
] as const

export const getMindmapShortcutHints = (overrides: ShortcutBindings) => {
  const bindings = createGraphHotkeyBindings(overrides)
  return hintActions.flatMap(([action, labelKey]) => {
    const binding = bindings.find((item) => item.action === action)
    return binding && typeof binding.hotkey === 'string'
      ? [{ action, labelKey, shortcut: formatShortcut(binding.hotkey) }]
      : []
  })
}

// Presentation only: retain source node identities, heading IDs and Markdown payloads.
export const createMindmapPresentation = (
  graph: GraphData,
  contentMode: GraphContentMode = 'none',
): GraphData => {
  const headings = graph.nodes.filter((node) => node.type === 'heading')
  let nodes = graph.nodes
  let edges = graph.edges

  if (headings.length > 0) {
    nodes = graph.nodes.filter((node) => node.type === 'heading' || node.type === 'file')
    const nodeIds = new Set(nodes.map((node) => node.id))
    edges = graph.edges.filter(
      (edge) =>
        edge.data?.kind === 'contains' && nodeIds.has(edge.source) && nodeIds.has(edge.target),
    )
    const files = nodes.filter((node) => node.type === 'file')
    const headingIds = new Set(headings.map((node) => node.id))
    const childIds = new Set(
      edges.filter((edge) => headingIds.has(edge.source)).map((edge) => edge.target),
    )
    const roots = headings.filter((node) => !childIds.has(node.id))
    const file = files.length === 1 ? files[0] : undefined
    const root = roots.length === 1 ? roots[0] : undefined
    const hasPreamble = Boolean(file?.data.content?.trim() || file?.data.contentBlocks?.length)

    if (
      file &&
      root?.data.level === 1 &&
      !hasPreamble &&
      edges.some((edge) => edge.source === file.id && edge.target === root.id)
    ) {
      nodes = nodes.filter((node) => node !== file)
      edges = edges.filter((edge) => edge.source !== file.id && edge.target !== file.id)
    }
  }

  // Text edits do not change topology. Only structure or an explicit view switch relayouts.
  const layoutKey = JSON.stringify([
    'mindmap',
    contentMode,
    nodes.map((node) => [node.id, node.type]),
    edges.map((edge) => [edge.id, edge.source, edge.target]),
  ])
  return { nodes, edges, layoutKey }
}
