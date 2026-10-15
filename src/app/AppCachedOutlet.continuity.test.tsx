import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext } from '@/app/AppLayoutContext'
import { useEditorRoutes } from '@/app/useEditorRoutes'
import { useLayoutContext } from '@/pages/useLayoutContext'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => false }))
const unmounts = vi.fn()
const files = [
  { kind: 'file', path: 'a.md' },
  { kind: 'file', path: 'b.md' },
] as const
const fileContents = { 'a.md': 'A', 'b.md': 'B' }
const SourceProbe = () => {
  const path = useParams()['*']!
  const content = useLayoutContext((state) => state.fileContents[path])
  const [history, setHistory] = useState('initial history')
  useEffect(() => () => unmounts(path), [path])
  return (
    <div>
      <div>
        {path}:{content ?? 'missing'}
      </div>
      <button type="button" onClick={() => setHistory('retained undo')}>
        {path}:{history}
      </button>
    </div>
  )
}
const Shell = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabPath, setTabPath] = useState('a.md')
  const routes = useEditorRoutes({
    entries: [...files],
    activeTab: { kind: 'file', path: tabPath, view: 'source' },
    rootKind: 'internal',
    rootPath: '',
    tabViewModes: {},
    treeGeneration: 0,
    treeRevision: 0,
  })
  const context = {
    editorBufferPath: routes.currentFilePath,
    activePath: routes.currentFilePath,
    fileContents,
    saveStates: {},
    loadingPaths: {},
    files,
  } as unknown as LayoutContext
  return (
    <>
      <div data-testid="buffer-path">{routes.currentFilePath}</div>
      <button type="button" onClick={() => setTabPath('b.md')}>
        Select B before navigation
      </button>
      <button type="button" onClick={() => navigate('/files/edit/b.md')}>
        Open rich B
      </button>
      <button type="button" onClick={() => navigate('/files/source/b.md')}>
        Open source B
      </button>
      <button
        type="button"
        onClick={() => {
          setTabPath('a.md')
          navigate('/files/source/a.md')
        }}
      >
        Return source A
      </button>
      <AppCachedOutlet
        context={context}
        routeCacheKey={location.pathname}
        routePathname={location.pathname}
        shouldAnimateRouteCache={location.pathname.includes('/source/')}
        workspaceKey="internal:"
      />
    </>
  )
}

describe('recent source route continuity', () => {
  it('keeps route-owned content and local undo state while tab selection and motion change', async () => {
    unmounts.mockClear()
    render(
      <MemoryRouter initialEntries={['/files/source/a.md']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/files/source/*" element={<SourceProbe />} />
            <Route path="/files/edit/*" element={<div>Rich editor</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'a.md:initial history' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select B before navigation' }))
    expect(screen.getByTestId('buffer-path')).toHaveTextContent('a.md')
    fireEvent.click(screen.getByRole('button', { name: 'Open rich B' }))
    await screen.findByText('Rich editor')
    fireEvent.click(screen.getByRole('button', { name: 'Open source B' }))
    await screen.findByText('b.md:B')
    fireEvent.click(screen.getByRole('button', { name: 'Return source A' }))
    await screen.findByRole('button', { name: 'a.md:retained undo' })
    await waitFor(() => expect(screen.getByText('a.md:A')).toBeVisible())
    expect(unmounts).not.toHaveBeenCalledWith('a.md')
  })
})
