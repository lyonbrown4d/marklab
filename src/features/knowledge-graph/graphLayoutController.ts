import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { inferSettings } from 'graphology-layout-forceatlas2'
import circlepack from 'graphology-layout/circlepack'
import { assignLayout } from 'graphology-layout/utils'
import {
  seedKnowledgeTopology,
  topologyPositions,
  type KnowledgeTopology,
} from '@/features/knowledge-graph/graphologyAdapter'
import type { GraphLayoutKind } from '@/features/knowledge-graph/graphLayoutTypes'

type Positions = Record<string, { x: number; y: number }>
type Session = { worker: FA2Layout; graph: KnowledgeTopology; manualOverrides: Positions }

/** Compute away from the visible graph, then publish once; dragging can discard pending work. */
export const createGraphLayout = (graph: KnowledgeTopology, onSettled: () => void) => {
  let active: Session | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let destroyed = false
  const stop = (publish = false) => {
    clearTimeout(timer)
    timer = undefined
    const retiring = active
    active = undefined
    if (!retiring) return
    retiring.worker.kill()
    if (!publish || destroyed) return
    assignLayout(graph, { ...topologyPositions(retiring.graph), ...retiring.manualOverrides })
    onSettled()
  }
  return {
    isRunning: () => active !== undefined,
    start: (manualOverrides: Positions, kind: GraphLayoutKind = 'forceatlas2') => {
      if (destroyed) return
      stop()
      if (graph.order === 0) {
        onSettled()
        return
      }
      if (kind !== 'forceatlas2') {
        if (kind === 'grouped') circlepack.assign(graph, { hierarchyAttributes: ['layoutGroup'] })
        else seedKnowledgeTopology(graph)
        assignLayout(graph, manualOverrides)
        onSettled()
        return
      }
      if (graph.order < 2) {
        onSettled()
        return
      }
      const computation = graph.copy()
      computation.updateEachNodeAttributes(
        (id, attributes) => ({ ...attributes, fixed: Boolean(manualOverrides[id]) }),
        { attributes: ['fixed'] },
      )
      let worker: FA2Layout | undefined
      try {
        worker = new FA2Layout(computation, {
          settings: {
            ...inferSettings(graph),
            barnesHutOptimize: graph.order > 250,
            gravity: 0.8,
            scalingRatio: 8,
            slowDown: 4,
          },
        })
        const session = { worker, graph: computation, manualOverrides }
        active = session
        worker.start()
        timer = setTimeout(
          () => {
            if (active === session && !destroyed) stop(true)
          },
          Math.min(2500, 600 + graph.order * 2),
        )
      } catch {
        worker?.kill()
        active = undefined
        // Worker creation may be blocked. The library-seeded graph stays usable and persisted.
        onSettled()
      }
    },
    stop,
    destroy: () => {
      destroyed = true
      stop()
    },
  }
}
