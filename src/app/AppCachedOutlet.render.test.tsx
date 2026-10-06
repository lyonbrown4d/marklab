import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext } from '@/app/AppLayoutContext'
import { useLayoutContext } from '@/pages/useLayoutContext'

const renderCounts = {
  documentA: vi.fn(),
  documentB: vi.fn(),
  metadata: vi.fn(),
}

const MetadataProbe = () => {
  useLayoutContext((state) => state.files)
  renderCounts.metadata()
  return null
}

const DocumentProbe = ({ path, target }: { path: string; target: 'documentA' | 'documentB' }) => {
  useLayoutContext((state) => `${state.fileContents[path]}:${state.saveStates[path]?.status}`)
  renderCounts[target]()
  return null
}

const ProbeRoute = () => (
  <>
    <MetadataProbe />
    <DocumentProbe path="a.md" target="documentA" />
    <DocumentProbe path="b.md" target="documentB" />
  </>
)

const initialContext = {
  fileContents: { 'a.md': 'A1', 'b.md': 'B1' },
  files: [],
  saveStates: {
    'a.md': { status: 'saved' },
    'b.md': { status: 'saved' },
  },
} as unknown as LayoutContext

const Shell = () => {
  const [context, setContext] = useState(initialContext)
  const updateDocumentA = () => {
    setContext((previous) => ({
      ...previous,
      fileContents: { ...previous.fileContents, 'a.md': 'A2' },
      saveStates: { ...previous.saveStates, 'a.md': { status: 'unsaved' } },
    }))
  }

  return (
    <>
      <button type="button" onClick={updateDocumentA}>
        Edit A
      </button>
      <AppCachedOutlet
        context={context}
        routeCacheKey="documents"
        routePathname="/files/edit/a.md"
        shouldAnimateRouteCache={false}
      />
    </>
  )
}

describe('AppCachedOutlet render isolation', () => {
  it('only rerenders subscribers of the edited document', async () => {
    vi.clearAllMocks()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<ProbeRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(renderCounts.documentA).toHaveBeenCalledTimes(1)
    expect(renderCounts.documentB).toHaveBeenCalledTimes(1)
    expect(renderCounts.metadata).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Edit A' }))

    await waitFor(() => expect(renderCounts.documentA).toHaveBeenCalledTimes(2))
    expect(renderCounts.documentB).toHaveBeenCalledTimes(1)
    expect(renderCounts.metadata).toHaveBeenCalledTimes(1)
  })

  it('keeps delayed edits bound to the document that created the cached route', async () => {
    const editA = vi.fn()
    const editB = vi.fn()
    const delayedEdits = new Map<string, () => void>()

    const CachedEditor = () => {
      const path = useParams()['*'] ?? ''
      const onEditorChange = useLayoutContext((state) => state.onEditorChange)
      delayedEdits.set(path, () => onEditorChange(`delayed:${path}`))
      return (
        <button type="button" onClick={delayedEdits.get(path)}>
          Edit {path}
        </button>
      )
    }
    const RouteShell = () => {
      const location = useLocation()
      const navigate = useNavigate()
      const editingA = location.pathname.endsWith('/a.md')
      const context = {
        ...initialContext,
        onEditorChange: editingA ? editA : editB,
      } as unknown as LayoutContext
      return (
        <>
          <button type="button" onClick={() => navigate('/files/edit/b.md')}>
            Open B
          </button>
          <AppCachedOutlet
            context={context}
            routeCacheKey={`internal::${location.pathname}`}
            routePathname={location.pathname}
            shouldAnimateRouteCache={false}
          />
        </>
      )
    }

    render(
      <MemoryRouter initialEntries={['/files/edit/a.md']}>
        <Routes>
          <Route element={<RouteShell />}>
            <Route path="/files/edit/*" element={<CachedEditor />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open B' }))
    await screen.findByRole('button', { name: 'Edit b.md' })
    act(() => delayedEdits.get('a.md')?.())

    expect(editA).toHaveBeenCalledWith('delayed:a.md')
    expect(editB).not.toHaveBeenCalled()
  })

  it('unmounts lightweight routes after navigating to a cached editor', async () => {
    const unmounts = vi.fn()

    const LifecycleProbe = () => {
      const location = useLocation()
      useEffect(() => () => unmounts(location.pathname), [location.pathname])
      return <div>Route {location.pathname}</div>
    }
    const CacheShell = () => {
      const location = useLocation()
      const navigate = useNavigate()
      return (
        <>
          <button type="button" onClick={() => navigate('/files/edit/a.md')}>
            Open editor
          </button>
          <AppCachedOutlet
            context={initialContext}
            routeCacheKey={`internal::${location.pathname}`}
            routePathname={location.pathname}
            shouldAnimateRouteCache={false}
          />
        </>
      )
    }

    render(
      <MemoryRouter initialEntries={['/workspace/pages']}>
        <Routes>
          <Route element={<CacheShell />}>
            <Route path="*" element={<LifecycleProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open editor' }))

    await waitFor(() => expect(unmounts).toHaveBeenCalledWith('/workspace/pages'))
  })

  it('evicts the oldest real editor node when the cache exceeds its weight budget', async () => {
    const paths = ['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'f.md', 'g.md']
    const unmounts = vi.fn()

    const CachedProbe = () => {
      const path = useParams()['*'] ?? ''
      useEffect(() => () => unmounts(path), [path])
      return <div>Active {path}</div>
    }
    const CacheShell = () => {
      const location = useLocation()
      const navigate = useNavigate()
      const currentPath = location.pathname.split('/').at(-1) ?? paths[0]
      const currentIndex = paths.indexOf(currentPath)
      return (
        <>
          <button type="button" onClick={() => navigate(`/files/edit/${paths[currentIndex + 1]}`)}>
            Next
          </button>
          <AppCachedOutlet
            context={initialContext}
            routeCacheKey={`internal::${location.pathname}`}
            routePathname={location.pathname}
            shouldAnimateRouteCache={false}
          />
        </>
      )
    }

    render(
      <MemoryRouter initialEntries={['/files/edit/a.md']}>
        <Routes>
          <Route element={<CacheShell />}>
            <Route path="/files/edit/*" element={<CachedProbe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    for (const path of paths.slice(1)) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      await screen.findByText(`Active ${path}`)
    }

    await waitFor(() => expect(unmounts).toHaveBeenCalledWith('a.md'))
  })
})
