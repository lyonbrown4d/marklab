import { describe, expect, it, vi } from 'vitest'
import { WorkspaceNativeSearchBackend } from '@electron/services/workspace/workspaceNativeSearchBackend.js'
import type {
  NativeSearchIndex,
  NativeSearchModule,
} from '@electron/services/workspace/workspaceNativeSearchModule.js'

const createNativeIndex = (overrides: Partial<NativeSearchIndex> = {}) => {
  const index: NativeSearchIndex = {
    close: vi.fn(),
    hasDocuments: vi.fn(() => true),
    open: vi.fn(),
    rebuild: vi.fn(),
    removeDocument: vi.fn(),
    removePathPrefix: vi.fn(),
    search: vi.fn(() => [
      {
        column: 2,
        endColumn: 6,
        line: 3,
        path: 'notes/native.md',
        score: 12,
        snippet: 'native search',
        snippetHighlights: [{ start: 0, end: 6 }],
        title: 'Native',
      },
    ]),
    upsertDocument: vi.fn(),
    ...overrides,
  }
  return index
}

const createBackend = (index: NativeSearchIndex | null) => {
  if (!index) return new WorkspaceNativeSearchBackend(() => null)
  const nativeIndex = index

  const MockNativeSearchIndex = function MockNativeSearchIndex() {
    return nativeIndex
  } as unknown as new () => NativeSearchIndex

  const nativeModule: NativeSearchModule = {
    NativeSearchIndex: MockNativeSearchIndex,
  }
  return new WorkspaceNativeSearchBackend(() => nativeModule)
}

describe('WorkspaceNativeSearchBackend', () => {
  it('stays unavailable when the native module cannot be loaded', () => {
    const backend = createBackend(null)

    expect(backend.open('index')).toBe(false)
    expect(backend.search('native', 10)).toBeNull()
  })

  it('normalizes native search results to workspace search results', () => {
    const index = createNativeIndex()
    const backend = createBackend(index)

    expect(backend.open('index')).toBe(true)
    expect(backend.search('native', 10)).toEqual([
      {
        column: 2,
        end_column: 6,
        line: 3,
        path: 'notes/native.md',
        score: 12,
        snippet: 'native search',
        snippet_highlights: [{ start: 0, end: 6 }],
        title: 'Native',
      },
    ])
  })

  it('surfaces native operation failures to the caller', () => {
    const index = createNativeIndex({
      search: vi.fn(() => {
        throw new Error('native failed')
      }),
    })
    const backend = createBackend(index)

    expect(backend.open('index')).toBe(true)
    expect(() => backend.search('native', 10)).toThrow('native failed')
  })
})
