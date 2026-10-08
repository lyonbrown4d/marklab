import { act, render, waitFor } from '@testing-library/react'
import { createElement, useEffect, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext, LayoutContextStore } from '@/app/AppLayoutContext'
import { ROUTE_CACHE_LIMITS, ROUTE_CACHE_TTL_SECONDS } from '@/app/routeCachePolicy'

const keepAliveProps = vi.hoisted(() => vi.fn())
const keepAliveUnmounts = vi.hoisted(() => vi.fn())
const aliveApi = vi.hoisted(() => ({
  destroy: vi.fn(() => Promise.resolve()),
  getCacheNodes: vi.fn((): Array<{ cacheKey: string; lastActiveTime: number }> => []),
}))

vi.mock('keepalive-for-react', () => ({
  KeepAlive: (props: { children?: ReactNode }) => {
    useEffect(() => () => keepAliveUnmounts(), [])
    keepAliveProps(props)
    return props.children
  },
  useKeepAliveRef: () => ({ current: aliveApi }),
}))

const context = { files: [] } as unknown as LayoutContext
const cacheNodeKey = (pathname: string) => `cache:0:0:internal::${pathname}`

const renderOutlet = (pathname: string) => {
  const cacheKey = pathname
  const Shell = () =>
    createElement(AppCachedOutlet, {
      context,
      routeCacheKey: cacheKey,
      routePathname: pathname,
      shouldAnimateRouteCache: false,
      workspaceKey: 'internal:',
    } as never)

  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="*" element={<div>Route</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return { cacheKey, props: keepAliveProps.mock.calls.at(-1)?.[0] as Record<string, unknown> }
}

describe('AppCachedOutlet cache policy', () => {
  beforeEach(() => {
    aliveApi.destroy.mockReset()
    aliveApi.destroy.mockResolvedValue(undefined)
    aliveApi.getCacheNodes.mockReset()
    aliveApi.getCacheNodes.mockReturnValue([])
    keepAliveProps.mockClear()
    keepAliveUnmounts.mockClear()
  })

  it('bounds editor caches and applies route-specific TTLs', () => {
    const { props } = renderOutlet('/files/edit/note.md')

    expect(props.max).toBe(ROUTE_CACHE_LIMITS.maxEntries)
    expect(props.include).toEqual(expect.any(Array))
    expect(props.maxAliveTime).toEqual([
      expect.objectContaining({ expire: ROUTE_CACHE_TTL_SECONDS.workspaceGraph }),
      expect.objectContaining({ expire: ROUTE_CACHE_TTL_SECONDS.editor }),
    ])
  })

  it('uses a stable allowlist that excludes lightweight routes', () => {
    const { props } = renderOutlet('/workspace/pages')

    const include = props.include as RegExp[]
    expect(include.some((matcher) => matcher.test(props.activeCacheKey as string))).toBe(false)
    expect(include.some((matcher) => matcher.test(cacheNodeKey('/files/edit/note.md')))).toBe(true)
  })

  it('connects the weighted LRU policy to the live cache controller', async () => {
    const paths = [
      '/files/edit/a.md',
      '/files/source/b.md',
      '/files/source/c.md',
      '/workspace/graph',
      '/files/source/d.md',
    ]
    const renderTree = (pathname: string) => (
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            element={
              <AppCachedOutlet
                context={context}
                routeCacheKey={pathname}
                routePathname={pathname}
                shouldAnimateRouteCache={false}
                workspaceKey="internal:"
              />
            }
          >
            <Route index element={<div>Route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    const view = render(renderTree(paths[0]))
    paths.slice(1, -1).forEach((pathname, index) => {
      aliveApi.getCacheNodes.mockReturnValue(
        paths.slice(0, index + 2).map((seenPath, seenIndex) => ({
          cacheKey: cacheNodeKey(seenPath),
          lastActiveTime: Date.now() - (paths.length - seenIndex),
        })),
      )
      view.rerender(renderTree(pathname))
    })
    const now = Date.now()
    aliveApi.getCacheNodes.mockReturnValue(
      paths.map((pathname, index) => ({
        cacheKey: cacheNodeKey(pathname),
        lastActiveTime: now - (paths.length - index),
      })),
    )

    view.rerender(renderTree(paths.at(-1)!))

    await waitFor(() =>
      expect(aliveApi.destroy).toHaveBeenCalledWith([
        cacheNodeKey('/files/edit/a.md'),
        cacheNodeKey('/files/source/b.md'),
      ]),
    )

    view.rerender(renderTree(paths[0]))
    expect(keepAliveProps.mock.calls.at(-1)?.[0].activeCacheKey).toBe(
      'cache:0:1:internal::/files/edit/a.md',
    )
  })

  it('destroys caches owned by the previous workspace when identity changes', async () => {
    const oldCacheKey = 'cache:0:0:external:C:/one:/files/edit/README.md'
    aliveApi.getCacheNodes.mockReturnValue([{ cacheKey: oldCacheKey, lastActiveTime: Date.now() }])
    const renderTree = (workspaceKey: string) => (
      <MemoryRouter initialEntries={['/files/edit/README.md']}>
        <Routes>
          <Route
            element={
              <AppCachedOutlet
                context={context}
                routeCacheKey="/files/edit/README.md"
                routePathname="/files/edit/README.md"
                shouldAnimateRouteCache={false}
                workspaceKey={workspaceKey}
              />
            }
          >
            <Route path="*" element={<div>Route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    const view = render(renderTree('external:C:/one'))

    view.rerender(renderTree('external:D:/two'))

    await waitFor(() => expect(aliveApi.destroy).toHaveBeenCalledWith([oldCacheKey]))
    expect(keepAliveProps.mock.calls.at(-1)?.[0].activeCacheKey).toBe(
      'cache:1:0:external:D:/two:/files/edit/README.md',
    )
  })

  it('remounts the cache owner for every workspace identity transition', async () => {
    const renderTree = (workspaceKey: string) => (
      <MemoryRouter initialEntries={['/files/edit/README.md']}>
        <Routes>
          <Route
            element={
              <AppCachedOutlet
                context={context}
                routeCacheKey="/files/edit/README.md"
                routePathname="/files/edit/README.md"
                shouldAnimateRouteCache={false}
                workspaceKey={workspaceKey}
              />
            }
          >
            <Route path="*" element={<div>Route</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    const view = render(renderTree('external:C:/one'))

    view.rerender(renderTree('external:D:/two'))
    await waitFor(() => expect(keepAliveUnmounts).toHaveBeenCalledTimes(1))

    view.rerender(renderTree('external:C:/one'))
    await waitFor(() => expect(keepAliveUnmounts).toHaveBeenCalledTimes(2))
  })

  it('isolates a reopened workspace from an older delayed destroy', async () => {
    let resolveOldDestroy: (() => void) | undefined
    const oldDestroy = new Promise<void>((resolve) => {
      resolveOldDestroy = resolve
    })
    aliveApi.destroy.mockImplementationOnce(() => oldDestroy)
    const observedStores: LayoutContextStore[] = []
    const StoreProbe = () => {
      observedStores.push(useOutletContext<LayoutContextStore>())
      return <div>Route</div>
    }
    const renderTree = (workspaceKey: string, pathname: string) => (
      <MemoryRouter initialEntries={['/files/edit/README.md']}>
        <Routes>
          <Route
            element={
              <AppCachedOutlet
                context={context}
                routeCacheKey={pathname}
                routePathname={pathname}
                shouldAnimateRouteCache={false}
                workspaceKey={workspaceKey}
              />
            }
          >
            <Route path="*" element={<StoreProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    const workspaceA = 'external:C:/one'
    const workspaceB = 'external:D:/two'
    const readmePath = '/files/edit/README.md'
    const otherPath = '/files/edit/other.md'
    const view = render(renderTree(workspaceA, readmePath))
    const initialAStore = observedStores.at(-1)
    const oldCacheKey = keepAliveProps.mock.calls.at(-1)?.[0].activeCacheKey

    view.rerender(renderTree(workspaceB, readmePath))
    await waitFor(() => expect(aliveApi.destroy).toHaveBeenCalledTimes(1))

    view.rerender(renderTree(workspaceA, readmePath))
    const reopenedAStore = observedStores.at(-1)
    const reopenedCacheKey = keepAliveProps.mock.calls.at(-1)?.[0].activeCacheKey
    view.rerender(renderTree(workspaceA, otherPath))
    await act(async () => {
      resolveOldDestroy?.()
      await oldDestroy
    })
    view.rerender(renderTree(workspaceA, readmePath))

    expect(reopenedCacheKey).not.toBe(oldCacheKey)
    expect(reopenedAStore).not.toBe(initialAStore)
    expect(observedStores.at(-1)).toBe(reopenedAStore)
  })
})
