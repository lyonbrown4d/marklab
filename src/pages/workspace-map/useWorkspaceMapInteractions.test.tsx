import { renderHook } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceMapInteractions } from '@/pages/workspace-map/useWorkspaceMapInteractions'

const mouseEvent = (target: HTMLElement) =>
  ({ preventDefault: vi.fn(), target }) as unknown as ReactMouseEvent

describe('useWorkspaceMapInteractions', () => {
  it('keeps pointer handlers stable when only the web-view wrapper changes', () => {
    const activate = vi.fn()
    const deactivate = vi.fn()
    const options = {
      activePath: null,
      clearNeighborhood: vi.fn(),
      exitFocusedView: vi.fn(() => false),
      fitWorkspace: vi.fn(),
      flow: null,
      focusNode: vi.fn(),
      mode: 'overview' as const,
      nodes: [],
      onActivateEditor: vi.fn(),
      onCloseEditor: vi.fn(),
      onModeChange: vi.fn(),
      onOpenFile: vi.fn(),
      onOpenSearch: vi.fn(),
    }
    const { result, rerender } = renderHook(() =>
      useWorkspaceMapInteractions({ ...options, webViews: { activate, deactivate } }),
    )
    const previous = result.current
    rerender()
    expect(result.current.onNodeClick).toBe(previous.onNodeClick)
    expect(result.current.onNodeDoubleClick).toBe(previous.onNodeDoubleClick)
    expect(result.current.onPaneClick).toBe(previous.onPaneClick)
    result.current.onNodeDoubleClick(mouseEvent(document.createElement('div')), {
      id: 'external:site',
      type: 'external',
      position: { x: 0, y: 0 },
      data: { label: 'Site', url: 'https://example.com' },
    })
    result.current.onPaneClick()
    expect(activate).toHaveBeenCalledExactlyOnceWith('external:site')
    expect(deactivate).toHaveBeenCalledOnce()
  })

  it('fits only when the double click comes from the canvas pane', () => {
    const fitWorkspace = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceMapInteractions({
        activePath: null,
        clearNeighborhood: vi.fn(),
        exitFocusedView: vi.fn(() => false),
        fitWorkspace,
        flow: null,
        focusNode: vi.fn(),
        mode: 'overview',
        nodes: [],
        onActivateEditor: vi.fn(),
        onCloseEditor: vi.fn(),
        onModeChange: vi.fn(),
        onOpenFile: vi.fn(),
        onOpenSearch: vi.fn(),
        webViews: { activate: vi.fn(), deactivate: vi.fn() },
      }),
    )
    const pane = document.createElement('div')
    pane.className = 'react-flow__pane'
    const node = document.createElement('div')
    node.className = 'react-flow__node'

    result.current.onCanvasDoubleClick(mouseEvent(node))
    result.current.onCanvasDoubleClick(mouseEvent(pane))

    expect(fitWorkspace).toHaveBeenCalledOnce()
  })
})
