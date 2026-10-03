import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceMapReferenceNode } from '@/pages/workspace-map/WorkspaceMapReferenceNode'

vi.mock('@/components/previews/EmbeddedFilePreview', () => ({
  default: ({ documentPath, target, title }: Record<string, string | null>) => (
    <button
      type="button"
      data-document-path={documentPath ?? ''}
      data-testid="embedded-file-preview"
      data-target={target}
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

  it('uses the existing embedded preview flow for a normalized PDF workspace path', () => {
    const props = {
      id: 'preview:docs/brief.pdf',
      type: 'preview',
      selected: false,
      data: {
        label: 'brief.pdf',
        path: 'docs/brief.pdf',
        previewKind: 'pdf',
        sourcePath: 'notes/current.md',
        target: 'docs/brief.pdf',
      },
    } as unknown as ComponentProps<typeof WorkspaceMapReferenceNode>

    render(<WorkspaceMapReferenceNode {...props} />, { wrapper: ReactFlowProvider })

    const preview = screen.getByTestId('embedded-file-preview')
    expect(preview).toHaveAttribute('data-target', 'docs/brief.pdf')
    expect(preview).toHaveAttribute('data-document-path', '')
    expect(preview.parentElement).toHaveClass('nodrag', 'nopan')
    expect(screen.getByTestId('workspace-map-pdf-drag-handle')).toHaveTextContent('brief.pdf')
    const node = preview.closest('section')
    expect(node).not.toHaveAttribute('role', 'button')
    expect(node).not.toHaveAttribute('tabindex')
  })
})
