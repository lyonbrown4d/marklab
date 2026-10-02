import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useWorkspaceMapEditorRoute } from '@/app/useWorkspaceMapEditorRoute'
import type { FileEntry } from '@/store/appTypes'

const entries: FileEntry[] = [
  { kind: 'file', path: 'notes/a.md' },
  { kind: 'file', path: 'notes/data.json' },
  { kind: 'folder', path: 'notes' },
]

const createWrapper = (initialEntry: string) => {
  const Wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
  )
  return Wrapper
}

const useRouteUnderTest = (enabled = true) => {
  const editor = useWorkspaceMapEditorRoute({ enabled, entries })
  const location = useLocation()
  return { ...editor, search: location.search }
}

describe('useWorkspaceMapEditorRoute', () => {
  it('accepts only existing Markdown files while the workspace map route is active', () => {
    const valid = renderHook(() => useRouteUnderTest(), {
      wrapper: createWrapper('/workspace/graph?edit=notes%2Fa.md&sidebar=graph'),
    })
    const nonMarkdown = renderHook(() => useRouteUnderTest(), {
      wrapper: createWrapper('/workspace/graph?edit=notes%2Fdata.json'),
    })
    const inactive = renderHook(() => useRouteUnderTest(false), {
      wrapper: createWrapper('/workspace/graph?edit=notes%2Fa.md'),
    })

    expect(valid.result.current.editorPath).toBe('notes/a.md')
    expect(nonMarkdown.result.current.editorPath).toBeNull()
    expect(inactive.result.current.editorPath).toBeNull()
  })

  it('switches and closes the editor while preserving unrelated query parameters', () => {
    const { result } = renderHook(() => useRouteUnderTest(), {
      wrapper: createWrapper('/workspace/graph?sidebar=graph'),
    })

    act(() => result.current.openEditor('notes/a.md'))
    expect(result.current.search).toContain('edit=notes%2Fa.md')
    expect(result.current.search).toContain('sidebar=graph')

    act(() => result.current.closeEditor())
    expect(result.current.search).toBe('?sidebar=graph')
  })
})
