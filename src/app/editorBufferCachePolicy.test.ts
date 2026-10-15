import { describe, expect, it } from 'vitest'
import {
  EDITOR_BUFFER_CACHE_LIMITS,
  estimateEditorTextBytes,
  getEditorBufferEvictions,
  type EditorBufferCacheEntry,
} from '@/app/editorBufferCachePolicy'

const entry = (
  path: string,
  overrides: Partial<EditorBufferCacheEntry> = {},
): EditorBufferCacheEntry => ({
  workspace: 'current',
  path,
  content: path,
  lastActive: 0,
  ...overrides,
})

describe('editor buffer retention', () => {
  it('drops saved closed documents and old workspaces, retaining an active graph editor without a tab', () => {
    const closed = entry('closed.md')
    const old = entry('same.md', { workspace: 'old' })
    const active = entry('graph.md')
    const recent = entry('same.md')
    expect(
      getEditorBufferEvictions([closed, old, active, recent], 'current', 'graph.md', ['same.md']),
    ).toEqual([closed, old])
  })

  it.each([
    { dirty: true },
    { loading: true },
    { pending: true },
    { saveState: { status: 'saving' } },
    { saveState: { status: 'error' } },
    { saveState: { status: 'unsaved' } },
  ] as const)('protects closed and old buffers with %o', (protection) => {
    const protectedBuffer = entry('draft.md', { workspace: 'old', ...protection })
    expect(getEditorBufferEvictions([protectedBuffer], 'current', null, [])).toEqual([])
  })

  it('evicts the least recent clean open buffers by document count', () => {
    const files = Array.from({ length: EDITOR_BUFFER_CACHE_LIMITS.maxDocuments + 1 }, (_, index) =>
      entry(`${index}.md`, { lastActive: index }),
    )
    expect(
      getEditorBufferEvictions(
        files,
        'current',
        '6.md',
        files.map((file) => file.path),
      ),
    ).toEqual([files[0]])
  })

  it('accounts for large documents without encoding copies and protects an oversized active document', () => {
    const large = entry('large.md', {
      content: 'x'.repeat(EDITOR_BUFFER_CACHE_LIMITS.maxTextBytes / 2),
      lastActive: 1,
    })
    const small = entry('small.md', { lastActive: 2 })
    expect(estimateEditorTextBytes('中文😀')).toBe(8)
    expect(
      getEditorBufferEvictions([large, small], 'current', 'small.md', ['large.md', 'small.md']),
    ).toEqual([large])
    expect(
      getEditorBufferEvictions([large, small], 'current', 'large.md', ['large.md', 'small.md']),
    ).toEqual([small])
  })
})
