import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapNodeToolbar } from '@/pages/workspace-map/WorkspaceMapNodeToolbar'

const flowToolbar = vi.hoisted(() => vi.fn())

vi.mock('@xyflow/react', () => ({
  NodeToolbar: (props: { children: React.ReactNode; isVisible: boolean }) => {
    flowToolbar(props)
    return props.isVisible ? <div>{props.children}</div> : null
  },
  Position: { Top: 'top' },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('WorkspaceMapNodeToolbar', () => {
  const handlers = {
    onClose: vi.fn(),
    onFocusRelations: vi.fn(),
    onOpenFull: vi.fn(),
    onTogglePin: vi.fn(),
  }

  beforeEach(() => vi.clearAllMocks())

  it('offers relationship focus and pinning for an engaged node', () => {
    render(<WorkspaceMapNodeToolbar {...handlers} pinned={false} visible />)

    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.focusRelations' }))
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.pinNode' }))

    expect(handlers.onFocusRelations).toHaveBeenCalledOnce()
    expect(handlers.onTogglePin).toHaveBeenCalledOnce()
  })

  it('mounts the viewport-subscribing toolbar only while selected or being edited', () => {
    const { rerender } = render(
      <WorkspaceMapNodeToolbar {...handlers} pinned={false} visible={false} />,
    )

    expect(
      screen.queryByRole('button', { name: 'workspaceMap.focusRelations' }),
    ).not.toBeInTheDocument()
    expect(flowToolbar).not.toHaveBeenCalled()

    rerender(<WorkspaceMapNodeToolbar {...handlers} pinned={false} visible />)
    expect(screen.getByRole('button', { name: 'workspaceMap.focusRelations' })).toBeVisible()
    flowToolbar.mockClear()

    rerender(<WorkspaceMapNodeToolbar {...handlers} pinned={false} visible={false} />)
    expect(flowToolbar).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'workspaceMap.focusRelations' }),
    ).not.toBeInTheDocument()
  })
})
