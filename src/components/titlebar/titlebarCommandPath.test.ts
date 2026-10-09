import { describe, expect, it } from 'vitest'
import { resolveCommandNewWindowPath } from '@/components/titlebar/titlebarCommandPath'

describe('resolveCommandNewWindowPath', () => {
  it('resolves a workspace-relative result below the current project root', () => {
    expect(
      resolveCommandNewWindowPath({
        path: 'docs/Guide.md',
        rootKind: 'external',
        rootPath: 'C:/notes',
      }),
    ).toBe('C:/notes/docs/Guide.md')
  })

  it('opens the configured file for a single-file workspace', () => {
    expect(
      resolveCommandNewWindowPath({
        path: 'Guide.md',
        rootKind: 'single',
        rootPath: 'C:/notes/Guide.md',
      }),
    ).toBe('C:/notes/Guide.md')
  })

  it('normalizes parent traversal from search result paths', () => {
    expect(
      resolveCommandNewWindowPath({
        path: '../../outside.md',
        rootKind: 'external',
        rootPath: 'C:/notes',
      }),
    ).toBe('C:/notes/outside.md')
  })
})
