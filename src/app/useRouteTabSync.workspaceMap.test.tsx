import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRouteTabSync } from '@/app/useRouteTabSync'
import type { WorkspaceTab } from '@/store/appTypes'

describe('useRouteTabSync workspace map', () => {
  it('marks the route handled without changing the current file tab', async () => {
    const onRouteHandled = vi.fn()
    const setActiveTabId = vi.fn()
    const setTabs = vi.fn()
    const tabs: WorkspaceTab[] = [{ kind: 'file', path: 'notes/current.md', view: 'edit' }]

    renderHook(() =>
      useRouteTabSync({
        activeTabId: 'file:edit:notes/current.md',
        enabled: true,
        gitDiffMatch: null,
        sourceMatch: null,
        graphFileMatch: null,
        previewMatch: null,
        graphWorkspaceMatch: {},
        allPagesMatch: null,
        historyMatch: null,
        gitDiffSection: undefined,
        gitDiffPath: null,
        routeFileView: null,
        routeFilePath: null,
        routePath: null,
        isRouteFile: false,
        locationPathname: '/workspace/graph',
        lastHandledRouteRef: createRef<string | null>(),
        inspectedPathRef: { current: 'notes/current.md' },
        tabsRef: { current: tabs },
        onRouteHandled,
        setTabs,
        setActiveTabId,
        setInspectedPath: vi.fn(),
      }),
    )

    await waitFor(() => expect(onRouteHandled).toHaveBeenCalledOnce())
    expect(setTabs).not.toHaveBeenCalled()
    expect(setActiveTabId).not.toHaveBeenCalled()
  })

  it('keeps the current file tab while the root route resolves its destination', async () => {
    const onRouteHandled = vi.fn()
    const setActiveTabId = vi.fn()
    const setInspectedPath = vi.fn()
    const tabs: WorkspaceTab[] = [{ kind: 'file', path: 'notes/current.md', view: 'edit' }]

    renderHook(() =>
      useRouteTabSync({
        activeTabId: 'file:edit:notes/current.md',
        enabled: true,
        gitDiffMatch: null,
        sourceMatch: null,
        graphFileMatch: null,
        previewMatch: null,
        graphWorkspaceMatch: null,
        allPagesMatch: null,
        historyMatch: null,
        gitDiffSection: undefined,
        gitDiffPath: null,
        routeFileView: null,
        routeFilePath: null,
        routePath: null,
        isRouteFile: false,
        locationPathname: '/',
        lastHandledRouteRef: createRef<string | null>(),
        inspectedPathRef: { current: 'notes/current.md' },
        tabsRef: { current: tabs },
        onRouteHandled,
        setTabs: vi.fn(),
        setActiveTabId,
        setInspectedPath,
      }),
    )

    await waitFor(() => expect(onRouteHandled).toHaveBeenCalledOnce())
    expect(setActiveTabId).not.toHaveBeenCalled()
    expect(setInspectedPath).not.toHaveBeenCalled()
  })
})
