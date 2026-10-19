import { act, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { NodeToolbar, ReactFlowProvider, useStoreApi } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapNodeToolbar } from '@/pages/workspace-map/WorkspaceMapNodeToolbar'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('workspace map toolbar viewport subscriptions', () => {
  it('keeps hidden toolbars out of viewport frame commits', () => {
    let store: ReturnType<typeof useStoreApi> | undefined
    const CaptureStore = () => {
      store = useStoreApi()
      return null
    }
    const hiddenCommits = vi.fn()
    const referenceCommits = vi.fn()
    render(
      <ReactFlowProvider
        initialNodes={[
          { id: 'visible', data: {}, position: { x: 20, y: 30 }, width: 100, height: 50 },
        ]}
      >
        <CaptureStore />
        <div data-testid="flow-root">
          <div className="react-flow__renderer" />
        </div>
        <Profiler id="reference-toolbar" onRender={referenceCommits}>
          <NodeToolbar nodeId="visible" isVisible>
            Visible reference
          </NodeToolbar>
        </Profiler>
        <Profiler id="workspace-toolbar" onRender={hiddenCommits}>
          <WorkspaceMapNodeToolbar
            onFocusRelations={() => undefined}
            onTogglePin={() => undefined}
            pinned={false}
            visible={false}
          />
        </Profiler>
      </ReactFlowProvider>,
    )
    act(() => store?.setState({ domNode: screen.getByTestId('flow-root') }))
    const toolbar = screen.getByText('Visible reference')
    const initialTransform = toolbar.style.transform
    hiddenCommits.mockClear()
    referenceCommits.mockClear()
    for (let frame = 1; frame <= 30; frame += 1) {
      act(() => store?.setState({ transform: [frame, frame, 1 + frame / 100] }))
    }

    expect(hiddenCommits).not.toHaveBeenCalled()
    expect(referenceCommits).toHaveBeenCalledTimes(30)
    expect(toolbar.style.transform).not.toBe(initialTransform)
  })
})
