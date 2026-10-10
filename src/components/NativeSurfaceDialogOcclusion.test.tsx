import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileConfirmDialog, FileNameDialog } from '@/components/file-tree/FileOperationDialogs'
import { GitCommitDialog } from '@/components/GitCommitDialog'
import { GitInitDialog } from '@/components/GitInitDialog'

const useOcclusion = vi.hoisted(() => vi.fn())

vi.mock('@/app/nativeSurfaceOcclusion', () => ({
  useNativeSurfaceOcclusion: useOcclusion,
}))

describe('native surface dialog occlusion', () => {
  it('occludes file operation and Git portals while open', () => {
    render(
      <>
        <FileNameDialog
          open
          title="Create file"
          description="File name"
          defaultValue="notes.md"
          confirmLabel="Create"
          onOpenChange={vi.fn()}
          onSubmit={vi.fn()}
        />
        <FileConfirmDialog
          open
          title="Delete file"
          description="This cannot be undone"
          confirmLabel="Delete"
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
        />
        <GitCommitDialog
          open
          branch="main"
          changedFilesCount={1}
          message="Update docs"
          onOpenChange={vi.fn()}
          onMessageChange={vi.fn()}
          onCommit={vi.fn()}
          canCommit
          isCommitting={false}
          error={null}
        />
        <GitInitDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          isInitializing={false}
          error={null}
        />
      </>,
    )

    expect(useOcclusion).toHaveBeenCalledWith('file-name-dialog', true, {
      blocksCommandPalette: true,
    })
    expect(useOcclusion).toHaveBeenCalledWith('file-confirm-dialog', true, {
      blocksCommandPalette: true,
    })
    expect(useOcclusion).toHaveBeenCalledWith('git-commit-dialog', true, {
      blocksCommandPalette: true,
    })
    expect(useOcclusion).toHaveBeenCalledWith('git-init-dialog', true, {
      blocksCommandPalette: true,
    })
  })
})
