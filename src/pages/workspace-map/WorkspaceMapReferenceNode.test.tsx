import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'

vi.mock('@/components/GraphWebNode', () => ({
  GraphWebNode: ({ dragHandleClassName, label, url }: Record<string, string>) => (
    <div className={dragHandleClassName} data-testid="graph-web-node" data-url={url}>
      {label}
    </div>
  ),
}))

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
  it('unmounts a rich web preview while its node is collapsed', () => {
    const toggle = vi.fn()
    const parentClick = vi.fn()
    const parentMouseDown = vi.fn()
    const parentPointerDown = vi.fn()
    const props = {
      id: 'ext:https://example.com/current',
      type: 'external',
      selected: false,
      data: {
        label: 'Current page',
        subtitle: 'example.com',
        url: 'https://example.com/current',
        webView: { active: false, activate: vi.fn(), deactivate: vi.fn() },
        workspaceMapDisclosure: { collapsed: true, toggle },
      },
    } as unknown as ComponentProps<typeof WorkspaceMapReferenceNode>

    render(
      <div onClick={parentClick} onMouseDown={parentMouseDown} onPointerDown={parentPointerDown}>
        <WorkspaceMapReferenceNode {...props} />
      </div>,
      { wrapper: ReactFlowProvider },
    )

    expect(screen.queryByTestId('graph-web-node')).not.toBeInTheDocument()
    expect(screen.getByText('Current page')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Current page' })).toBeInTheDocument()
    expect(document.querySelector('.react-flow__resize-control')).toBeNull()

    const disclosure = screen.getByRole('button', { name: 'Expand node content' })
    fireEvent.pointerDown(disclosure)
    fireEvent.mouseDown(disclosure)
    fireEvent.click(disclosure)
    expect(toggle).toHaveBeenCalledExactlyOnceWith('ext:https://example.com/current')
    expect(parentClick).not.toHaveBeenCalled()
    expect(parentMouseDown).not.toHaveBeenCalled()
    expect(parentPointerDown).not.toHaveBeenCalled()
  })

  it('renders an external URL through the shared graph web preview with resize affordance', () => {
    const props = {
      id: 'ext:https://example.com/current',
      type: 'external',
      selected: false,
      data: {
        label: 'Current page',
        subtitle: 'example.com',
        url: 'https://example.com/current',
        webView: { active: false, activate: vi.fn(), deactivate: vi.fn() },
      },
    } as unknown as ComponentProps<typeof WorkspaceMapReferenceNode>

    render(<WorkspaceMapReferenceNode {...props} />, { wrapper: ReactFlowProvider })

    expect(screen.getByTestId('graph-web-node')).toHaveAttribute(
      'data-url',
      'https://example.com/current',
    )
    expect(screen.getByTestId('graph-web-node')).toHaveClass('workspace-map-web-drag-handle')
    expect(screen.getByRole('region', { name: 'Current page' })).toBeInTheDocument()
    expect(document.querySelector('.react-flow__resize-control')).not.toBeNull()
    expect(screen.queryByText('example.com')).not.toBeInTheDocument()
  })

  it.each(['external', 'missing'] as const)(
    'renders %s as the same lightweight workspace map card',
    (type) => {
      renderNode(type)

      const node = screen.getByText('Target').closest('.workspace-map-node')
      expect(node).not.toBeNull()
      expect(node).toHaveClass('workspace-map-node')
      expect(node).toHaveClass('size-full', 'min-h-20', 'min-w-44')
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
      expect(node).toHaveAccessibleName(`resource.${previewKind}`)
      expect(node).toHaveClass('size-full', 'min-h-[180px]', 'min-w-[280px]')
      expect(node).not.toHaveAttribute('role', 'button')
      expect(node).not.toHaveAttribute('tabindex')
      expect(node?.querySelector('.react-flow__resize-control')).not.toBeNull()
    },
  )
})
