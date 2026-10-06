import { describe, expect, it, vi } from 'vitest'

import { buildNodeSearchDocuments } from '@electron/services/knowledgeEngine/nodeSearchBuild'
import { normalizeSearchDocument } from '@electron/services/knowledgeEngine/nodeSearchIndexSupport'

describe('buildNodeSearchDocuments', () => {
  it('normalizes and deduplicates documents in bounded yielding chunks', async () => {
    const yieldControl = vi.fn(async () => undefined)

    const built = await buildNodeSearchDocuments(
      [
        { path: '.\\notes\\one.md', title: 'Old', content: 'old' },
        { path: 'notes/two.md', title: 'Two', content: 'two' },
        { path: 'notes/one.md', title: 'Current', content: 'current' },
      ],
      normalizeSearchDocument,
      { chunkSize: 1, yieldControl },
      () => true,
    )

    expect(yieldControl).toHaveBeenCalledTimes(2)
    expect(built).toEqual([
      { path: 'notes/one.md', title: 'Current', content: 'current' },
      { path: 'notes/two.md', title: 'Two', content: 'two' },
    ])
  })

  it('stops before publishing when the rebuild is cancelled', async () => {
    let current = true
    const yieldControl = vi.fn(async () => {
      current = false
    })

    const built = await buildNodeSearchDocuments(
      [
        { path: 'one.md', title: 'One', content: 'one' },
        { path: 'two.md', title: 'Two', content: 'two' },
      ],
      normalizeSearchDocument,
      { chunkSize: 1, yieldControl },
      () => current,
    )

    expect(built).toBeNull()
  })
})
