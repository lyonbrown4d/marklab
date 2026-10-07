import { renderHook, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useEditorRoutes } from '@/app/useEditorRoutes'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { pathsExist: vi.fn() },
}))

const renderRoutes = (path: string) =>
  renderHook(
    () =>
      useEditorRoutes({
        entries: [{ kind: 'file', path: 'notes/active.md' }],
        activeTab: { kind: 'file', path: 'notes/active.md', view: 'edit' },
        rootKind: 'external',
        rootPath: '/workspace',
        tabViewModes: {},
        treeGeneration: 0,
        treeRevision: 0,
      }),
    {
      wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
    },
  )

describe('useEditorRoutes workspace view', () => {
  it('keeps workspace map separate from the document editor mode', () => {
    const { result } = renderRoutes('/workspace/graph')

    expect(result.current.workspaceView).toBe('map')
    expect(result.current.viewMode).toBe('wysiwyg')
  })

  it('resolves a deep route through bounded existence without a full tree', async () => {
    vi.mocked(workspaceTreeApi.pathsExist).mockResolvedValue({
      existing: ['deep/unloaded.md'],
      generation: 0,
      revision: 0,
      root: { kind: 'external', path: '/workspace' },
    })
    const { result } = renderRoutes('/files/edit/deep/unloaded.md')

    await waitFor(() => expect(result.current.isRouteFile).toBe(true))
    expect(workspaceTreeApi.pathsExist).toHaveBeenCalledWith({
      kind: 'file',
      paths: ['deep/unloaded.md'],
    })
  })

  it('invalidates remote existence when the tree revision changes and handles rejection', async () => {
    vi.mocked(workspaceTreeApi.pathsExist)
      .mockResolvedValueOnce({
        existing: ['deep/unloaded.md'],
        generation: 0,
        revision: 0,
        root: { kind: 'external', path: '/workspace' },
      })
      .mockRejectedValueOnce(new Error('query failed'))
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <MemoryRouter initialEntries={['/files/edit/deep/unloaded.md']}>{children}</MemoryRouter>
    )
    const { result, rerender } = renderHook(
      ({ revision }) =>
        useEditorRoutes({
          activeTab: null,
          entries: [],
          rootKind: 'external',
          rootPath: '/workspace',
          tabViewModes: {},
          treeGeneration: 0,
          treeRevision: revision,
        }),
      { initialProps: { revision: 0 }, wrapper },
    )
    await waitFor(() => expect(result.current.isRouteFile).toBe(true))

    rerender({ revision: 1 })
    expect(result.current.isRouteFile).toBe(false)
    await waitFor(() => expect(workspaceTreeApi.pathsExist).toHaveBeenCalledTimes(2))
    expect(result.current.isRouteFile).toBe(false)
  })

  it('does not recognize the removed file graph route as an editor mode', () => {
    const { result } = renderRoutes('/files/graph/notes/active.md')

    expect(result.current.workspaceView).toBe('files')
    expect(result.current.viewMode).toBe('wysiwyg')
    expect(result.current.internalRouteActive).toBe(false)
  })
})
