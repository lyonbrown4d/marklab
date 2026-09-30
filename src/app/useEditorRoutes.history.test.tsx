import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useEditorRoutes } from '@/app/useEditorRoutes'

describe('useEditorRoutes workspace history', () => {
  it('treats history as an internal workspace route without an active document', () => {
    const { result } = renderHook(
      () =>
        useEditorRoutes({
          entries: [{ kind: 'file', path: 'notes/active.md' }],
          activeTab: { kind: 'file', path: 'notes/active.md', view: 'edit' },
          tabViewModes: {},
        }),
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/workspace/history']}>{children}</MemoryRouter>
        ),
      },
    )

    expect(result.current.historyMatch).toBeTruthy()
    expect(result.current.internalRouteActive).toBe(true)
    expect(result.current.currentFilePath).toBeNull()
  })
})
