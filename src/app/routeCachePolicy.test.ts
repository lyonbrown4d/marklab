import { describe, expect, it } from 'vitest'
import {
  ROUTE_CACHE_LIMITS,
  ROUTE_CACHE_TTL_SECONDS,
  getRouteCacheEvictionKeys,
  getRouteCachePolicy,
  type RouteCacheEntry,
} from '@/app/routeCachePolicy'

const entry = (cacheKey: string, pathname: string, lastActiveAtMs: number): RouteCacheEntry => ({
  cacheKey,
  pathname,
  lastActiveAtMs,
})

describe('route cache policy', () => {
  it.each([
    ['/files/edit/notes/readme.md', 'edit', 2, 600],
    ['/files/source/notes/readme.md', 'source', 3, 600],
    ['/workspace/graph', 'workspace-graph', 4, 300],
  ] as const)('classifies %s as a cacheable heavy route', (pathname, kind, weight, ttlSeconds) => {
    expect(getRouteCachePolicy(pathname)).toEqual({
      cacheable: true,
      kind,
      ttlSeconds,
      weight,
    })
  })

  it.each([
    '/',
    '/workspace/pages',
    '/_diff/staged/notes/readme.md',
    '/files/preview/diagram.pdf',
    '/files/edit/',
    '/files/source',
    '/files/graph',
    '/files/graph/notes/readme.md',
    '/workspace/graph/extra',
    '/missing',
  ])('does not cache %s', (pathname) => {
    expect(getRouteCachePolicy(pathname)).toEqual({ cacheable: false })
  })

  it('publishes the bounded heavy-cache limits and TTLs used by the controller', () => {
    expect(ROUTE_CACHE_LIMITS).toEqual({
      maxEntries: 6,
      weightBudget: 12,
      maxTextBytes: 16 * 1024 * 1024,
    })
    expect(ROUTE_CACHE_TTL_SECONDS).toEqual({ editor: 600, workspaceGraph: 300 })
  })
})

describe('getRouteCacheEvictionKeys', () => {
  it('evicts inactive entries when their route-specific TTL is reached', () => {
    const nowMs = 700_000
    const entries = [
      entry('active-edit', '/files/edit/active.md', 0),
      entry('expired-edit', '/files/edit/old.md', 100_000),
      entry('fresh-source', '/files/source/fresh.md', 100_001),
      entry('expired-workspace-graph', '/workspace/graph', 400_000),
    ]

    expect(getRouteCacheEvictionKeys(entries, { activeCacheKey: 'active-edit', nowMs })).toEqual([
      'expired-edit',
      'expired-workspace-graph',
    ])
  })

  it('evicts non-cacheable entries that predate the allow-list', () => {
    const entries = [
      entry('pages', '/workspace/pages', 20),
      entry('preview', '/files/preview/image.png', 10),
      entry('edit', '/files/edit/kept.md', 0),
    ]

    expect(getRouteCacheEvictionKeys(entries, { activeCacheKey: 'edit', nowMs: 100 })).toEqual([
      'preview',
      'pages',
    ])
  })

  it('evicts least-recent inactive entries until the weight budget is satisfied', () => {
    const entries = [
      entry('active-graph', '/workspace/graph', 500),
      entry('old-source', '/files/source/old.md', 100),
      entry('middle-source', '/files/source/middle.md', 200),
      entry('new-edit', '/files/edit/new.md', 300),
      entry('newest-edit', '/files/edit/newest.md', 400),
    ]

    expect(
      getRouteCacheEvictionKeys(entries, { activeCacheKey: 'active-graph', nowMs: 1_000 }),
    ).toEqual(['old-source'])
  })

  it('uses cache keys to break LRU ties independently of input order', () => {
    const entries = [
      entry('active-source', '/files/source/active.md', 500),
      entry('z-old-edit', '/files/edit/z.md', 100),
      entry('a-old-edit', '/files/edit/a.md', 100),
      entry('middle-edit', '/files/edit/middle.md', 200),
      entry('new-edit', '/files/edit/new.md', 300),
      entry('newest-edit', '/files/edit/newest.md', 400),
    ]
    const options = { activeCacheKey: 'active-source', nowMs: 1_000 }

    expect(getRouteCacheEvictionKeys(entries, options)).toEqual(['a-old-edit'])
    expect(getRouteCacheEvictionKeys([...entries].reverse(), options)).toEqual(['a-old-edit'])
  })

  it('never evicts the active entry even when it is the oldest entry', () => {
    const entries = [
      entry('active-workspace-graph', '/workspace/graph', 0),
      entry('old-edit', '/files/edit/old.md', 100),
      entry('middle-source', '/files/source/middle.md', 200),
      entry('new-edit', '/files/edit/new.md', 300),
      entry('newest-edit', '/files/edit/newest.md', 400),
    ]

    expect(
      getRouteCacheEvictionKeys(entries, {
        activeCacheKey: 'active-workspace-graph',
        nowMs: 500,
      }),
    ).toEqual(['old-edit'])
  })
  it('uses document bytes as an additional budget even with only two editor routes', () => {
    const entries = [
      {
        ...entry('old', '/files/source/large.md', 100),
        textBytes: ROUTE_CACHE_LIMITS.maxTextBytes,
      },
      { ...entry('active', '/files/edit/current.md', 200), textBytes: 10 },
    ]
    expect(getRouteCacheEvictionKeys(entries, { activeCacheKey: 'active', nowMs: 300 })).toEqual([
      'old',
    ])
  })

  it('protects dirty and loading editor routes from TTL and size pressure', () => {
    const entries = [
      {
        ...entry('dirty', '/files/edit/draft.md', 0),
        protected: true,
        textBytes: ROUTE_CACHE_LIMITS.maxTextBytes * 2,
      },
      { ...entry('active', '/files/source/current.md', 1), textBytes: 10 },
      entry('clean', '/files/edit/clean.md', 699_999),
    ]
    expect(
      getRouteCacheEvictionKeys(entries, { activeCacheKey: 'active', nowMs: 700_000 }),
    ).toEqual(['clean'])
  })

  it('destroys an inactive route after its saved buffer has been released, keeping a recent hot editor', () => {
    const entries = [
      { ...entry('closed', '/files/edit/closed.md', 100), bufferMissing: true },
      entry('recent', '/files/source/recent.md', 200),
      entry('active', '/files/edit/current.md', 300),
    ]
    expect(getRouteCacheEvictionKeys(entries, { activeCacheKey: 'active', nowMs: 400 })).toEqual([
      'closed',
    ])
  })
})
