import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRouteTabSync } from '@/app/useRouteTabSync'
import type { WorkspaceTab } from '@/store/appTypes'

describe('useRouteTabSync web tabs', () => {
  it('restores an existing opaque web tab from browser history', async () => {
    const setActiveTabId = vi.fn()
    const setInspectedPath = vi.fn()
    const onRouteHandled = vi.fn()
    const tabs: WorkspaceTab[] = [
      { kind: 'file', path: 'notes/current.md', view: 'edit' },
      { kind: 'web', id: 'docs', title: 'Docs', url: 'https://example.com/' },
    ]

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
        webMatch: {},
        webTabRouteId: 'docs',
        gitDiffSection: undefined,
        gitDiffPath: null,
        routeFileView: null,
        routeFilePath: null,
        routePath: null,
        isRouteFile: false,
        locationPathname: '/web/docs',
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
    expect(setActiveTabId).toHaveBeenCalledWith('web:docs')
    expect(setInspectedPath).toHaveBeenCalledWith(null)
  })
})
