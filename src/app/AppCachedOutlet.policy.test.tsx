import { render, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext } from '@/app/AppLayoutContext'
import { ROUTE_CACHE_LIMITS, ROUTE_CACHE_TTL_SECONDS } from '@/app/routeCachePolicy'

const keepAliveProps = vi.hoisted(() => vi.fn())
const aliveApi = vi.hoisted(() => ({
  destroy: vi.fn(() => Promise.resolve()),
  getCacheNodes: vi.fn((): Array<{ cacheKey: string; lastActiveTime: number }> => []),
}))

vi.mock('keepalive-for-react', () => ({
  KeepAlive: (props: { children?: ReactNode }) => {
    keepAliveProps(props)
    return props.children
  },
  useKeepAliveRef: () => ({ current: aliveApi }),
}))

const context = { files: [] } as unknown as LayoutContext
const cacheNodeKey = (pathname: string) => `cache:0:internal::${pathname}`

const renderOutlet = (pathname: string) => {
  const cacheKey = `internal::${pathname}`
  const Shell = () =>
    createElement(AppCachedOutlet, {
      context,
      routeCacheKey: cacheKey,
      routePathname: pathname,
      shouldAnimateRouteCache: false,
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
    aliveApi.destroy.mockClear()
    aliveApi.getCacheNodes.mockReset()
    aliveApi.getCacheNodes.mockReturnValue([])
    keepAliveProps.mockClear()
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
                routeCacheKey={`internal::${pathname}`}
                routePathname={pathname}
                shouldAnimateRouteCache={false}
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
      'cache:1:internal::/files/edit/a.md',
    )
  })
})
