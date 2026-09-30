import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRouteTabSync } from '@/app/useRouteTabSync'
import type { WorkspaceTab } from '@/store/appTypes'

describe('useRouteTabSync workspace history', () => {
  it('clears the document selection while entering history', async () => {
    const setActiveTabId = vi.fn()
    const setInspectedPath = vi.fn()

    renderHook(() =>
      useRouteTabSync({
        activeTabId: 'file:notes/active.md',
        enabled: true,
        gitDiffMatch: null,
        sourceMatch: null,
        graphFileMatch: null,
        previewMatch: null,
        graphWorkspaceMatch: null,
        allPagesMatch: null,
        historyMatch: {},
        gitDiffSection: undefined,
        gitDiffPath: null,
        routeFileView: null,
        routeFilePath: null,
        routePath: null,
        isRouteFile: false,
        locationPathname: '/workspace/history',
        lastHandledRouteRef: createRef<string | null>(),
        inspectedPathRef: { current: 'notes/active.md' },
        tabsRef: { current: [] as WorkspaceTab[] },
        onRouteHandled: vi.fn(),
        setTabs: vi.fn(),
        setActiveTabId,
        setInspectedPath,
      }),
    )

    await waitFor(() => {
      expect(setActiveTabId).toHaveBeenCalledWith(null)
      expect(setInspectedPath).toHaveBeenCalledWith(null)
    })
  })
})
