import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FileTreeNodeRenderer } from '@/components/file-tree/FileTreeNodeRenderer'

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => children,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/file-tree/FileTreeContextMenu', () => ({
  FileTreeContextMenu: () => null,
}))

describe('FileTreeNodeRenderer', () => {
  it('toggles an unloaded folder that reports backend children', () => {
    const toggle = vi.fn()
    const node = {
      data: {
        name: 'notes',
        path: 'notes',
        type: 'folder',
        children: [],
        childrenLoaded: false,
        hasChildren: true,
      },
      focus: vi.fn(),
      isEditing: false,
      isOpen: false,
      select: vi.fn(),
      toggle,
    }

    render(
      <FileTreeNodeRenderer
        activePath={null}
        labels={{} as never}
        node={node as never}
        onInspectPath={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenFileView={vi.fn()}
        onRequestCreate={vi.fn()}
        onRequestDelete={vi.fn()}
        readonlyTree={false}
        style={{}}
        tree={{} as never}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(toggle).toHaveBeenCalledOnce()
  })
})
