import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  NodeResizeControl: ({
    children,
    className,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    position,
  }: PropsWithChildren<Record<string, unknown>>) => (
    <div
      className={String(className)}
      data-max-height={maxHeight}
      data-max-width={maxWidth}
      data-min-height={minHeight}
      data-min-width={minWidth}
      data-position={position}
      data-testid="resize-control"
    >
      {children}
    </div>
  ),
}))

import { WorkspaceMapNodeResizeControl } from '@/pages/workspace-map/WorkspaceMapNodeResizeControl'

describe('WorkspaceMapNodeResizeControl', () => {
  it('provides one visible bottom-right handle isolated from node drag and canvas pan', () => {
    render(<WorkspaceMapNodeResizeControl minHeight={180} minWidth={300} />)

    const control = screen.getByTestId('resize-control')
    expect(control).toHaveClass('nodrag', 'nopan', 'workspace-map-node__resize-control')
    expect(control).toHaveAttribute('data-position', 'bottom-right')
    expect(control).toHaveAttribute('data-min-height', '180')
    expect(control).toHaveAttribute('data-min-width', '300')
    expect(control).toHaveAttribute('data-max-height', '960')
    expect(control).toHaveAttribute('data-max-width', '1200')
    expect(control.querySelector('svg')).not.toBeNull()
  })
})
