import { describe, expect, it } from 'vitest'

import { buildAllPagesModel, buildAllPagesRows, defaultAllPagesFilters } from '@/logic/allPages'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'

const files = [
  { kind: 'file', path: 'notes/current.md' },
  { kind: 'file', path: 'notes/ignored.txt' },
  { kind: 'file', path: 'readme.mdx' },
] satisfies FileEntry[]

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [{ path: 'notes/current.md', level: 1, text: 'Current', slug: 'current', line: 1 }],
      links: [
        {
          column: 1,
          context: '[Missing](missing.md)',
          is_external: false,
          line: 3,
          link_type: 'markdown',
          source_path: 'notes/current.md',
          target: 'missing.md',
          target_anchor: null,
          target_heading_slug: null,
          target_path: null,
          text: 'Missing',
        },
      ],
      assets: [],
    },
    {
      path: 'ideas/archive.md',
      headings: [],
      links: [],
      assets: [
        {
          column: 1,
          context: '![Missing](image.png)',
          is_external: false,
          line: 2,
          media_type: 'image/png',
          source_path: 'ideas/archive.md',
          target: 'image.png',
          target_path: null,
          text: 'Missing',
        },
      ],
    },
  ],
} satisfies FsWorkspaceIndex

describe('allPages', () => {
  it('uses indexed markdown metadata when a workspace index is available', () => {
    expect(buildAllPagesRows(files, workspaceIndex)).toEqual([
      expect.objectContaining({
        folder: 'notes',
        headings: 1,
        issues: 1,
        links: 1,
        path: 'notes/current.md',
        title: 'Current',
      }),
      expect.objectContaining({
        assets: 1,
        folder: 'ideas',
        issues: 1,
        path: 'ideas/archive.md',
        title: 'archive.md',
      }),
    ])
  })

  it('falls back to markdown files from the file tree before indexing finishes', () => {
    expect(buildAllPagesRows(files, null)).toEqual([
      expect.objectContaining({ indexed: false, path: 'notes/current.md' }),
      expect.objectContaining({ indexed: false, path: 'readme.mdx' }),
    ])
  })

  it('filters and sorts rows for the all pages view', () => {
    const model = buildAllPagesModel(files, workspaceIndex, {
      ...defaultAllPagesFilters,
      folder: 'notes',
      issuesOnly: true,
      query: 'current',
      sort: 'issues',
    })

    expect(model.folders).toEqual(['ideas', 'notes'])
    expect(model.rows.map((row) => row.path)).toEqual(['notes/current.md'])
    expect(model.totalRows).toBe(2)
  })
})
