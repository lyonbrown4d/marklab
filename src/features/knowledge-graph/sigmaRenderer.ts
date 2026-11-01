import Sigma, { DEFAULT_STYLES } from 'sigma'
import { DEFAULT_EDGE_PRIMITIVES } from 'sigma/primitives'
import { extremityArrow, sdfSquare } from 'sigma/rendering'
import { layerImage } from '@sigma/node-image'
import type { GraphData } from '@/logic/graph'
import {
  createKnowledgeTopology,
  readGraphPalette,
} from '@/features/knowledge-graph/graphologyAdapter'
import { readGraphView, saveGraphView } from '@/features/knowledge-graph/graphViewCache'
import type { GraphCameraState, GraphFocusRequest } from '@/features/knowledge-graph/types'
import { graphNodeIcon } from '@/features/knowledge-graph/graphNodeIcons'
import { bindGraphWheelController } from '@/features/knowledge-graph/graphWheelController'
import {
  createGraphLabels,
  GRAPH_LABEL_MARGIN,
  GRAPH_LABEL_SIZE,
} from '@/features/knowledge-graph/graphLabels'

type Options = {
  container: HTMLElement
  graph: GraphData
  workspaceKey: string
  viewKey?: string
  onSelectNode: (id: string | null) => void
  onOpenNode: (id: string) => void
  onCameraChange: (camera: GraphCameraState) => void
}

export const createSigmaRenderer = ({
  container,
  graph: data,
  workspaceKey,
  viewKey = 'workspace',
  onSelectNode,
  onOpenNode,
  onCameraChange,
}: Options) => {
  const snapshot = readGraphView(workspaceKey, viewKey)
  let palette = readGraphPalette(container)
  let content = data
  const nodeIds = new Set(data.nodes.map((node) => node.id))
  let manualOverrides = Object.fromEntries(
    Object.entries(snapshot?.manualOverrides ?? {}).filter(([id]) => nodeIds.has(id)),
  )
  const graph = createKnowledgeTopology(data, manualOverrides, palette)
  let selected: string | null = null
  let neighborhood = new Set<string>()
  const labels = createGraphLabels(graph)
  const renderer = new Sigma(graph, container, {
    primitives: {
      nodes: {
        shapes: [sdfSquare()],
        label: { margin: GRAPH_LABEL_MARGIN },
        variables: { image: { type: 'string', default: '' } },
        layers: [
          layerImage({
            drawingMode: 'color',
            padding: 0,
            textureManagerOptions: {
              size: { mode: 'force', value: 64 },
              maxTextureSize: 512,
              debounceTimeout: 0,
            },
          }),
        ],
      },
      edges: { ...DEFAULT_EDGE_PRIMITIVES, extremities: [extremityArrow()] },
    },
    settings: {
      allowInvalidContainer: true,
      // Keep the file icons legible in screen pixels as the graph camera changes.
      itemSizesReference: 'screen',
      hideEdgesOnMove: true,
      enableCameraRotation: false,
      enableNodeDrag: true,
      labelRenderedSizeThreshold: 6,
      labelDensity: 0.65,
      stagePadding: 24,
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
    },
    styles: {
      nodes: {
        ...DEFAULT_STYLES.nodes,
        shape: 'square',
        labelColor: palette.foreground,
        labelSize: GRAPH_LABEL_SIZE,
        backdropColor: palette.foreground,
        backdropVisibility: 'hidden',
      },
      edges: { ...DEFAULT_STYLES.edges, color: palette.edge, size: 0.7, head: 'arrow' },
    },
    nodeReducer: (id, display, _attributes, state) => ({
      color: id === selected ? palette.primary : palette[graph.getNodeAttribute(id, 'kind')],
      labelColor: palette.foreground,
      opacity: !selected || neighborhood.has(id) ? 1 : 0.2,
      size: display.size + (id === selected ? 3 : 0),
      ...labels.style(id),
      labelBackgroundColor: id === selected || state?.isHovered ? palette.background : '',
      labelBackgroundPadding: 2,
      highlighted: id === selected,
    }),
    edgeReducer: (id) => {
      const connected = selected && (graph.source(id) === selected || graph.target(id) === selected)
      return {
        color: connected ? palette.primary : palette.edge,
        opacity: selected ? (connected ? 0.85 : 0.1) : 0.5,
        size: connected ? 1.5 : 0.7,
      }
    },
  })
  const unbindLabels = labels.bind(renderer)
  const wheelController = bindGraphWheelController(renderer, container)
  const camera = renderer.getCamera()
  if (snapshot) camera.setState(snapshot.camera)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  const save = () => {
    clearTimeout(saveTimer)
    if (!destroyed)
      saveGraphView(workspaceKey, content.topology_key, manualOverrides, camera.getState(), viewKey)
  }
  const reconcileContent = () => {
    const nodes = new Map(content.nodes.map((node) => [node.id, node]))
    manualOverrides = Object.fromEntries(
      Object.entries(manualOverrides).filter(([id]) => nodes.has(id)),
    )
    graph.updateEachNodeAttributes(
      (id, attributes) => {
        const node = nodes.get(id)
        return node
          ? {
              ...attributes,
              ...(manualOverrides[id] ?? node.position),
              label: node.label,
              ...graphNodeIcon(node),
            }
          : attributes
      },
      { attributes: ['x', 'y', 'label', 'image', 'iconKind'] },
    )
  }
  renderer.on('clickNode', ({ node }) => onSelectNode(node))
  renderer.on('doubleClickNode', ({ node, event }) => {
    event.preventSigmaDefault()
    onOpenNode(node)
  })
  renderer.on('clickStage', () => onSelectNode(null))
  renderer.on('nodeDragStart', () => {
    wheelController.cancel()
  })
  renderer.on('nodeDragEnd', ({ node, allDraggedNodes }) => {
    for (const id of new Set([node, ...allDraggedNodes])) {
      if (!graph.hasNode(id)) continue
      const { x, y } = graph.getNodeAttributes(id)
      manualOverrides[id] = { x, y }
    }
    save()
  })
  const cameraUpdated = (state: GraphCameraState) => {
    onCameraChange(state)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(save, 250)
  }
  camera.on('updated', cameraUpdated)
  const resize = new ResizeObserver(() => renderer.resize())
  resize.observe(container)
  const themeObserver = new MutationObserver(() => {
    palette = readGraphPalette(container)
    renderer.refresh()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme'],
  })
  return {
    arrange: () => {
      if (destroyed) return
      wheelController.cancel()
      manualOverrides = {}
      reconcileContent()
      renderer.refresh()
      save()
    },
    updateContent: (next: GraphData) => {
      if (destroyed) return
      content = next
      labels.clearMeasurements()
      reconcileContent()
    },
    select: (id: string | null) => {
      if (destroyed) return
      selected = id && graph.hasNode(id) ? id : null
      labels.select(selected)
      neighborhood = selected ? new Set([selected, ...graph.neighbors(selected)]) : new Set()
      renderer.refresh()
    },
    focus: (request: GraphFocusRequest) => {
      if (destroyed) return false
      const node = content.nodes.find(
        (item) => item.id === request.nodeId || item.path === request.nodeId,
      )
      if (request.nodeId !== 'workspace' && !node) return false
      if (node) onSelectNode(node.id)
      else onSelectNode(null)
      wheelController.cancel()
      if (request.viewport) camera.setState(request.viewport)
      else if (node)
        camera.setState({
          ...renderer.graphToFramedGraph(graph.getNodeAttributes(node.id)),
          ratio: 0.35,
        })
      else camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
      return true
    },
    fit: () => {
      if (destroyed) return
      wheelController.cancel()
      camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
      save()
    },
    zoom: (factor: number) => {
      if (destroyed) return
      wheelController.cancel()
      camera.setState({ ratio: camera.ratio * factor })
    },
    destroy: () => {
      if (destroyed) return
      save()
      destroyed = true
      resize.disconnect()
      themeObserver.disconnect()
      camera.off('updated', cameraUpdated)
      camera.cancelAnimation()
      wheelController.destroy()
      unbindLabels()
      renderer.kill()
    },
  }
}

export type SigmaGraphRenderer = ReturnType<typeof createSigmaRenderer>
