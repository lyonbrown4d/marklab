import { useEffect, useEffectEvent, useState } from 'react'
import type { KnowledgeGraphCanvasProps } from '@/features/knowledge-graph/types'
import type { SigmaGraphRenderer } from '@/features/knowledge-graph/sigmaRenderer'

type RendererState = {
  workspaceKey: string
  viewKey: string
  topologyKey: string
  renderer: SigmaGraphRenderer
}

export const useSigmaGraph = (
  container: HTMLDivElement | null,
  props: KnowledgeGraphCanvasProps,
) => {
  const {
    active = true,
    graph,
    workspaceKey,
    viewKey = 'workspace',
    selectedNodeId,
    focusRequest,
    onFocusConsumed,
  } = props
  const [state, setState] = useState<RendererState | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const select = useEffectEvent((id: string | null) => props.onSelectNode(id))
  const open = useEffectEvent((id: string) => props.onOpenNode(id))
  const cameraChanged = useEffectEvent(
    (camera: Parameters<NonNullable<typeof props.onCameraChange>>[0]) =>
      props.onCameraChange?.(camera),
  )
  const latestGraph = useEffectEvent(() => graph)
  const topologyKey = graph.topology_key

  useEffect(() => {
    if (!container || !active) return
    let cancelled = false
    let instance: SigmaGraphRenderer | undefined
    void import('@/features/knowledge-graph/sigmaRenderer')
      .then(({ createSigmaRenderer }) => {
        if (cancelled) return
        try {
          instance = createSigmaRenderer({
            container,
            graph: latestGraph(),
            workspaceKey,
            viewKey,
            onSelectNode: (id) => select(id),
            onOpenNode: (id) => open(id),
            onCameraChange: (camera) => cameraChanged(camera),
          })
          setState({ workspaceKey, viewKey, topologyKey, renderer: instance })
          setFailure(null)
        } catch {
          instance?.destroy()
          container.replaceChildren()
          setFailure(`${workspaceKey}:${viewKey}:${topologyKey}`)
        }
      })
      .catch(() => {
        if (!cancelled) setFailure(`${workspaceKey}:${viewKey}:${topologyKey}`)
      })
    return () => {
      cancelled = true
      const retiring = instance
      retiring?.destroy()
      instance = undefined
      setState((current) => (current?.renderer === retiring ? null : current))
    }
  }, [active, container, topologyKey, viewKey, workspaceKey])

  const renderer =
    active &&
    state?.workspaceKey === workspaceKey &&
    state.viewKey === viewKey &&
    state.topologyKey === topologyKey
      ? state.renderer
      : null
  useEffect(() => {
    renderer?.updateContent(graph)
  }, [graph, renderer])
  useEffect(() => {
    renderer?.select(selectedNodeId ?? null)
  }, [renderer, selectedNodeId])
  useEffect(() => {
    if (!renderer || !focusRequest) return
    if (renderer.focus(focusRequest)) onFocusConsumed?.()
  }, [focusRequest, onFocusConsumed, renderer])
  return { renderer, unavailable: failure === `${workspaceKey}:${viewKey}:${topologyKey}` }
}
