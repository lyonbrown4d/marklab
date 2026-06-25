import { describe, expect, it, vi } from 'vitest'

import { EmbeddedMarkdownLanguageService } from '@electron/services/markdownLanguage/service.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'

const workspaceIndex = {
  files: [
    {
      path: 'notes/current.md',
      headings: [],
      links: [],
      assets: [],
    },
    {
      path: 'notes/target.md',
      headings: [
        {
          path: 'notes/target.md',
          level: 1,
          text: 'Known',
          slug: 'known',
          line: 1,
          column: 1,
        },
      ],
      links: [],
      assets: [],
    },
  ],
  paths: ['notes/current.md', 'notes/target.md', 'assets/logo.png'],
  asset_paths: ['assets/logo.png'],
} satisfies FsWorkspaceIndex

describe('EmbeddedMarkdownLanguageService diagnostics', () => {
  it('uses the workspace index with current buffer content for link and asset diagnostics', async () => {
    const workspaceIndexMock = vi.fn(async () => workspaceIndex)
    const analyzeMarkdownBuffer = vi.fn(async () => [])
    const workspace = {
      workspaceIndex: workspaceIndexMock,
      analyzeMarkdownBuffer,
      onSnapshotChanged: vi.fn(() => () => undefined),
      onBufferStatus: vi.fn(() => () => undefined),
    } as unknown as WorkspaceService

    const diagnostics = await new EmbeddedMarkdownLanguageService().getDiagnostics(workspace, {
      path: 'notes/current.md',
      content: [
        '# Draft',
        '',
        'See [Missing](missing.md).',
        'See [Bad Heading](target.md#gone).',
        '![Missing Asset](../assets/missing.png)',
        '![Logo](../assets/logo.png)',
      ].join('\n'),
    })

    expect(workspaceIndexMock).toHaveBeenCalledTimes(1)
    expect(analyzeMarkdownBuffer).not.toHaveBeenCalled()
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 3,
          message: 'Cannot find linked file "missing.md"',
          severity: 'error',
        }),
        expect.objectContaining({
          line: 4,
          message: 'Cannot find heading "gone" in notes/target.md',
          severity: 'warning',
        }),
        expect.objectContaining({
          line: 5,
          message: 'Cannot find local asset "../assets/missing.png"',
          severity: 'error',
        }),
      ]),
    )
  })
})
