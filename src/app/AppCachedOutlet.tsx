import { KeepAlive, useKeepAliveRef } from 'keepalive-for-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useOutlet } from 'react-router-dom'
import {
  createLayoutContextStore,
  type LayoutContext,
  type LayoutContextStore,
} from '@/app/AppLayoutContext'
import {
  ROUTE_CACHE_LIMITS,
  ROUTE_CACHE_TTL_SECONDS,
  getRouteCacheEvictionKeys,
  getRouteCachePolicy,
} from '@/app/routeCachePolicy'
import { cn } from '@/lib/utils'

type AppCachedOutletProps = {
  context: LayoutContext
  routeCacheKey: string
  routePathname: string
  shouldAnimateRouteCache: boolean
}

const ROUTE_CACHE_INCLUDES = [/:\/workspace\/graph$/, /:\/files\/(?:edit|source|graph)\/.+$/]

const ROUTE_CACHE_TTLS = [
  { match: /:\/workspace\/graph$/, expire: ROUTE_CACHE_TTL_SECONDS.workspaceGraph },
  { match: /:\/files\/(?:edit|source|graph)\/.+$/, expire: ROUTE_CACHE_TTL_SECONDS.editor },
]
const ROUTE_CACHE_EVICTION_GRACE_MS = 80
const toCacheNodeKey = (routeCacheKey: string, epoch: number) => `cache:${epoch}:${routeCacheKey}`

export const AppCachedOutlet = ({
  context,
  routeCacheKey,
  routePathname,
  shouldAnimateRouteCache,
}: AppCachedOutletProps) => {
  const aliveRef = useKeepAliveRef()
  const [contextStores] = useState(() => new Map<string, LayoutContextStore>())
  const cachePathnamesRef = useRef(new Map<string, string>())
  const cacheRouteKeysRef = useRef(new Map<string, string>())
  const [cacheEpochs, setCacheEpochs] = useState(() => new Map<string, number>())
  const cacheEpoch = cacheEpochs.get(routeCacheKey) ?? 0
  const activeCacheKey = toCacheNodeKey(routeCacheKey, cacheEpoch)
  const previousRouteRef = useRef({ cacheKey: activeCacheKey, pathname: routePathname })
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
    contextStore.setState(context, true)
  }, [activeCacheKey, context, contextStore, contextStores, routeCacheKey, routePathname])
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
      contextStores.delete(previousRoute.cacheKey)
    }
    previousRouteRef.current = { cacheKey: activeCacheKey, pathname: routePathname }

    evictionTimerRef.current = window.setTimeout(() => {
      evictionTimerRef.current = null
      const cacheNodes = aliveRef.current?.getCacheNodes() ?? []
      const liveKeys = new Set(cacheNodes.map((node) => node.cacheKey))
      liveKeys.add(activeCacheKeyRef.current)
      contextStores.forEach((_, key) => {
        if (liveKeys.has(key)) return
        contextStores.delete(key)
        cachePathnamesRef.current.delete(key)
        cacheRouteKeysRef.current.delete(key)
      })
      const entries = cacheNodes.flatMap((node) => {
        const pathname = cachePathnamesRef.current.get(node.cacheKey)
        return pathname
          ? [{ cacheKey: node.cacheKey, pathname, lastActiveAtMs: node.lastActiveTime }]
          : []
      })
      const evictionKeys = getRouteCacheEvictionKeys(entries, {
        activeCacheKey: activeCacheKeyRef.current,
        nowMs: Date.now(),
      })
      const inactiveKeys = evictionKeys.filter((key) => key !== activeCacheKeyRef.current)
      if (inactiveKeys.length === 0) return
      flushSync(() => {
        setCacheEpochs((current) => {
          const next = new Map(current)
          let changed = false
          inactiveKeys.forEach((key) => {
            const logicalKey = cacheRouteKeysRef.current.get(key)
            if (!logicalKey) return
            const currentEpoch = next.get(logicalKey) ?? 0
            if (key !== toCacheNodeKey(logicalKey, currentEpoch)) return
            next.set(logicalKey, currentEpoch + 1)
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
          contextStores.delete(key)
        })
      })
    }, ROUTE_CACHE_EVICTION_GRACE_MS)
    return () => {
      if (evictionTimerRef.current === null) return
      window.clearTimeout(evictionTimerRef.current)
      evictionTimerRef.current = null
    }
  }, [activeCacheKey, aliveRef, contextStores, routePathname])
  const outlet = useOutlet(contextStore)

  return (
    <KeepAlive
      activeCacheKey={activeCacheKey}
      cacheNodeClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view')}
      containerClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view-stack')}
      include={ROUTE_CACHE_INCLUDES}
      max={ROUTE_CACHE_LIMITS.maxEntries}
      maxAliveTime={ROUTE_CACHE_TTLS}
      aliveRef={aliveRef}
    >
      {outlet}
    </KeepAlive>
  )
}
