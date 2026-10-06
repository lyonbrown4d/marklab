import { useEffect, useMemo, useRef } from 'react'
import type { Node, ReactFlowInstance } from '@xyflow/react'
import { useLatest, useMemoizedFn } from 'ahooks'

import { registerEditorPersistenceFlusher } from '@/app/editorCloseLifecycle'
import type { GraphNodeData } from '@/logic/graph'
import {
  createWorkspaceMapLayoutSave,
  createWorkspaceMapLayoutStateRevision,
} from '@/pages/workspace-map/workspaceMapLayoutPersistence'
import { WorkspaceMapLayoutSaveQueue } from '@/pages/workspace-map/workspaceMapLayoutSaveQueue'
import {
  graphLayoutApi,
  type GraphLayoutRequest,
  type GraphLayoutViewport,
} from '@/services/graphLayoutApi'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

type PersistenceFlow = Pick<ReactFlowInstance<Node<GraphNodeData>>, 'getViewport'> | null

type Options = {
  enabled: boolean
  flow: PersistenceFlow
  nodes: Node<GraphNodeData>[]
  request?: GraphLayoutRequest
}

const WORKSPACE_MAP_LAYOUT_SAVE_DEBOUNCE_MS = 320

const reportPersistenceError = (error: unknown) => {
  rendererDiagnostics.error('workspace-map.layout', 'persistence-failed', error)
  console.warn('Workspace map layout persistence failed.', error)
}

export const useWorkspaceMapLayoutPersistence = ({ enabled, flow, nodes, request }: Options) => {
  const latest = useLatest({ enabled, flow, nodes, request })
  const queueRef = useRef<WorkspaceMapLayoutSaveQueue | null>(null)
  const stateRevision = useMemo(() => createWorkspaceMapLayoutStateRevision(nodes), [nodes])
  const requestRevision = request
    ? `${request.engineVersion}\0${request.graphRevision}\0${request.layoutKey}\0${request.mode}`
    : null
  const scheduleCurrent = useMemoizedFn(() => {
    const current = latest.current
    if (!current.enabled || !current.request) return
    queueRef.current?.schedule(
      createWorkspaceMapLayoutSave(current.request, current.nodes, readViewport(current.flow)),
    )
  })

  useEffect(() => {
    const queue = new WorkspaceMapLayoutSaveQueue({
      delayMs: WORKSPACE_MAP_LAYOUT_SAVE_DEBOUNCE_MS,
      onError: reportPersistenceError,
      save: (value) => graphLayoutApi.save(value),
    })
    queueRef.current = queue
    const unregisterCloseFlusher = registerEditorPersistenceFlusher(() => queue.flushPending())
    return () => {
      unregisterCloseFlusher()
      void queue.flushPending().catch(reportPersistenceError)
      queue.dispose()
      if (queueRef.current === queue) queueRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (enabled && requestRevision) {
        void queueRef.current?.flushPending().catch(reportPersistenceError)
      }
    },
    [enabled, requestRevision],
  )

  useEffect(() => {
    scheduleCurrent()
  }, [flow, requestRevision, scheduleCurrent, stateRevision])

  return { scheduleViewportSave: scheduleCurrent }
}

const readViewport = (flow: PersistenceFlow): GraphLayoutViewport | null => {
  if (!flow) return null
  const viewport = flow.getViewport()
  if (![viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)) return null
  return viewport
}
