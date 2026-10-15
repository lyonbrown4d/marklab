import { act, render, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useOutletContext } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext, LayoutContextStore } from '@/app/AppLayoutContext'
import { ROUTE_CACHE_LIMITS } from '@/app/routeCachePolicy'

const api = vi.hoisted(() => ({
  destroy: vi.fn(async () => undefined),
  getCacheNodes: vi.fn((): { cacheKey: string; lastActiveTime: number }[] => []),
}))
vi.mock('keepalive-for-react', () => ({
  KeepAlive: ({ children }: { children?: ReactNode }) => children,
  useKeepAliveRef: () => ({ current: api }),
}))
const nodeKey = (path: string) => `cache:0:0:internal::/files/edit/${path}`
const contexts = new Map<string, LayoutContextStore>()
const StoreProbe = () => {
  const store = useOutletContext<LayoutContextStore>()
  contexts.set(store.getState().editorBufferPath!, store)
  return <div>Route</div>
}
const contextFor = (
  path: string,
  fileContents = { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' } as Record<string, string>,
): LayoutContext =>
  ({
    editorBufferPath: path,
    editorValue: fileContents[path],
    fileContents,
    files: [],
    saveStates: { 'a.md': { status: 'saved' }, 'b.md': { status: 'saved' } },
    loadingPaths: {},
    onEditorChange: vi.fn(),
  }) as unknown as LayoutContext
const tree = (context: LayoutContext) => (
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route
        element={
          <AppCachedOutlet
            context={context}
            routeCacheKey={`/files/edit/${context.editorBufferPath}`}
            routePathname={`/files/edit/${context.editorBufferPath}`}
            shouldAnimateRouteCache={false}
            workspaceKey="internal:"
          />
        }
      >
        <Route index element={<StoreProbe />} />
      </Route>
    </Routes>
  </MemoryRouter>
)
const prepareTwoNodes = (oldLastActive = Date.now()) =>
  api.getCacheNodes.mockReturnValue([
    { cacheKey: nodeKey('a.md'), lastActiveTime: oldLastActive },
    { cacheKey: nodeKey('b.md'), lastActiveTime: Date.now() },
  ])

beforeEach(() => {
  contexts.clear()
  vi.clearAllMocks()
  api.getCacheNodes.mockReturnValue([])
})

afterEach(() => vi.useRealTimers())

describe('retained editor resource ownership', () => {
  it('prunes unrelated text snapshots while preserving the recent document store and its callback', async () => {
    const first = contextFor('a.md')
    const view = render(tree(first))
    const store = contexts.get('a.md')!
    prepareTwoNodes()
    view.rerender(tree(contextFor('b.md')))
    await waitFor(() => expect(api.getCacheNodes).toHaveBeenCalled())
    expect(store.getState().fileContents).toEqual({ 'a.md': 'A' })
    expect(store.getState().onEditorChange).toBe(first.onEditorChange)
    expect(api.destroy).not.toHaveBeenCalled()
    view.rerender(tree(first))
    expect(contexts.get('a.md')).toBe(store)
  })

  it('evicts a large clean editor using actual loaded document bytes', async () => {
    const contents = { 'a.md': 'x'.repeat(ROUTE_CACHE_LIMITS.maxTextBytes / 2), 'b.md': 'B' }
    const view = render(tree(contextFor('a.md', contents)))
    prepareTwoNodes()
    view.rerender(tree(contextFor('b.md', contents)))
    await waitFor(() => expect(api.destroy).toHaveBeenCalledWith([nodeKey('a.md')]))
  })

  it.each(['saving', 'error'] as const)(
    'preserves an inactive %s editor beyond both TTL and byte limits',
    async (status) => {
      const contents = { 'a.md': 'x'.repeat(ROUTE_CACHE_LIMITS.maxTextBytes / 2), 'b.md': 'B' }
      const first = contextFor('a.md', contents)
      first.saveStates['a.md'] = { status }
      const view = render(tree(first))
      prepareTwoNodes(0)
      const second = contextFor('b.md', contents)
      second.saveStates['a.md'] = { status }
      view.rerender(tree(second))
      await waitFor(() => expect(api.getCacheNodes).toHaveBeenCalled())
      expect(api.destroy).not.toHaveBeenCalled()
      expect(contexts.get('a.md')!.getState().fileContents['a.md']).toBe(contents['a.md'])
    },
  )

  it('destroys a closed clean route when the buffer owner releases its document', async () => {
    const view = render(tree(contextFor('a.md')))
    prepareTwoNodes()
    view.rerender(tree(contextFor('b.md', { 'b.md': 'B' })))
    await waitFor(() => expect(api.destroy).toHaveBeenCalledWith([nodeKey('a.md')]))
  })
  it('expires an idle clean editor with one next-expiry wakeup without navigation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const view = render(tree(contextFor('a.md')))
    prepareTwoNodes()
    view.rerender(tree(contextFor('b.md')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(80)
    })
    expect(api.destroy).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000)
    })
    expect(api.destroy).toHaveBeenCalledWith([nodeKey('a.md')])
    view.unmount()
  })
})
