import {
  FILE_ROUTE_PATTERN,
  GRAPH_WORKSPACE_ROUTE_PATTERN,
  SOURCE_ROUTE_PATTERN,
} from '@/logic/routing'

export const ROUTE_CACHE_LIMITS = {
  maxEntries: 6,
  weightBudget: 12,
} as const

export const ROUTE_CACHE_TTL_SECONDS = {
  editor: 600,
  workspaceGraph: 300,
} as const

export type CacheableRouteKind = 'edit' | 'source' | 'workspace-graph'

export type RouteCachePolicy =
  | Readonly<{
      cacheable: true
      kind: CacheableRouteKind
      ttlSeconds: number
      weight: number
    }>
  | Readonly<{ cacheable: false }>

export type RouteCacheEntry = Readonly<{
  cacheKey: string
  pathname: string
  lastActiveAtMs: number
}>

export type RouteCacheEvictionOptions = Readonly<{
  activeCacheKey: string
  nowMs: number
}>

const NON_CACHEABLE_POLICY = { cacheable: false } as const

const CACHEABLE_POLICIES = {
  edit: {
    cacheable: true,
    kind: 'edit',
    ttlSeconds: ROUTE_CACHE_TTL_SECONDS.editor,
    weight: 2,
  },
  source: {
    cacheable: true,
    kind: 'source',
    ttlSeconds: ROUTE_CACHE_TTL_SECONDS.editor,
    weight: 3,
  },
  workspaceGraph: {
    cacheable: true,
    kind: 'workspace-graph',
    ttlSeconds: ROUTE_CACHE_TTL_SECONDS.workspaceGraph,
    weight: 4,
  },
} as const satisfies Record<string, RouteCachePolicy>

const matchesWildcardRoute = (pathname: string, pattern: string) => {
  const wildcardIndex = pattern.indexOf('*')
  if (wildcardIndex < 0) return false
  const prefix = pattern.slice(0, wildcardIndex)
  return pathname.startsWith(prefix) && pathname.length > prefix.length
}

export const getRouteCachePolicy = (pathname: string): RouteCachePolicy => {
  if (matchesWildcardRoute(pathname, FILE_ROUTE_PATTERN)) return CACHEABLE_POLICIES.edit
  if (matchesWildcardRoute(pathname, SOURCE_ROUTE_PATTERN)) return CACHEABLE_POLICIES.source
  if (pathname === GRAPH_WORKSPACE_ROUTE_PATTERN) return CACHEABLE_POLICIES.workspaceGraph
  return NON_CACHEABLE_POLICY
}

type ClassifiedEntry = Readonly<{
  entry: RouteCacheEntry
  policy: RouteCachePolicy
}>

const compareLeastRecentlyUsed = (left: ClassifiedEntry, right: ClassifiedEntry) => {
  const timeDifference = left.entry.lastActiveAtMs - right.entry.lastActiveAtMs
  if (timeDifference !== 0) return timeDifference
  if (left.entry.cacheKey < right.entry.cacheKey) return -1
  if (left.entry.cacheKey > right.entry.cacheKey) return 1
  return 0
}

const isExpired = (candidate: ClassifiedEntry, nowMs: number) => {
  if (!candidate.policy.cacheable) return false
  const ttlMs = candidate.policy.ttlSeconds * 1_000
  return nowMs - candidate.entry.lastActiveAtMs >= ttlMs
}

export const getRouteCacheEvictionKeys = (
  entries: readonly RouteCacheEntry[],
  options: RouteCacheEvictionOptions,
): string[] => {
  const candidates = entries
    .map((entry): ClassifiedEntry => ({ entry, policy: getRouteCachePolicy(entry.pathname) }))
    .sort(compareLeastRecentlyUsed)
  const evictedKeys: string[] = []
  const retained: ClassifiedEntry[] = []

  for (const candidate of candidates) {
    const isActive = candidate.entry.cacheKey === options.activeCacheKey
    if (!isActive && (!candidate.policy.cacheable || isExpired(candidate, options.nowMs))) {
      evictedKeys.push(candidate.entry.cacheKey)
      continue
    }
    if (candidate.policy.cacheable) retained.push(candidate)
  }

  let retainedCount = retained.length
  let retainedWeight = retained.reduce(
    (total, candidate) => total + (candidate.policy.cacheable ? candidate.policy.weight : 0),
    0,
  )

  for (const candidate of retained) {
    if (
      retainedCount <= ROUTE_CACHE_LIMITS.maxEntries &&
      retainedWeight <= ROUTE_CACHE_LIMITS.weightBudget
    ) {
      break
    }
    if (candidate.entry.cacheKey === options.activeCacheKey || !candidate.policy.cacheable) continue
    evictedKeys.push(candidate.entry.cacheKey)
    retainedCount -= 1
    retainedWeight -= candidate.policy.weight
  }

  return evictedKeys
}
