import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xyflow/react', () => ({
  NodeResizer: ({
    handleClassName,
    lineClassName,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
  }: Record<string, unknown>) => (
    <div
      data-max-height={maxHeight}
      data-max-width={maxWidth}
      data-min-height={minHeight}
      data-min-width={minWidth}
      data-testid="node-resizer"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div className={String(lineClassName)} data-testid="resize-line" key={`line-${index}`} />
      ))}
      {Array.from({ length: 4 }, (_, index) => (
        <div
          className={String(handleClassName)}
          data-testid="resize-handle"
          key={`handle-${index}`}
        />
      ))}
    </div>
  ),
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
  it('provides four edge lines and four corner handles isolated from drag and pan', () => {
    render(<WorkspaceMapNodeResizeControl minHeight={180} minWidth={300} />)

    const resizer = screen.getByTestId('node-resizer')
    expect(screen.getAllByTestId('resize-line')).toHaveLength(4)
    expect(screen.getAllByTestId('resize-handle')).toHaveLength(4)
    screen.getAllByTestId(/resize-(line|handle)/).forEach((control) => {
      expect(control).toHaveClass('nodrag', 'nopan')
    })
    expect(resizer).toHaveAttribute('data-min-height', '180')
    expect(resizer).toHaveAttribute('data-min-width', '300')
    expect(resizer).toHaveAttribute('data-max-height', '960')
    expect(resizer).toHaveAttribute('data-max-width', '1200')
  })
})
