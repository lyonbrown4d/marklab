import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import {
  WORKSPACE_MAP_RESOURCE_NODE_HEIGHT,
  WORKSPACE_MAP_RESOURCE_NODE_WIDTH,
} from '@/logic/graphLayoutMetrics'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'

vi.mock('@/components/previews/EmbeddedFilePreview', () => ({
  default: ({ documentPath, target, title, variant }: Record<string, string | null>) => (
    <button
      type="button"
      className={variant === 'graph' ? 'embedded-preview-drag-handle' : undefined}
      data-document-path={documentPath ?? ''}
      data-testid="embedded-file-preview"
      data-target={target}
      data-variant={variant}
    >
      {title}
    </button>
  ),
}))

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
  it.each(['external', 'missing'] as const)(
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

  it.each(['audio', 'docx', 'drawio', 'excalidraw', 'image', 'pdf', 'source', 'video'] as const)(
    'uses one graph preview surface and fixed drag handle for %s resources',
    (previewKind) => {
      const props = {
        id: `preview:assets/resource.${previewKind}`,
        type: 'preview',
        selected: false,
        data: {
          label: `resource.${previewKind}`,
          path: `assets/resource.${previewKind}`,
          previewKind,
          sourcePath: 'notes/current.md',
          target: `assets/resource.${previewKind}`,
        },
      } as unknown as ComponentProps<typeof WorkspaceMapReferenceNode>

      render(<WorkspaceMapReferenceNode {...props} />, { wrapper: ReactFlowProvider })

      const preview = screen.getByTestId('embedded-file-preview')
      expect(preview).toHaveAttribute('data-target', `assets/resource.${previewKind}`)
      expect(preview).toHaveAttribute('data-document-path', '')
      expect(preview).toHaveAttribute('data-variant', 'graph')
      expect(preview.parentElement).not.toHaveClass('nodrag', 'nopan')
      expect(preview).toHaveClass('embedded-preview-drag-handle')
      const node = preview.closest('section')
      expect(node).toHaveStyle({
        height: `${WORKSPACE_MAP_RESOURCE_NODE_HEIGHT}px`,
        width: `${WORKSPACE_MAP_RESOURCE_NODE_WIDTH}px`,
      })
      expect(node).not.toHaveAttribute('role', 'button')
      expect(node).not.toHaveAttribute('tabindex')
    },
  )
})
