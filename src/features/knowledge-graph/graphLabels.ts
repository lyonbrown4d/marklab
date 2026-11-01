import type Sigma from 'sigma'
import type { NodeDisplayData, SigmaEvents } from 'sigma/types'
import type { KnowledgeTopology } from '@/features/knowledge-graph/graphologyAdapter'

export const GRAPH_LABEL_SIZE = 12
export const GRAPH_LABEL_MARGIN = 8
const CELL = 4
const NORMAL_WIDTH = 144
const PADDING = 3
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

type Box = { left: number; top: number; right: number; bottom: number }
type LabelNode = { id: string; x: number; y: number; size: number; label: string }
export type GraphLabel = {
  label: string
  labelPosition: 'right' | 'left' | 'above' | 'below'
  bounds: Box
}

// Sigma renders individual SDF glyph advances, without canvas word kerning.
export const createGraphLabelMeasurer = (context: CanvasRenderingContext2D) => {
  context.font = 'normal normal 64px sans-serif'
  const advances = new Map<string, number>()
  return (text: string) => {
    let width = 0
    for (const character of text) {
      let advance = advances.get(character)
      if (advance === undefined) {
        advance = (context.measureText(character).width * GRAPH_LABEL_SIZE) / 64
        advances.set(character, advance)
      }
      width += advance
    }
    return width
  }
}

export const fitGraphLabel = (
  label: string,
  maxWidth: number,
  measure: (text: string) => number,
) => {
  if (measure(label) <= maxWidth) return label
  const segments = graphemes.segment(label)
  const suffix = '…'
  let result = ''
  let width = measure(suffix)
  for (const { segment } of segments) {
    const nextWidth = measure(segment)
    if (width + nextWidth > maxWidth) break
    result += segment
    width += nextWidth
  }
  return result ? result + suffix : ''
}

/** A viewport-sized occupancy grid bounds work by pixels, never by node pairs. */
export const layoutGraphLabels = (
  nodes: LabelNode[],
  viewport: { width: number; height: number },
  priority: (string | null)[],
  measure: (text: string) => number,
): Map<string, GraphLabel> => {
  const { width, height } = viewport
  const columns = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const occupied = new Uint8Array(columns * rows)
  const visible = nodes.filter(
    ({ x, y, size }) => x + size >= 0 && y + size >= 0 && x - size <= width && y - size <= height,
  )
  const cells = (box: Box, write: boolean) => {
    const x1 = Math.max(0, Math.floor(box.left / CELL))
    const y1 = Math.max(0, Math.floor(box.top / CELL))
    const x2 = Math.min(columns - 1, Math.floor(box.right / CELL))
    const y2 = Math.min(rows - 1, Math.floor(box.bottom / CELL))
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const index = y * columns + x
        if (write) occupied[index] = 1
        else if (occupied[index]) return false
      }
    }
    return true
  }
  visible.forEach(({ x, y, size }) =>
    cells({ left: x - size, right: x + size, top: y - size, bottom: y + size }, true),
  )
  const priorities = new Set(priority.filter((id): id is string => id !== null))
  const ordered = [
    ...priority.flatMap((id) => visible.find((node) => node.id === id) ?? []),
    ...visible.filter(({ id }) => !priorities.has(id)),
  ]
  const labels = new Map<string, GraphLabel>()
  for (const node of ordered) {
    if (labels.has(node.id) || (!priorities.has(node.id) && node.size < 6)) continue
    const { x, y, size } = node
    const gap = size + GRAPH_LABEL_MARGIN
    const available = Math.max(width - x - gap, x - gap, 2 * Math.min(x, width - x)) - PADDING * 2
    const ordinary = fitGraphLabel(node.label, Math.min(NORMAL_WIDTH, available), measure)
    const texts = priorities.has(node.id)
      ? [fitGraphLabel(node.label, available, measure), ordinary]
      : [ordinary]
    for (const label of texts) {
      if (!label) continue
      const half = measure(label) / 2
      // Reserve a 24px line box, including SDF glyph overhang and background padding.
      const candidates: [GraphLabel['labelPosition'], number, number][] = [
        ['right', x + gap + half, y],
        ['left', x - gap - half, y],
        ['below', x, y + gap + 8],
        ['above', x, y - gap - 8],
      ]
      for (const [labelPosition, cx, cy] of candidates) {
        const bounds = {
          left: cx - half - PADDING,
          right: cx + half + PADDING,
          top: cy - 12,
          bottom: cy + 12,
        }
        if (bounds.left < 0 || bounds.top < 0 || bounds.right > width || bounds.bottom > height)
          continue
        if (!cells(bounds, false)) continue
        cells(bounds, true)
        labels.set(node.id, { label, labelPosition, bounds })
        break
      }
      if (labels.has(node.id)) break
    }
  }
  return labels
}

type LabelRenderer = Pick<
  Sigma,
  'getDimensions' | 'getCamera' | 'graphToViewport' | 'scaleSize'
> & {
  refresh: (options?: Parameters<Sigma['refresh']>[0]) => unknown
  on: <Event extends keyof SigmaEvents>(event: Event, listener: SigmaEvents[Event]) => unknown
  off: <Event extends keyof SigmaEvents>(event: Event, listener: SigmaEvents[Event]) => unknown
}

export const createGraphLabels = (graph: KnowledgeTopology) => {
  const context = document.createElement('canvas').getContext('2d')
  const measure = context ? createGraphLabelMeasurer(context) : (text: string) => text.length * 12
  const widths = new Map<string, number>()
  const cachedMeasure = (text: string) => {
    let width = widths.get(text)
    if (width === undefined) {
      width = measure(text)
      widths.set(text, width)
    }
    return width
  }
  let labels = new Map<string, GraphLabel>()
  let selected: string | null = null
  let hovered: string | null = null
  const style = (id: string): Partial<NodeDisplayData> => {
    const label = labels.get(id)
    return {
      label: label?.label ?? '',
      labelPosition: label?.labelPosition ?? 'right',
      labelVisibility: label ? 'visible' : 'hidden',
      labelDepth: id === hovered || id === selected ? 'topNodes' : 'nodes',
    }
  }
  const bind = (renderer: LabelRenderer) => {
    const update = () => {
      const cameraState = renderer.getCamera().getState()
      const nodes: LabelNode[] = []
      graph.forEachNode((id, attributes) => {
        nodes.push({
          id,
          ...renderer.graphToViewport(attributes, { cameraState }),
          size: renderer.scaleSize(attributes.size + (id === selected ? 3 : 0)),
          label: attributes.label,
        })
      })
      const next = layoutGraphLabels(
        nodes,
        renderer.getDimensions(),
        [hovered, selected],
        cachedMeasure,
      )
      const changed = new Set<string>()
      for (const [id, label] of next) {
        const previous = labels.get(id)
        if (previous?.label !== label.label || previous.labelPosition !== label.labelPosition)
          changed.add(id)
      }
      for (const id of labels.keys()) if (!next.has(id)) changed.add(id)
      labels = next
      if (changed.size)
        renderer.refresh({
          partialGraph: { nodes: [...changed] },
          skipIndexation: true,
          schedule: true,
        })
    }
    const enter = ({ node }: { node: string }) => {
      hovered = node
    }
    const leave = () => {
      hovered = null
    }
    renderer.on('beforeRender', update)
    renderer.on('afterProcess', update)
    renderer.on('enterNode', enter)
    renderer.on('leaveNode', leave)
    update()
    return () => {
      renderer.off('beforeRender', update)
      renderer.off('afterProcess', update)
      renderer.off('enterNode', enter)
      renderer.off('leaveNode', leave)
    }
  }
  return {
    style,
    bind,
    select: (id: string | null) => {
      selected = id
    },
    clearMeasurements: () => widths.clear(),
  }
}
