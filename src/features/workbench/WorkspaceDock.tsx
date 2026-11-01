import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ForwardedRef,
} from 'react'
import {
  DockviewReact,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview-react'
import 'dockview-react/dist/styles/dockview.css'
import '@/features/workbench/workbench-dock.scss'
import { DockTabHeader } from '@/features/workbench/DockTabHeader'
import {
  createDockController,
  panelTab,
  type DockController,
} from '@/features/workbench/dockController'
import { captureDockLayout, validateDockLayout } from '@/features/workbench/dockPersistence'
import { createDockPersistenceQueue } from '@/features/workbench/dockPersistenceQueue'
import { workspaceLayoutApi } from '@/services/workspaceLayoutApi'
import { registerEditorPersistenceFlusher } from '@/app/editorCloseLifecycle'
import { cn } from '@/lib/utils'
import {
  DockContext,
  readDockTab,
  type WorkspaceDockHandle,
  type WorkspaceDockProps,
} from '@/features/workbench/dockTypes'

const DockPanel = ({ api, containerApi, params }: IDockviewPanelProps) => {
  const context = useContext(DockContext)
  const state = useSyncExternalStore(
    (notify) => {
      const subscriptions = [
        api.onDidActiveChange(notify),
        api.onDidActiveGroupChange(notify),
        api.onDidVisibilityChange(notify),
      ]
      return () => subscriptions.forEach((subscription) => subscription.dispose())
    },
    () => `${containerApi.activePanel?.id === api.id}:${api.isVisible}`,
  )
  const tab = readDockTab(params.tab)
  if (!context || !tab) return null
  const [active, visible] = state.split(':').map((value) => value === 'true')
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {context.props.renderPanel(tab, { active, visible })}
    </div>
  )
}

// Dockview owns stable React portals; changing callbacks updates context, never the registry.
const components = { workspace: DockPanel }
const theme = {
  ...themeLight,
  name: 'marklab',
  className: 'dockview-theme-light dockview-theme-marklab',
}

const DockWorkspace = ({
  props,
  forwardedRef,
}: {
  props: WorkspaceDockProps
  forwardedRef: ForwardedRef<WorkspaceDockHandle>
}) => {
  const latest = useRef(props)
  const controllerRef = useRef<DockController | undefined>(undefined)
  const disposeRef = useRef<(() => void) | undefined>(undefined)
  const lifecycle = useRef(0)
  const [controller, setController] = useState<DockController>()
  const [status, setStatus] = useState<'loading' | 'ready' | 'loadError' | 'saveError'>('loading')
  useLayoutEffect(() => {
    latest.current = props
  })
  useImperativeHandle(
    forwardedRef,
    () => ({
      open: (tab, options) => controllerRef.current?.open(tab, options),
      activate: (id) => controllerRef.current?.activate(id),
      reveal: (id) => controllerRef.current?.reveal(id),
      close: (id) => controllerRef.current?.close(id),
      getTabs: () => controllerRef.current?.getTabs() ?? [],
      getGroupId: (id) => controllerRef.current?.getGroupId(id),
      getActiveTab: () => controllerRef.current?.getActiveTab(),
    }),
    [],
  )
  useEffect(() => {
    const generation = ++lifecycle.current
    return () => {
      // Dockview retains its API during StrictMode effect replay. Dispose only
      // when this component has actually unmounted, after any replay setup.
      queueMicrotask(() => {
        // This is a generation counter, not a DOM ref; the latest value is intentional.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (generation !== lifecycle.current) return
        disposeRef.current?.()
        controllerRef.current = undefined
      })
    }
  }, [])

  const onReady = ({ api }: DockviewReadyEvent) => {
    disposeRef.current?.()
    const next = createDockController(
      api,
      () => latest.current,
      () => notify(),
    )
    let disposed = false
    let restoring = true
    let lastActiveId: string | undefined
    let lastTabsSignature: string | undefined
    let persistence: ReturnType<typeof createDockPersistenceQueue> | undefined
    let unregisterFlusher: (() => void) | undefined
    let captureQueued = false
    const capture = () => {
      captureQueued = false
      if (restoring || disposed) return
      const snapshot = captureDockLayout(api.toJSON())
      if (snapshot) persistence?.mark(snapshot)
      else persistence?.invalidate(new Error(latest.current.labels.saveLayoutFailed))
    }
    const notify = () => {
      if (restoring || disposed) return
      const tabs = next.getTabs()
      const visible = api.panels
        .filter((panel) => panel.api.isVisible)
        .flatMap((panel) => panelTab(panel) ?? [])
      const signature = JSON.stringify([tabs, visible.map((tab) => tab.id)])
      if (signature !== lastTabsSignature) {
        lastTabsSignature = signature
        latest.current.onTabsChanged(tabs, visible)
      }
      // Dockview emits remove events before pruning the now-empty group.
      // Capture once the synchronous mutation is complete, never its intermediate tree.
      if (!captureQueued) {
        captureQueued = true
        queueMicrotask(capture)
      }
    }
    const subscriptions = [
      api.onDidActivePanelChange(({ panel }) => {
        if (restoring) return
        const tab = panelTab(panel)
        if (tab && lastActiveId !== tab.id) latest.current.onActivate(tab)
        lastActiveId = tab?.id
        notify()
      }),
      api.onDidLayoutChange(notify),
      api.onDidAddPanel(notify),
      api.onDidRemovePanel(notify),
    ]
    const hydrate = async () => {
      let loaded: Awaited<ReturnType<typeof workspaceLayoutApi.get>> | undefined
      let restored = false
      try {
        loaded = await workspaceLayoutApi.get(props.workspaceKey)
        if (disposed) return
        if (loaded.layout !== null) {
          const saved = validateDockLayout(loaded.layout)
          if (!saved) throw new Error('Invalid workspace layout')
          api.fromJSON(saved)
          restored = true
        }
        setStatus('ready')
      } catch (error) {
        if (disposed) return
        // Defaults remain usable, but cannot overwrite an unread saved layout.
        loaded = undefined
        api.clear()
        setStatus('loadError')
        latest.current.onError?.(
          new Error(latest.current.labels.loadLayoutFailed, { cause: error }),
        )
      }
      if (!restored) {
        props.initialTabs.slice(0, 200).forEach((tab) => next.open(tab, { activate: false }))
        if (props.initialActiveId) next.activate(props.initialActiveId)
        else if (api.panels[0]) next.activate(api.panels[0].id)
      }
      const initial = captureDockLayout(api.toJSON())
      if (loaded) {
        const generation = loaded.session_generation
        persistence = createDockPersistenceQueue({
          initial,
          save: (layout) => workspaceLayoutApi.set(props.workspaceKey, generation, layout),
          onError: (error) => {
            if (disposed) return
            setStatus('saveError')
            latest.current.onError?.(
              new Error(latest.current.labels.saveLayoutFailed, { cause: error }),
            )
          },
          onSaved: () => {
            if (!disposed) setStatus('ready')
          },
        })
        if (!initial) persistence.invalidate(new Error(latest.current.labels.saveLayoutFailed))
        unregisterFlusher = registerEditorPersistenceFlusher(() => {
          capture()
          return persistence?.flush()
        })
      }
      restoring = false
      controllerRef.current = next
      setController(next)
      notify()
      const active = next.getActiveTab()
      lastActiveId = active?.id
      if (active) latest.current.onActivate(active)
      latest.current.onReady?.(next, { restored })
    }
    // Loading, restoring, and fallback are contained here, including unexpected SDK failures.
    void hydrate().catch((error: unknown) => {
      if (!disposed) latest.current.onError?.(error)
    })
    disposeRef.current = () => {
      disposed = true
      unregisterFlusher?.()
      persistence?.dispose()
      subscriptions.forEach((subscription) => subscription.dispose())
      next.dispose()
    }
  }

  return (
    <DockContext.Provider value={{ props, controller }}>
      <div
        className="workbench-dock relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
        data-editor-loading={status === 'loading' ? 'true' : undefined}
      >
        {status !== 'ready' && (
          <div
            role={status === 'loading' ? 'status' : 'alert'}
            className={cn(
              'bg-background px-3 py-2 text-xs text-muted-foreground',
              status === 'loading' ? 'absolute inset-x-0 top-0 z-10' : 'shrink-0 border-b',
            )}
          >
            {
              props.labels[
                status === 'loading'
                  ? 'loadingLayout'
                  : status === 'loadError'
                    ? 'loadLayoutFailed'
                    : 'saveLayoutFailed'
              ]
            }
          </div>
        )}
        <div className="min-h-0 flex-1" aria-busy={status === 'loading'}>
          <DockviewReact
            components={components}
            theme={theme}
            defaultTabComponent={DockTabHeader}
            onReady={onReady}
            defaultRenderer="onlyWhenVisible"
            dndStrategy="pointer"
            disableFloatingGroups
            messages={props.messages}
          />
        </div>
      </div>
    </DockContext.Provider>
  )
}

export const WorkspaceDock = forwardRef<WorkspaceDockHandle, WorkspaceDockProps>((props, ref) => (
  <DockWorkspace key={props.workspaceKey} props={props} forwardedRef={ref} />
))
WorkspaceDock.displayName = 'WorkspaceDock'
export type {
  DockTab,
  DockLabels,
  WorkspaceDockHandle,
  WorkspaceDockProps,
} from '@/features/workbench/dockTypes'
