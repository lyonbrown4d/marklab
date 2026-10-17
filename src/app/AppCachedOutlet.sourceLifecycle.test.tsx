import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { startTransition, useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorRouteSnapshot } from '@/app/useEditorRouteSnapshot'
import { EditorTransitionFrame } from '@/app/EditorTransitionFrame'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'
import type { LayoutContext } from '@/app/AppLayoutContext'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useEditorRoutes } from '@/app/useEditorRoutes'
import SourceFilePage from '@/pages/SourceFilePage'
import type { WorkspaceTab } from '@/store/appTypes'

const native = vi.hoisted(() => ({
  openFile: vi.fn(),
  openBufferSnapshot: vi.fn(),
  applyBufferUpdate: vi.fn(),
  getBufferStatus: vi.fn(),
  flushBuffers: vi.fn(),
}))
const unmounts = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/services/fsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fsApi')>()),
  fsApi: native,
}))
vi.mock('@/pages/useGitFileConflict', () => ({
  useGitFileConflict: () => ({ conflict: false, checking: false }),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/pages/SourceCodePage', () => {
  const MockSourcePage = ({
    activePath,
    value,
    onChange,
  }: {
    activePath: string
    value: string
    onChange: (value: string) => void
  }) => {
    const [history, setHistory] = useState('original history')
    useEffect(() => () => unmounts(activePath), [activePath])
    return (
      <div>
        <div>
          {activePath}:{value}
        </div>
        <button
          type="button"
          onClick={() => {
            setHistory('retained history')
            onChange('edited ' + activePath)
          }}
        >
          {activePath}:{history}
        </button>
      </div>
    )
  }
  return { default: MockSourcePage }
})
const files = [
  { kind: 'file', path: 'a.md' },
  { kind: 'file', path: 'b.md' },
] as const
const initialTabs: WorkspaceTab[] = [
  { kind: 'file', path: 'a.md', view: 'edit' },
  { kind: 'file', path: 'a.md', view: 'source' },
]
const Shell = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState(initialTabs)
  const [tab, setTab] = useState<WorkspaceTab>(initialTabs[1])
  const routes = useEditorRoutes({
    entries: [...files],
    activeTab: tab,
    rootKind: 'external',
    rootPath: '/workspace',
    tabViewModes: {},
    treeGeneration: 0,
    treeRevision: 0,
  })
  const buffer = useEditorBuffer({
    activePath: routes.currentFilePath,
    workspaceKey: 'external:/workspace',
    openPaths: tabs.flatMap((item) => (item.kind === 'file' ? [item.path] : [])),
  })
  const open = (path: string, view: 'source' | 'edit') => {
    const next: WorkspaceTab = { kind: 'file', path, view }
    setTabs((previous) => [...previous, next])
    setTab(next)
    startTransition(() => navigate(`/files/${view}/${path}`))
  }
  const context = {
    ...buffer,
    editorBufferPath: routes.currentFilePath,
    activePath: routes.currentFilePath,
    files,
    rootKind: 'external',
    rootPath: '/workspace',
    onOpenFile: vi.fn(),
    onOpenFileView: vi.fn(),
  } as unknown as LayoutContext
  const outletSnapshot = useEditorRouteSnapshot(
    <AppCachedOutlet
      context={context}
      routeCacheKey={location.pathname}
      routePathname={location.pathname}
      shouldAnimateRouteCache={location.pathname.includes('/source/')}
      workspaceKey="external:/workspace"
    />,
  )
  return (
    <>
      <button type="button" onClick={() => open('b.md', 'edit')}>
        Rich B
      </button>
      <button type="button" onClick={() => open('b.md', 'source')}>
        Source B
      </button>
      <button type="button" onClick={() => open('a.md', 'source')}>
        Source A
      </button>
      <div data-testid="save">{buffer.saveStates['a.md']?.status}</div>
      <EditorTransitionFrame
        requestKey={routes.currentFilePath ?? 'none'}
        status={
          routes.currentFilePath &&
          !Object.prototype.hasOwnProperty.call(buffer.fileContents, routes.currentFilePath)
            ? 'loading'
            : 'ready'
        }
      >
        {outletSnapshot}
      </EditorTransitionFrame>
    </>
  )
}

beforeEach(() => {
  native.openBufferSnapshot.mockImplementation(async (path: string) => {
    const content = await native.openFile(path)
    return { ...(await native.getBufferStatus(path)), path, content }
  })
  unmounts.mockClear()
  native.openFile.mockImplementation((path: string) => Promise.resolve(path))
  native.applyBufferUpdate.mockResolvedValue({
    kind: 'applied',
    path: 'a.md',
    revision: 1,
    dirty: false,
    session_generation: 1,
  })
  native.getBufferStatus.mockResolvedValue({
    path: 'a.md',
    revision: 1,
    dirty: false,
    session_generation: 1,
  })
  native.flushBuffers.mockResolvedValue(0)
})

describe('loaded source page retention', () => {
  it('keeps the actual loaded source subtree after saving and switching through a newly loaded rich document', async () => {
    let finishB!: (content: string) => void
    const pendingB = new Promise<string>((resolve) => {
      finishB = resolve
    })
    native.openFile.mockImplementation((path: string) =>
      path === 'b.md' ? pendingB : Promise.resolve(path),
    )
    render(
      <MemoryRouter initialEntries={['/files/source/a.md']}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/files/source/*" element={<SourceFilePage />} />
            <Route path="/files/edit/*" element={<div>Rich editor</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'a.md:original history' }))
    await waitFor(() => expect(screen.getByTestId('save')).toHaveTextContent('saved'))
    fireEvent.click(screen.getByRole('button', { name: 'Rich B' }))
    await waitFor(() => expect(native.openFile).toHaveBeenCalledWith('b.md'))
    expect(unmounts).not.toHaveBeenCalledWith('a.md')
    expect(screen.getByRole('button', { name: 'a.md:retained history' })).toBeVisible()
    expect(screen.getByTestId('editor-transition-content')).toHaveAttribute('inert')
    await act(async () => {
      finishB('b.md')
    })
    await screen.findByText('Rich editor')
    fireEvent.click(screen.getByRole('button', { name: 'Source B' }))
    await screen.findByText('b.md:b.md')
    expect(unmounts).not.toHaveBeenCalledWith('a.md')
    fireEvent.click(screen.getByRole('button', { name: 'Source A' }))
    await screen.findByRole('button', { name: 'a.md:retained history' })
    await act(async () => undefined)
    expect(unmounts).not.toHaveBeenCalledWith('a.md')
  })
})
