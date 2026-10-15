import { KeepAlive, useKeepAliveRef } from 'keepalive-for-react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLatest } from 'ahooks'
import { flushSync } from 'react-dom'
import { useOutlet } from 'react-router-dom'
import {
  createLayoutContextStore,
  type LayoutContext,
  type LayoutContextStore,
} from '@/app/AppLayoutContext'
import {
  estimateEditorTextBytes,
  getRouteCacheEvictionKeys,
  getNextRouteCacheExpiryDelay,
  getRouteCachePolicy,
} from '@/app/routeCachePolicy'
import { cn } from '@/lib/utils'

type AppCachedOutletProps = {
  context: LayoutContext
  routeCacheKey: string
  routePathname: string
  shouldAnimateRouteCache: boolean
  workspaceKey: string
}

const ROUTE_CACHE_INCLUDES = [/:\/workspace\/graph$/, /:\/files\/(?:edit|source|graph)\/.+$/]

const EMPTY_CACHED_VALUES = {}
const pickCachedDocumentState = <T,>(
  previous: Record<string, T> | undefined,
  current: Record<string, T> | undefined,
  path: string | null,
) => {
  const value = path ? current?.[path] : undefined
  if (!path || value === undefined) return EMPTY_CACHED_VALUES
  if (previous && Object.keys(previous).length === 1 && previous[path] === value) return previous
  return { [path]: value }
}
const ROUTE_CACHE_EVICTION_GRACE_MS = 80
const ActiveWorkspaceContext = createContext<string | null>(null)
export const ActiveWorkspaceProvider = ActiveWorkspaceContext.Provider
export const useActiveWorkspaceKey = () => useContext(ActiveWorkspaceContext)
const toLogicalCacheKey = (workspaceSession: number, workspaceKey: string, routeCacheKey: string) =>
  JSON.stringify([workspaceSession, workspaceKey, routeCacheKey])
const toCacheNodeKey = (
  workspaceSession: number,
  workspaceKey: string,
  routeCacheKey: string,
  epoch: number,
) => `cache:${workspaceSession}:${epoch}:${workspaceKey}:${routeCacheKey}`

export const AppCachedOutlet = ({
  context,
  routeCacheKey,
  routePathname,
  shouldAnimateRouteCache,
  workspaceKey,
}: AppCachedOutletProps) => {
  const aliveRef = useKeepAliveRef()
  const latestContext = useLatest(context)
  const [contextStores] = useState(() => new Map<string, LayoutContextStore>())
  const cachePathnamesRef = useRef(new Map<string, string>())
  const cacheRouteKeysRef = useRef(new Map<string, string>())
  const cacheWorkspaceKeysRef = useRef(new Map<string, string>())
  const cacheWorkspaceSessionsRef = useRef(new Map<string, number>())
  const [cacheEpochs, setCacheEpochs] = useState(() => new Map<string, number>())
  const [workspaceSessionState, setWorkspaceSessionState] = useState(() => ({
    generation: 0,
    workspaceKey,
  }))
  let resolvedWorkspaceSession = workspaceSessionState
  if (workspaceSessionState.workspaceKey !== workspaceKey) {
    // Advance before commit so KeepAlive never sees a reopened workspace under an old identity.
    resolvedWorkspaceSession = {
      generation: workspaceSessionState.generation + 1,
      workspaceKey,
    }
    setWorkspaceSessionState(resolvedWorkspaceSession)
  }
  const workspaceSession = resolvedWorkspaceSession.generation
  const logicalCacheKey = toLogicalCacheKey(workspaceSession, workspaceKey, routeCacheKey)
  const cacheEpoch = cacheEpochs.get(logicalCacheKey) ?? 0
  const activeCacheKey = toCacheNodeKey(workspaceSession, workspaceKey, routeCacheKey, cacheEpoch)
  const previousRouteRef = useRef({ cacheKey: activeCacheKey, pathname: routePathname })
  const previousWorkspaceKeyRef = useRef(workspaceKey)
  const activeCacheKeyRef = useRef(activeCacheKey)
  const evictionTimerRef = useRef<number | null>(null)
  const contextStore = useMemo(
    () => contextStores.get(activeCacheKey) ?? createLayoutContextStore(context),
    [activeCacheKey, context, contextStores],
  )

  useLayoutEffect(() => {
    activeCacheKeyRef.current = activeCacheKey
    contextStores.set(activeCacheKey, contextStore)
    cachePathnamesRef.current.set(activeCacheKey, routePathname)
    cacheRouteKeysRef.current.set(activeCacheKey, routeCacheKey)
    cacheWorkspaceKeysRef.current.set(activeCacheKey, workspaceKey)
    cacheWorkspaceSessionsRef.current.set(activeCacheKey, workspaceSession)
    contextStore.setState(context, true)
    // Inactive stores keep their document callback and view state, but must not pin
    // snapshots of every other document that was loaded while they were active.
    contextStores.forEach((store, key) => {
      if (key === activeCacheKey) return
      const previous = store.getState()
      const path = previous.editorBufferPath
      const contentSource =
        path && context.fileContents?.[path] !== undefined
          ? context.fileContents
          : previous.fileContents
      const fileContents = pickCachedDocumentState(previous.fileContents, contentSource, path)
      const saveStates = pickCachedDocumentState(previous.saveStates, context.saveStates, path)
      const loadingPaths = pickCachedDocumentState(
        previous.loadingPaths,
        context.loadingPaths,
        path,
      )
      if (
        fileContents === previous.fileContents &&
        saveStates === previous.saveStates &&
        loadingPaths === previous.loadingPaths
      )
        return
      store.setState({ fileContents, saveStates, loadingPaths })
    })
  }, [
    activeCacheKey,
    context,
    contextStore,
    contextStores,
    routeCacheKey,
    routePathname,
    workspaceKey,
    workspaceSession,
  ])
  useLayoutEffect(() => {
    if (previousWorkspaceKeyRef.current === workspaceKey) return
    previousWorkspaceKeyRef.current = workspaceKey
    const staleKeys = [...cacheWorkspaceKeysRef.current.entries()].flatMap(([key, owner]) =>
      owner === workspaceKey ? [] : [key],
    )
    setCacheEpochs((current) => {
      const currentEpoch = current.get(logicalCacheKey)
      if (currentEpoch === undefined) return current.size === 0 ? current : new Map()
      if (current.size === 1) return current
      return new Map([[logicalCacheKey, currentEpoch]])
    })
    if (staleKeys.length === 0) return
    void aliveRef.current?.destroy(staleKeys).then(() => {
      staleKeys.forEach((key) => {
        if (key === activeCacheKeyRef.current) return
        cachePathnamesRef.current.delete(key)
        cacheRouteKeysRef.current.delete(key)
        cacheWorkspaceKeysRef.current.delete(key)
        cacheWorkspaceSessionsRef.current.delete(key)
        contextStores.delete(key)
      })
    })
  }, [aliveRef, contextStores, logicalCacheKey, workspaceKey])
  useEffect(() => {
    if (evictionTimerRef.current !== null) {
      window.clearTimeout(evictionTimerRef.current)
      evictionTimerRef.current = null
    }
    const previousRoute = previousRouteRef.current
    if (
      previousRoute.cacheKey !== activeCacheKey &&
      !getRouteCachePolicy(previousRoute.pathname).cacheable
    ) {
      cachePathnamesRef.current.delete(previousRoute.cacheKey)
      cacheRouteKeysRef.current.delete(previousRoute.cacheKey)
      cacheWorkspaceKeysRef.current.delete(previousRoute.cacheKey)
      cacheWorkspaceSessionsRef.current.delete(previousRoute.cacheKey)
      contextStores.delete(previousRoute.cacheKey)
    }
    previousRouteRef.current = { cacheKey: activeCacheKey, pathname: routePathname }

    const enforceCachePolicy = () => {
      evictionTimerRef.current = null
      const currentContext = latestContext.current
      const cacheNodes = aliveRef.current?.getCacheNodes() ?? []
      const liveKeys = new Set(cacheNodes.map((node) => node.cacheKey))
      liveKeys.add(activeCacheKeyRef.current)
      contextStores.forEach((_, key) => {
        if (liveKeys.has(key)) return
        contextStores.delete(key)
        cachePathnamesRef.current.delete(key)
        cacheRouteKeysRef.current.delete(key)
        cacheWorkspaceKeysRef.current.delete(key)
        cacheWorkspaceSessionsRef.current.delete(key)
      })
      const entries = cacheNodes.flatMap((node) => {
        const pathname = cachePathnamesRef.current.get(node.cacheKey)
        if (!pathname) return []
        const snapshot = contextStores.get(node.cacheKey)?.getState()
        const path = snapshot?.editorBufferPath
        const content = path ? currentContext.fileContents?.[path] : undefined
        const saveState = path ? currentContext.saveStates?.[path] : undefined
        return [
          {
            cacheKey: node.cacheKey,
            pathname,
            lastActiveAtMs: node.lastActiveTime,
            textBytes: content === undefined ? 0 : estimateEditorTextBytes(content),
            protected: Boolean(
              path &&
              (currentContext.loadingPaths?.[path] || (saveState && saveState.status !== 'saved')),
            ),
            bufferMissing: Boolean(path && currentContext.fileContents && content === undefined),
          },
        ]
      })
      const evictionKeys = getRouteCacheEvictionKeys(entries, {
        activeCacheKey: activeCacheKeyRef.current,
        nowMs: Date.now(),
      })
      const inactiveKeys = evictionKeys.filter((key) => key !== activeCacheKeyRef.current)
      const nextExpiryDelay = getNextRouteCacheExpiryDelay(
        entries.filter((entry) => !inactiveKeys.includes(entry.cacheKey)),
        { activeCacheKey: activeCacheKeyRef.current, nowMs: Date.now() },
      )
      if (nextExpiryDelay !== null) {
        evictionTimerRef.current = window.setTimeout(
          enforceCachePolicy,
          Math.max(ROUTE_CACHE_EVICTION_GRACE_MS, nextExpiryDelay),
        )
      }
      if (inactiveKeys.length === 0) return
      flushSync(() => {
        setCacheEpochs((current) => {
          const next = new Map(current)
          let changed = false
          inactiveKeys.forEach((key) => {
            const logicalKey = cacheRouteKeysRef.current.get(key)
            const owner = cacheWorkspaceKeysRef.current.get(key)
            const ownerSession = cacheWorkspaceSessionsRef.current.get(key)
            if (!logicalKey || !owner || ownerSession === undefined) return
            const epochKey = toLogicalCacheKey(ownerSession, owner, logicalKey)
            const currentEpoch = next.get(epochKey) ?? 0
            if (key !== toCacheNodeKey(ownerSession, owner, logicalKey, currentEpoch)) return
            next.set(epochKey, currentEpoch + 1)
            changed = true
          })
          return changed ? next : current
        })
      })
      const scheduledStores = new Map(
        inactiveKeys.map((key) => [key, contextStores.get(key)] as const),
      )
      void aliveRef.current?.destroy(inactiveKeys).then(() => {
        inactiveKeys.forEach((key) => {
          if (key === activeCacheKeyRef.current) return
          if (contextStores.get(key) !== scheduledStores.get(key)) return
          cachePathnamesRef.current.delete(key)
          cacheRouteKeysRef.current.delete(key)
          cacheWorkspaceKeysRef.current.delete(key)
          cacheWorkspaceSessionsRef.current.delete(key)
          contextStores.delete(key)
        })
      })
    }
    evictionTimerRef.current = window.setTimeout(enforceCachePolicy, ROUTE_CACHE_EVICTION_GRACE_MS)
    return () => {
      if (evictionTimerRef.current === null) return
      window.clearTimeout(evictionTimerRef.current)
      evictionTimerRef.current = null
    }
  }, [
    activeCacheKey,
    aliveRef,
    contextStores,
    latestContext,
    routePathname,
    context.fileContents,
    context.loadingPaths,
    context.saveStates,
  ])
  const outlet = useOutlet(contextStore)

  return (
    <ActiveWorkspaceProvider key={workspaceSession} value={workspaceKey}>
      <KeepAlive
        activeCacheKey={activeCacheKey}
        // KeepAlive recreates its portal target when this class changes.
        cacheNodeClassName="h-full route-cache-node"
        containerClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view-stack')}
        include={ROUTE_CACHE_INCLUDES}
        // Our controller owns limits so the library cannot evict dirty editors.
        max={Number.POSITIVE_INFINITY}
        aliveRef={aliveRef}
      >
        {outlet}
      </KeepAlive>
    </ActiveWorkspaceProvider>
  )
}
