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
  it('delegates diagnostics to workspace analysis so the Node sidecar can supplement results', async () => {
    const workspaceIndexMock = vi.fn(async () => workspaceIndex)
    const analyzeMarkdownBuffer = vi.fn(async () => [
      {
        end_column: 10,
        line: 1,
        message: "No link definition found: 'missing'",
        severity: 'warning' as const,
        start_column: 5,
      },
    ])
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

    expect(workspaceIndexMock).not.toHaveBeenCalled()
    expect(analyzeMarkdownBuffer).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'notes/current.md' }),
    )
    expect(diagnostics).toEqual([
      expect.objectContaining({ message: "No link definition found: 'missing'" }),
    ])
  })
})
