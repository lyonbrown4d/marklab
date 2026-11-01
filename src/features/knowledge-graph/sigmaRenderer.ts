import Sigma, { DEFAULT_STYLES } from 'sigma'
import { DEFAULT_EDGE_PRIMITIVES } from 'sigma/primitives'
import { extremityArrow } from 'sigma/rendering'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { inferSettings } from 'graphology-layout-forceatlas2'
import type { GraphData } from '@/logic/graph'
import {
  createKnowledgeTopology,
  readGraphPalette,
  topologyPositions,
} from '@/features/knowledge-graph/graphologyAdapter'
import { readGraphView, saveGraphView } from '@/features/knowledge-graph/graphViewCache'
import type { GraphCameraState, GraphFocusRequest } from '@/features/knowledge-graph/types'

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
  const snapshot = readGraphView(workspaceKey, data.topology_key, viewKey)
  let palette = readGraphPalette(container)
  const graph = createKnowledgeTopology(data, snapshot?.positions, palette)
  let selected: string | null = null
  let neighborhood = new Set<string>()
  const renderer = new Sigma(graph, container, {
    primitives: { edges: { ...DEFAULT_EDGE_PRIMITIVES, extremities: [extremityArrow()] } },
    settings: {
      allowInvalidContainer: true,
      // Sigma 4 defaults to graph-coordinate sizes; navigation dots use screen pixels.
      itemSizesReference: 'screen',
      hideEdgesOnMove: true,
      enableCameraRotation: false,
      enableNodeDrag: true,
      labelRenderedSizeThreshold: 6,
      labelDensity: 0.65,
      stagePadding: 48,
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
    },
    styles: {
      nodes: {
        ...DEFAULT_STYLES.nodes,
        labelColor: palette.foreground,
        labelSize: 12,
        backdropColor: palette.foreground,
        backdropVisibility: 'hidden',
      },
      edges: { ...DEFAULT_STYLES.edges, color: palette.edge, size: 0.7, head: 'arrow' },
    },
    nodeReducer: (id, display) => ({
      color:
        id === selected
          ? palette.primary
          : palette[graph.getNodeAttribute(id, 'kind') as 'file' | 'preview' | 'missing'],
      labelColor: palette.foreground,
      opacity: !selected || neighborhood.has(id) ? 1 : 0.2,
      size: display.size + (id === selected ? 3 : 0),
      labelVisibility: id === selected ? 'visible' : 'auto',
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
  const camera = renderer.getCamera()
  if (snapshot) camera.setState(snapshot.camera)
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let layoutGraph = graph
  let worker: FA2Layout | null = null
  let layoutTimer: ReturnType<typeof setTimeout> | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  const save = () => {
    clearTimeout(saveTimer)
    if (!destroyed)
      saveGraphView(
        workspaceKey,
        data.topology_key,
        topologyPositions(graph),
        camera.getState(),
        viewKey,
      )
  }
  const stopLayout = () => {
    clearTimeout(layoutTimer)
    if (worker && layoutGraph !== graph) {
      worker.kill()
      graph.updateEachNodeAttributes(
        (id, attributes) => ({
          ...attributes,
          x: layoutGraph.getNodeAttribute(id, 'x'),
          y: layoutGraph.getNodeAttribute(id, 'y'),
        }),
        { attributes: ['x', 'y'] },
      )
      renderer.refresh()
    } else worker?.kill()
    worker = null
    layoutGraph = graph
    save()
  }
  const startLayout = () => {
    if (destroyed || graph.order < 2 || graph.size === 0) return
    stopLayout()
    try {
      // Compute privately when motion is reduced, then publish the bounded result once.
      layoutGraph = reducedMotion ? graph.copy() : graph
      worker = new FA2Layout(layoutGraph, {
        settings: {
          ...inferSettings(graph),
          barnesHutOptimize: graph.order > 250,
          gravity: 0.8,
          scalingRatio: 8,
          slowDown: 4,
        },
      })
      worker.start()
      layoutTimer = setTimeout(stopLayout, Math.min(2500, 600 + graph.order * 2))
    } catch {
      // A restricted environment may disallow workers; seeded positions remain usable.
      worker?.kill()
      worker = null
      layoutGraph = graph
    }
  }
  if (snapshot?.topologyKey !== data.topology_key) startLayout()
  renderer.on('clickNode', ({ node }) => onSelectNode(node))
  renderer.on('doubleClickNode', ({ node, event }) => {
    event.preventSigmaDefault()
    onOpenNode(node)
  })
  renderer.on('clickStage', () => onSelectNode(null))
  renderer.on('nodeDragStart', stopLayout)
  renderer.on('nodeDragEnd', save)
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
    arrange: startLayout,
    updateContent: (next: GraphData) => {
      if (destroyed) return
      next.nodes.forEach((node) => {
        if (graph.hasNode(node.id)) graph.setNodeAttribute(node.id, 'label', node.label)
      })
    },
    select: (id: string | null) => {
      if (destroyed) return
      selected = id && graph.hasNode(id) ? id : null
      neighborhood = selected ? new Set([selected, ...graph.neighbors(selected)]) : new Set()
      renderer.refresh()
    },
    focus: (request: GraphFocusRequest) => {
      if (destroyed) return false
      const node = data.nodes.find(
        (item) => item.id === request.nodeId || item.path === request.nodeId,
      )
      if (request.nodeId !== 'workspace' && !node) return false
      if (node) onSelectNode(node.id)
      else onSelectNode(null)
      stopLayout()
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
      stopLayout()
      camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
    },
    zoom: (factor: number) => {
      if (destroyed) return
      camera.setState({ ratio: camera.ratio * factor })
    },
    destroy: () => {
      if (destroyed) return
      clearTimeout(saveTimer)
      stopLayout()
      destroyed = true
      resize.disconnect()
      themeObserver.disconnect()
      camera.off('updated', cameraUpdated)
      camera.cancelAnimation()
      renderer.kill()
    },
  }
}

export type SigmaGraphRenderer = ReturnType<typeof createSigmaRenderer>
