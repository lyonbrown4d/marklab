import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapToolbar } from '@/pages/workspace-map/WorkspaceMapToolbar'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('WorkspaceMapToolbar', () => {
  it('switches map modes and exposes explicit automatic arrangement', () => {
    const onArrange = vi.fn()
    const onModeChange = vi.fn()
    render(
      <WorkspaceMapToolbar
        externalCount={0}
        mode="overview"
        nodes={[]}
        onArrange={onArrange}
        onFocusNode={vi.fn()}
        onModeChange={onModeChange}
        onToggleExternalResources={vi.fn()}
        showExternalResources={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'workspaceMap.overviewMode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.focusMode' }))
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.autoArrange' }))

    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('focus')
    expect(onArrange).toHaveBeenCalledOnce()
  })
})
