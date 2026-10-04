import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceTabActions } from '@/app/useWorkspaceTabActions'
import type { WorkspaceTab } from '@/store/appTypes'

const closeNativeWebTab = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ webTabs: { close: closeNativeWebTab } }),
  isElectronRuntime: () => true,
}))

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

  it('creates a web tab after the active tab and activates its opaque route', () => {
    const navigate = vi.fn()
    const setActiveTabId = vi.fn()
    const setTabs = vi.fn()
    const editTab: WorkspaceTab = { kind: 'file', path: 'notes/current.md', view: 'edit' }
    const sourceTab: WorkspaceTab = { kind: 'file', path: 'notes/current.md', view: 'source' }
    const tabs: WorkspaceTab[] = [editTab, sourceTab]
    const { result, rerender } = renderHook(() =>
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

    act(() => result.current.onOpenWebTab('https://example.com/docs', 'Docs', 'web-id'))

    const webTab: WorkspaceTab = {
      kind: 'web',
      id: 'web-id',
      url: 'https://example.com/docs',
      title: 'Docs',
    }
    expect(setTabs).toHaveBeenCalledWith([editTab, webTab, sourceTab])
    expect(setActiveTabId).toHaveBeenCalledWith('web:web-id')
    expect(navigate).toHaveBeenCalledWith('/web/web-id')

    tabs.splice(1, 0, webTab)
    rerender()
    setTabs.mockClear()
    act(() => result.current.onOpenWebTab('https://example.com/docs', 'Docs', 'web-id'))
    expect(setTabs).not.toHaveBeenCalled()
  })

  it('closes the native surface when a web tab is closed from the tabs dock', () => {
    const webTab: WorkspaceTab = {
      kind: 'web',
      id: 'web-id',
      title: 'Docs',
      url: 'https://example.com/docs',
    }
    const setTabs = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceTabActions({
        activeTabIdRef: { current: 'file:edit:README.md' },
        currentFilePathRef: { current: 'README.md' },
        inspectedPathRef: { current: 'README.md' },
        locationPathnameRef: { current: '/files/edit/README.md' },
        tabsRef: {
          current: [{ kind: 'file', path: 'README.md', view: 'edit' }, webTab],
        },
        navigate: vi.fn(),
        setTabViewModes: vi.fn(),
        setTabs,
        setActiveTabId: vi.fn(),
        setInspectedPath: vi.fn(),
        defaultFileView: 'edit',
      }),
    )

    act(() => result.current.onCloseTab('web:web-id'))

    expect(closeNativeWebTab).toHaveBeenCalledWith({ tabId: 'web-id' })
    expect(setTabs).toHaveBeenCalledWith([{ kind: 'file', path: 'README.md', view: 'edit' }])
  })
})
