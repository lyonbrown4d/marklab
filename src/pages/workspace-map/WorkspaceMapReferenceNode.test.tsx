import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'

const renderNode = (type: 'external' | 'missing' | 'preview') => {
  const props = {
    id: `${type}:target`,
    type,
    selected: false,
    data: { label: 'Target', path: 'assets/target.png', subtitle: 'Reference path' },
  } as unknown as ComponentProps<typeof WorkspaceMapReferenceNode>
  return render(<WorkspaceMapReferenceNode {...props} />, { wrapper: ReactFlowProvider })
}

describe('WorkspaceMapReferenceNode', () => {
  it.each(['external', 'missing', 'preview'] as const)(
    'renders %s as the same lightweight workspace map card',
    (type) => {
      renderNode(type)

      const node = screen.getByText('Target').closest('.workspace-map-node')
      expect(node).not.toBeNull()
      expect(node).toHaveClass('workspace-map-node')
      expect(node).toHaveClass('h-24', 'w-[200px]')
      expect(screen.getByText('Reference path')).toBeInTheDocument()
      expect(document.querySelector('[data-preview-kind]')).not.toBeInTheDocument()
    },
  )
})
