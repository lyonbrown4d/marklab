import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ViewportPortal, useStore, useStoreApi } from '@xyflow/react'
import type { Edge } from '@xyflow/react'
import { cn } from '@/lib/utils'
import {
  createWorkspaceMapOverviewEdgeSelector,
  sameWorkspaceMapOverviewEdges,
} from '@/pages/workspace-map/workspaceMapOverviewEdgeGeometry'
import { createWorkspaceMapCanvasEdgePainter } from '@/pages/workspace-map/workspaceMapCanvasEdgePainter'

const WorkspaceMapSvgEdges = ({ edges }: { edges: Edge[] }) => {
  const selector = useMemo(() => createWorkspaceMapOverviewEdgeSelector(edges), [edges])
  const visible = useStore(selector, sameWorkspaceMapOverviewEdges)

  return (
    <svg
      className="workspace-map-overview-edges pointer-events-none absolute inset-0 -z-10 overflow-visible"
      data-testid="workspace-map-overview-edges"
    >
      {visible.map(({ edge, path }) => (
        <g
          aria-label={
            edge.ariaLabel === null
              ? undefined
              : (edge.ariaLabel ?? `Edge from ${edge.source} to ${edge.target}`)
          }
          aria-roledescription="edge"
          className={cn('react-flow__edge !pointer-events-none', edge.className)}
          data-id={edge.id}
          data-testid={`rf__edge-${edge.id}`}
          key={edge.id}
          role={edge.ariaRole ?? 'img'}
        >
          <path className="react-flow__edge-path" d={path} fill="none" style={edge.style} />
        </g>
      ))}
    </svg>
  )
}

const WorkspaceMapCanvasEdges = ({ edges }: { edges: Edge[] }) => {
  const store = useStoreApi()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const semanticsRef = useRef<SVGSVGElement>(null)
  const painterRef = useRef<ReturnType<typeof createWorkspaceMapCanvasEdgePainter>>(null)
  const [visible, setVisible] = useState<Edge[]>([])
  const [fallback, setFallback] = useState(false)

  useLayoutEffect(() => {
    if (fallback) return
    const canvas = canvasRef.current
    const semantics = semanticsRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !semantics || !context || typeof Path2D === 'undefined') {
      setFallback(true)
      return
    }
    const painter = createWorkspaceMapCanvasEdgePainter({
      canvas,
      context,
      semantics,
      edges,
      getState: store.getState,
      onVisible: setVisible,
    })
    painterRef.current = painter
    const unsubscribe = store.subscribe(() => painter.schedule())
    const restyle = () => painter.schedule(true)
    const observer = new MutationObserver(restyle)
    // Theme/LOD changes occur on ancestors, never observe editor document subtrees.
    for (let ancestor = canvas.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: [
          'class',
          'data-viewport-lod',
          'data-theme',
          ...(!ancestor.classList.contains('react-flow__viewport') ? ['style'] : []),
        ],
      })
    }
    observer.observe(document.head, { childList: true, characterData: true, subtree: true })
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    motion.addEventListener('change', restyle)
    window.addEventListener('resize', restyle)
    const lost = () => setFallback(true)
    canvas.addEventListener('contextlost', lost)
    painter.schedule(true)
    return () => {
      unsubscribe()
      observer.disconnect()
      motion.removeEventListener('change', restyle)
      window.removeEventListener('resize', restyle)
      canvas.removeEventListener('contextlost', lost)
      painter.dispose()
      painterRef.current = null
    }
  }, [edges, fallback, store])

  useLayoutEffect(() => painterRef.current?.synchronize(), [visible])

  if (fallback) return <WorkspaceMapSvgEdges edges={edges} />

  return (
    <>
      <canvas
        aria-hidden="true"
        className="workspace-map-overview-edges pointer-events-none absolute left-0 top-0 -z-10 origin-top-left"
        data-testid="workspace-map-overview-edges"
        ref={canvasRef}
      />
      <svg className="sr-only pointer-events-none" ref={semanticsRef}>
        {visible.map((edge) => (
          <g
            aria-label={
              edge.ariaLabel === null
                ? undefined
                : (edge.ariaLabel ?? `Edge from ${edge.source} to ${edge.target}`)
            }
            aria-roledescription="edge"
            className={cn('react-flow__edge !pointer-events-none', edge.className)}
            data-id={edge.id}
            data-testid={`rf__edge-${edge.id}`}
            key={edge.id}
            role={edge.ariaRole ?? 'img'}
          >
            {/* No geometry: this clipped layer supplies semantics and native CSS transitions. */}
            <path
              className="react-flow__edge-path"
              data-edge-id={edge.id}
              fill="none"
              style={edge.style}
            />
          </g>
        ))}
      </svg>
    </>
  )
}

export const WorkspaceMapOverviewEdges = memo(({ edges }: { edges: Edge[] }) => (
  <ViewportPortal>
    <WorkspaceMapCanvasEdges edges={edges} />
  </ViewportPortal>
))

WorkspaceMapOverviewEdges.displayName = 'WorkspaceMapOverviewEdges'
