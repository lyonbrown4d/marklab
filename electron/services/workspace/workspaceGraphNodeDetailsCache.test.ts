import { describe, expect, it } from 'vitest'
import { WorkspaceGraphNodeDetailsCache } from '@electron/services/workspace/workspaceGraphNodeDetailsCache'

describe('WorkspaceGraphNodeDetailsCache', () => {
  it('reuses details for the same revision and invalidates on revision change', () => {
    const cache = new WorkspaceGraphNodeDetailsCache()
    const query = { mode: 'summary' as const, node_ids: ['file:a.md'] }
    const first = cache.query('revision-1', [{ path: 'a.md', content: '# A\n\nOld' }], query)
    const cached = cache.query('revision-1', [{ path: 'a.md', content: '# A\n\nIgnored' }], query)
    const fresh = cache.query('revision-2', [{ path: 'a.md', content: '# A\n\nNew' }], query)

    expect(cached).toBe(first)
    expect(first).toMatchObject({ revision: 'revision-1', items: [{ content: 'Old' }] })
    expect(fresh).toMatchObject({ revision: 'revision-2', items: [{ content: 'New' }] })
  })
})
