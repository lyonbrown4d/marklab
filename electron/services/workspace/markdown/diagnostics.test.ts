import { describe, expect, it } from 'vitest'

import { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'

const markdownFile = {
  path: 'notes/current.md',
  headings: [],
  assets: [],
}

describe('diagnosticsForFile', () => {
  it('does not report existing non-markdown local links as broken markdown links', () => {
    const index = {
      files: [
        {
          ...markdownFile,
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Spec',
              target: '../docs/spec.pdf',
              link_type: 'markdown',
              target_path: 'docs/spec.pdf',
              is_external: false,
              context: 'See [Spec](../docs/spec.pdf)',
              line: 1,
              column: 5,
            },
          ],
        },
      ],
      paths: ['notes/current.md', 'docs/spec.pdf'],
      asset_paths: ['docs/spec.pdf'],
    } satisfies FsWorkspaceIndex

    expect(diagnosticsForFile(index, 'notes/current.md')).toEqual([])
  })

  it('warns when existing non-markdown local links differ only by path casing', () => {
    const index = {
      files: [
        {
          ...markdownFile,
          links: [
            {
              source_path: 'notes/current.md',
              text: 'Spec',
              target: '../Docs/Spec.pdf',
              link_type: 'markdown',
              target_path: 'Docs/Spec.pdf',
              is_external: false,
              context: 'See [Spec](../Docs/Spec.pdf)',
              line: 1,
              column: 5,
            },
          ],
        },
      ],
      paths: ['notes/current.md', 'docs/spec.pdf'],
      asset_paths: ['docs/spec.pdf'],
    } satisfies FsWorkspaceIndex

    expect(diagnosticsForFile(index, 'notes/current.md')).toEqual([
      expect.objectContaining({
        line: 1,
        message: 'Linked file path casing differs from workspace path "docs/spec.pdf"',
        severity: 'warning',
      }),
    ])
  })
})
