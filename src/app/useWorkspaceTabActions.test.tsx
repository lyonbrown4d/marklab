import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceTabActions } from '@/app/useWorkspaceTabActions'
import type { WorkspaceTab } from '@/store/appTypes'

describe('useWorkspaceTabActions workspace map', () => {
  it('navigates to the map without creating or activating a document tab', () => {
    const navigate = vi.fn()
    const setActiveTabId = vi.fn()
    const setTabs = vi.fn()
    const tabs: WorkspaceTab[] = [{ kind: 'file', path: 'notes/current.md', view: 'edit' }]
    const { result } = renderHook(() =>
      useWorkspaceTabActions({
        activeTabIdRef: { current: 'file:edit:notes/current.md' },
        currentFilePathRef: { current: 'notes/current.md' },
        inspectedPathRef: { current: 'notes/current.md' },
        locationPathnameRef: { current: '/files/edit/notes/current.md' },
        tabsRef: { current: tabs },
        navigate,
        setTabViewModes: vi.fn(),
        setTabs,
        setActiveTabId,
        setInspectedPath: vi.fn(),
        defaultFileView: 'edit',
      }),
    )

    act(() => result.current.onOpenWorkspaceGraph())

    expect(navigate).toHaveBeenCalledWith('/workspace/graph')
    expect(setTabs).not.toHaveBeenCalled()
    expect(setActiveTabId).not.toHaveBeenCalled()
  })
})
