import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useEditorRoutes } from '@/app/useEditorRoutes'

const renderRoutes = (path: string) =>
  renderHook(
    () =>
      useEditorRoutes({
        entries: [{ kind: 'file', path: 'notes/active.md' }],
        activeTab: { kind: 'file', path: 'notes/active.md', view: 'edit' },
        tabViewModes: {},
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

  it('does not recognize the removed file graph route as an editor mode', () => {
    const { result } = renderRoutes('/files/graph/notes/active.md')

    expect(result.current.workspaceView).toBe('files')
    expect(result.current.viewMode).toBe('wysiwyg')
    expect(result.current.internalRouteActive).toBe(false)
  })
})
