import { describe, expect, it, vi } from 'vitest'

import { rewriteMarkdownFileReferencesForRename } from '@electron/services/markdownLanguage/fileRenames.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const createHost = (files: Record<string, string>) => {
  const buffers = new Map(Object.entries(files))
  const readFile = vi.fn(async ({ path }: { path: string }) => buffers.get(path) ?? '')
  const updateBuffer = vi.fn(({ path, content }: { path: string; content: string }) => {
    buffers.set(path, content)
  })

  return {
    host: {
      readFile,
      updateBuffer,
    },
    readFile,
    updateBuffer,
    buffers,
  }
}

describe('rewriteMarkdownFileReferencesForRename', () => {
  it('rewrites markdown file links and preserves heading anchors', async () => {
    const { host, updateBuffer } = createHost({
      'notes/current.md': 'See [Target](target.md#known-heading)',
    })
    const workspaceIndex = {
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Target',
              target: 'target.md#known-heading',
              link_type: 'markdown',
              target_path: 'notes/target.md',
              target_anchor: 'known-heading',
              target_heading_slug: 'known-heading',
              is_external: false,
              context: 'See [Target](target.md#known-heading)',
              line: 1,
              column: 5,
            },
          ],
          assets: [],
        },
      ],
    } satisfies FsWorkspaceIndex

    const result = await rewriteMarkdownFileReferencesForRename({
      host,
      workspaceIndex,
      fromPath: 'notes/target.md',
      toPath: 'notes/final.md',
    })

    expect(result).toEqual({
      appliedEdits: 1,
      touchedFiles: ['notes/current.md'],
    })
    expect(updateBuffer).toHaveBeenCalledWith({
      path: 'notes/current.md',
      content: 'See [Target](final.md#known-heading)',
    })
  })

  it('does not rewrite self anchor links when the source file is renamed', async () => {
    const { host, updateBuffer } = createHost({
      'notes/final.md': '# Known\n\nSee [Known](#known)',
    })
    const workspaceIndex = {
      files: [
        {
          path: 'notes/current.md',
          headings: [],
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Known',
              target: '#known',
              link_type: 'markdown',
              target_path: 'notes/current.md',
              target_anchor: 'known',
              target_heading_slug: 'known',
              is_external: false,
              context: 'See [Known](#known)',
              line: 3,
              column: 5,
            },
          ],
          assets: [],
        },
      ],
    } satisfies FsWorkspaceIndex

    const result = await rewriteMarkdownFileReferencesForRename({
      host,
      workspaceIndex,
      fromPath: 'notes/current.md',
      toPath: 'notes/final.md',
    })

    expect(result).toEqual({
      appliedEdits: 0,
      touchedFiles: [],
    })
    expect(updateBuffer).not.toHaveBeenCalled()
  })
})
