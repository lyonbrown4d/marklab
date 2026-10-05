import { describe, expect, it } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'

describe('NodeSearchIndex result snippets', () => {
  it('keeps terms distributed across title, path, and content visible to result filtering', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      {
        path: '.\\Notes\\Café Plan.md',
        title: 'Résumé',
        content: 'Launch details live here.',
      },
      { path: 'notes/cafe-only.md', title: 'Cafe', content: 'Unrelated draft' },
    ])

    const result = await index.search('resume café launch')

    expect(result.totalHits).toBe(1)
    expect(result.results).toMatchObject([
      {
        path: 'Notes/Café Plan.md',
        title: 'Résumé',
        snippet: 'Launch details live here.',
        score: 24,
      },
    ])
  })

  it('prefers a content line containing all terms when the title is only a partial match', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      {
        path: 'Topic-07.md',
        title: 'Topic 07',
        content: '# Topic 07\n\nTopic 07 contains searchable content.',
      },
    ])

    const result = await index.search('Topic 07 contains')

    expect(result.results[0]).toMatchObject({
      path: 'Topic-07.md',
      line: 3,
      snippet: 'Topic 07 contains searchable content.',
    })
  })
})
