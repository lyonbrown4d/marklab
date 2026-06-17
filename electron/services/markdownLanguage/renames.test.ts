import { describe, expect, it, vi } from 'vitest'

import { renameMarkdownReferences } from '@electron/services/markdownLanguage/renames.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [],
      links: [],
      assets: [],
    },
    {
      path: 'notes/other.md',
      headings: [],
      links: [
        {
          source_path: 'notes/other.md',
          text: 'Draft',
          target: 'current.md#draft',
          link_type: 'markdown',
          target_path: 'notes/current.md',
          target_anchor: 'draft',
          target_heading_slug: 'draft',
          is_external: false,
          context: 'See [Draft](current.md#draft)',
          line: 1,
          column: 5,
        },
      ],
      assets: [],
    },
  ],
} satisfies FsWorkspaceIndex

const createWorkspace = () => {
  const readFile = vi.fn(async ({ path }: { path: string }) => {
    if (path === 'notes/other.md') return 'See [Draft](current.md#draft)'
    return ''
  })
  const updateBuffer = vi.fn()

  return {
    workspace: {
      readFile,
      updateBuffer,
    } as unknown as WorkspaceService,
    readFile,
    updateBuffer,
  }
}

describe('renameMarkdownReferences', () => {
  it('renames current unsaved heading references and indexed external references', async () => {
    const { workspace, updateBuffer } = createWorkspace()
    const result = await renameMarkdownReferences(
      workspace,
      {
        path: 'notes/current.md',
        content: '# Draft\n\nSee [Draft](#draft)',
        line: 1,
        column: 3,
        newName: 'Final Draft',
      },
      () => Promise.resolve(workspaceIndex),
    )

    expect(result.rejectReason).toBeNull()
    expect(result.edits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'notes/current.md',
          line: 1,
          newText: 'Final Draft',
        }),
        expect.objectContaining({
          path: 'notes/current.md',
          line: 3,
          newText: '#final-draft',
        }),
      ]),
    )
    expect(updateBuffer).toHaveBeenCalledWith({
      path: 'notes/other.md',
      content: 'See [Draft](current.md#final-draft)',
    })
  })
})
