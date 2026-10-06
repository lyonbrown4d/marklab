import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceMapNodeToolbar } from '@/pages/workspace-map/WorkspaceMapNodeToolbar'

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) =>
    isVisible ? <div>{children}</div> : null,
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

  it('stays hidden until its node is selected or being edited', () => {
    render(<WorkspaceMapNodeToolbar {...handlers} pinned={false} visible={false} />)

    expect(
      screen.queryByRole('button', { name: 'workspaceMap.focusRelations' }),
    ).not.toBeInTheDocument()
  })
})
