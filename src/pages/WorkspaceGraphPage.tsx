import { useCallback, useState } from 'react'
import { useKeepAliveContext } from 'keepalive-for-react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { KnowledgeGraphCanvas } from '@/features/knowledge-graph/KnowledgeGraphCanvas'
import { KnowledgeGraphDetails } from '@/features/knowledge-graph/KnowledgeGraphDetails'
import type { GraphCameraState } from '@/features/knowledge-graph/types'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'
import {
  clearWorkspaceMapNodeFocusRequest,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

const WorkspaceGraphPage = () => {
  const context = useLayoutContext(
    useShallow((state) => ({
      graph: state.graph,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
      graphError: state.graphError,
      graphLoading: state.graphLoading,
      graphRefreshing: state.graphRefreshing,
      graphRetry: state.graphRetry,
      onOpenFile: state.onOpenFile,
    })),
  )
  const { t } = useI18n()
  const keepAlive = useKeepAliveContext()
  const active = !keepAlive.cacheKey || keepAlive.active
  const workspaceKey = `${context.rootKind}:${context.rootPath}`
  const [selection, setSelection] = useState<{ workspaceKey: string; id: string } | null>(null)
  const request = useStore(workspaceMapNavigationStore, (state) => state.request)
  const pending = request?.workspaceKey === workspaceKey ? request : null
  const targetUnavailable =
    active &&
    !context.graphLoading &&
    !context.graphRefreshing &&
    pending &&
    pending.nodeId !== 'workspace' &&
    !context.graph.nodes.some((node) => node.id === pending.nodeId || node.path === pending.nodeId)
  const unavailableNotice = targetUnavailable ? (
    <div
      className={
        context.graph.nodes.length
          ? 'absolute bottom-14 left-3 z-10 flex max-w-sm items-center gap-2 rounded-md border bg-card/95 px-3 py-2 text-xs shadow-sm'
          : 'flex max-w-sm items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs'
      }
      role="alert"
    >
      <span>{t('knowledgeGraph.targetUnavailable')}</span>
      <Button
        onClick={() => {
          if (pending) clearWorkspaceMapNodeFocusRequest(pending)
        }}
        size="sm"
        variant="ghost"
      >
        {t('knowledgeGraph.close')}
      </Button>
    </div>
  ) : null
  const selected =
    selection?.workspaceKey === workspaceKey
      ? context.graph.nodes.find((node) => node.id === selection.id)
      : undefined
  const selectNode = useCallback(
    (id: string | null) => {
      setSelection(id ? { workspaceKey, id } : null)
      const history = navigationHistoryStore.getState()
      if (active && history.workspaceKey === workspaceKey)
        history.visit({ kind: 'graph', nodeId: id ?? 'workspace', viewId: 'all' })
    },
    [active, workspaceKey],
  )
  const openNode = (id: string) => {
    const node = context.graph.nodes.find((candidate) => candidate.id === id)
    if (node && node.kind !== 'missing') context.onOpenFile(node.path)
  }
  const cameraChanged = useCallback(
    (viewport: GraphCameraState) => {
      const history = navigationHistoryStore.getState()
      if (!active || history.workspaceKey !== workspaceKey) return
      const current = history.entries[history.index]
      if (current?.kind === 'graph') history.visit({ ...current, viewport })
    },
    [active, workspaceKey],
  )
  if (context.graphLoading && !context.graph.nodes.length) {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        {t('knowledgeGraph.loading')}
      </div>
    )
  }
  if (!context.graph.nodes.length) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        role={context.graphError ? 'alert' : 'status'}
      >
        <p>{t(context.graphError ? 'knowledgeGraph.loadFailed' : 'knowledgeGraph.empty')}</p>
        {unavailableNotice}
        {context.graphError ? (
          <Button onClick={() => void context.graphRetry()} size="sm" variant="outline">
            {t('knowledgeGraph.retry')}
          </Button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      <div className="min-w-0 flex-1">
        <KnowledgeGraphCanvas
          active={active}
          focusRequest={targetUnavailable ? null : pending}
          graph={context.graph}
          key={workspaceKey}
          onCameraChange={cameraChanged}
          onFocusConsumed={() => {
            if (pending) clearWorkspaceMapNodeFocusRequest(pending)
          }}
          onOpenNode={openNode}
          onSelectNode={selectNode}
          selectedNodeId={selected?.id ?? null}
          workspaceKey={workspaceKey}
        />
      </div>
      {selected ? (
        <KnowledgeGraphDetails
          active={active}
          graph={context.graph}
          key={`${workspaceKey}:${selected.id}`}
          node={selected}
          onClose={() => selectNode(null)}
          onOpen={() => openNode(selected.id)}
          onSelect={selectNode}
          workspaceKey={workspaceKey}
        />
      ) : null}
      {unavailableNotice}
      {context.graphError ? (
        <div
          className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border bg-card/95 px-2 py-1 text-xs shadow-sm"
          role="alert"
        >
          <span>{t('knowledgeGraph.loadFailed')}</span>
          <Button onClick={() => void context.graphRetry()} size="sm" variant="ghost">
            {t('knowledgeGraph.retry')}
          </Button>
        </div>
      ) : context.graphRefreshing ? (
        <p
          className="pointer-events-none absolute bottom-3 left-3 rounded-md border bg-card/95 px-2 py-1 text-xs text-muted-foreground"
          role="status"
        >
          {t('knowledgeGraph.refreshing')}
        </p>
      ) : null}
    </div>
  )
}

export default WorkspaceGraphPage
