import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLatest } from 'ahooks'
import { basename } from 'pathe'
import { toast } from 'sonner'
import type { LayoutContext } from '@/app/AppLayoutContext'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { ActiveWorkspaceProvider } from '@/app/activeWorkspaceContext'
import { useI18n } from '@/i18n/useI18n'
import {
  pathToFileViewRoute,
  pathToWorkspaceTabRoute,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
} from '@/logic/routing'
import { fileViewForOpenPath } from '@/logic/fileTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type { FileViewKind, WorkspaceTab } from '@/store/appTypes'
import {
  WorkspaceDock,
  type DockTab,
  type WorkspaceDockHandle,
} from '@/features/workbench/WorkspaceDock'
import { WorkspaceRoutePanel } from '@/features/workbench/WorkspaceRoutePanel'
import {
  clearWorkbenchSurface,
  documentAtRoute,
  setWorkbenchSurface,
} from '@/features/workbench/workbenchState'
import { registerWorkspaceDock } from '@/features/workbench/workbenchCommands'
import { sameDockRoute } from '@/features/workbench/dockRoutes'

type Props = { context: LayoutContext; workspaceKey: string; tabs: WorkspaceTab[] }
type PanelState = { active: boolean; visible: boolean }

export const WorkspaceDockOutlet = ({ context, workspaceKey, tabs }: Props) => {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const route = location.pathname + location.search + location.hash
  const routeState: unknown = location.state
  const latest = useLatest({ context, route, routeState, t })
  const dock = useRef<WorkspaceDockHandle | null>(null)
  const flushers = useRef(new Map<string, () => Promise<void>>())
  const currentPane = useRef<string | null>(null)
  const activation = useRef(0)
  const expectedRoute = useRef<string | null>(null)
  const restoredRoute = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [readyPane, setReadyPane] = useState<string | null>(null)
  const [retained, setRetained] = useState<string[]>([])

  const describe = useCallback(
    (nextRoute: string): DockTab => {
      const document = documentAtRoute(nextRoute)
      const graph = nextRoute === GRAPH_WORKSPACE_ROUTE_PATTERN
      return {
        id: crypto.randomUUID(),
        route: nextRoute,
        kind: graph ? 'graph' : document ? 'document' : 'other',
        title: document
          ? basename(document.path)
          : latest.current.t(graph ? 'titlebar.workspaceMap' : 'tabs.openFiles'),
      }
    },
    [latest],
  )
  const bootstrapRoute =
    route === '/' && context.activeTab ? pathToWorkspaceTabRoute(context.activeTab) : route
  const [initialTabs] = useState(() => {
    const routes = [...new Set(tabs.map(pathToWorkspaceTabRoute))]
    if (!routes.some((candidate) => sameDockRoute(candidate, bootstrapRoute)))
      routes.push(bootstrapRoute)
    return routes.map(describe)
  })
  const initialActiveId = initialTabs.find((tab) => sameDockRoute(tab.route, bootstrapRoute))?.id

  const flushPane = useCallback(
    async (id: string | null) => {
      if (!id) return
      const flush = flushers.current.get(id)
      if (flush) await flush()
      await latest.current.context.flushBuffers?.()
    },
    [latest],
  )

  const activate = useCallback(
    (tab: DockTab) => {
      const epoch = ++activation.current
      const outgoing = currentPane.current
      const operation = outgoing !== tab.id ? flushPane(outgoing) : Promise.resolve()
      setReadyPane(null)
      void operation
        .then(() => {
          if (epoch !== activation.current) return
          currentPane.current = tab.id
          setReadyPane(tab.id)
          // Visible groups are never evicted; retain only eight visited hidden panes.
          setRetained((previous) => [tab.id, ...previous.filter((id) => id !== tab.id)].slice(0, 8))
          const document = documentAtRoute(tab.route)
          if (!sameDockRoute(latest.current.route, tab.route)) expectedRoute.current = tab.route
          // A restored URL can already match while bootstrap still selected another file.
          if (document) latest.current.context.onOpenFileView(document.path, document.view)
          else if (!sameDockRoute(latest.current.route, tab.route)) navigate(tab.route)
        })
        .catch((error: unknown) => {
          if (epoch !== activation.current) return
          toast.error(String(error))
          setReadyPane(outgoing)
          if (outgoing) dock.current?.activate(outgoing)
        })
    },
    [flushPane, latest, navigate],
  )

  useEffect(() => {
    if (!ready || !dock.current) return
    if (restoredRoute.current && !sameDockRoute(restoredRoute.current, route)) return
    restoredRoute.current = null
    if (route !== '/') {
      for (const tab of dock.current.getTabs()) {
        if (tab.route === '/') dock.current.close(tab.id)
      }
    }
    if (sameDockRoute(expectedRoute.current, route)) {
      expectedRoute.current = null
      return
    }
    if (sameDockRoute(dock.current.getActiveTab()?.route, route)) return
    const existing = dock.current.getTabs().find((tab) => sameDockRoute(tab.route, route))
    if (existing) dock.current.activate(existing.id)
    else dock.current.open(describe(route))
  }, [describe, ready, route])
  useEffect(() => () => clearWorkbenchSurface(workspaceKey), [workspaceKey])
  useEffect(() => {
    if (ready && dock.current) return registerWorkspaceDock(workspaceKey, dock.current)
  }, [ready, workspaceKey])

  const openFile = useCallback(
    (sourceId: string, path: string, view?: FileViewKind, beside = false, activate = !beside) => {
      const handle = dock.current
      if (!handle || !handle.getTabs().some((tab) => tab.id === sourceId)) return
      const fileView =
        view ?? fileViewForOpenPath(path, usePreferencesStore.getState().defaultFileView)
      const nextRoute = pathToFileViewRoute(path, fileView)
      const sourceGroup = handle.getGroupId(sourceId)
      const secondary = beside
        ? handle
            .getTabs()
            .find((tab) => tab.kind === 'document' && handle.getGroupId(tab.id) !== sourceGroup)
        : undefined
      const targetGroup = handle.getGroupId(secondary?.id ?? sourceId)
      const existing = handle
        .getTabs()
        .find(
          (tab) =>
            sameDockRoute(tab.route, nextRoute) &&
            handle.getGroupId(tab.id) === targetGroup &&
            (!beside || secondary),
        )
      if (existing) {
        if (activate) handle.activate(existing.id)
        else handle.reveal(existing.id)
        return
      }
      handle.open(describe(nextRoute), {
        referenceId: secondary?.id ?? sourceId,
        direction: beside && !secondary ? 'right' : 'within',
        activate,
        reveal: beside,
      })
    },
    [describe],
  )

  const renderPanel = useCallback(
    (tab: DockTab, state: PanelState) =>
      state.visible || retained.includes(tab.id) ? (
        <WorkspaceRoutePanel
          tab={tab}
          context={context}
          pane={{
            id: tab.id,
            active: state.active && readyPane === tab.id,
            visible: state.visible,
            recoveryKey: 0,
            registerFlush: (flush) => {
              flushers.current.set(tab.id, flush)
              return () => {
                if (flushers.current.get(tab.id) === flush) flushers.current.delete(tab.id)
              }
            },
            openFile: (path, view) => openFile(tab.id, path, view),
            openBeside: (path, view, activate) => openFile(tab.id, path, view, true, activate),
          }}
        />
      ) : null,
    [context, openFile, readyPane, retained],
  )

  const labels = useMemo(
    () => ({
      loadingLayout: t('workbench.loadingLayout'),
      loadLayoutFailed: t('workbench.loadLayoutFailed'),
      saveLayoutFailed: t('workbench.saveLayoutFailed'),
      splitRight: t('workbench.splitRight'),
      splitDown: t('workbench.splitDown'),
      moveToGroup: t('workbench.moveToGroup'),
      group: (index: number) => t('workbench.group', { index }),
      close: t('actions.closeTab'),
      closeOthers: t('workbench.closeOthers'),
      closeRight: t('workbench.closeRight'),
      closeAll: t('workbench.closeAll'),
    }),
    [t],
  )

  if (!context.rootPath) return <EditorPaneFallback />

  return (
    <ActiveWorkspaceProvider value={workspaceKey}>
      <WorkspaceDock
        ref={dock}
        workspaceKey={workspaceKey}
        initialTabs={initialTabs}
        initialActiveId={initialActiveId}
        labels={labels}
        renderPanel={renderPanel}
        onReady={(handle, { restored }) => {
          const active = handle.getActiveTab()
          if (restored) {
            restoredRoute.current = active?.route ?? null
            if (active) {
              // Supersede an earlier bootstrap navigation even if this URL already matches.
              navigate(active.route, {
                replace: true,
                state: sameDockRoute(latest.current.route, active.route)
                  ? latest.current.routeState
                  : null,
              })
            }
            // Empty native layouts must not reopen a stale URL.
            if (!active) expectedRoute.current = latest.current.route
          }
          setReady(true)
        }}
        onActivate={activate}
        onBeforeClose={(tab) => flushPane(tab.id === currentPane.current ? tab.id : null)}
        onError={(error) => toast.error(String(error))}
        onClose={(tab) => {
          setRetained((previous) => previous.filter((id) => id !== tab.id))
          flushers.current.delete(tab.id)
          const document = documentAtRoute(tab.route)
          if (
            document &&
            !dock.current?.getTabs().some((other) => sameDockRoute(other.route, tab.route))
          )
            context.onCloseTab?.(`file:${document.view}:${document.path}`)
        }}
        onTabsChanged={(all, visible) =>
          setWorkbenchSurface(
            workspaceKey,
            all.map((tab) => tab.route),
            visible.map((tab) => tab.route),
          )
        }
      />
    </ActiveWorkspaceProvider>
  )
}
