import { describe, expect, it, vi } from 'vitest'
import { combineGraphAsyncState } from '@/app/combineGraphAsyncState'

const state = (overrides: Record<string, unknown> = {}) => ({
  error: null,
  loading: false,
  refreshing: false,
  retry: vi.fn(async () => undefined),
  ...overrides,
})

describe('combineGraphAsyncState', () => {
  it('includes index state only for the workspace graph', () => {
    const index = state({ error: new Error('index'), loading: true, refreshing: true })
    const graph = state()

    expect(combineGraphAsyncState(true, index, graph)).toMatchObject({
      error: index.error,
      loading: true,
      refreshing: true,
      retry: index.retry,
    })
    expect(combineGraphAsyncState(false, index, graph)).toMatchObject({
      error: null,
      loading: false,
      refreshing: false,
      retry: graph.retry,
    })
  })
})
