import { describe, expect, it } from 'vitest'

import { createClientFixture } from '@electron/services/knowledgeEngine/grpcClient.testFixture.js'

describe('KnowledgeEngineGrpcClient', () => {
  it('opens a workspace with session token metadata', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()

    await client.openWorkspace('index-a')
    client.close()

    expect(fixture.calls.openWorkspace?.request).toEqual({ indexPath: 'index-a' })
    expect(fixture.calls.openWorkspace?.metadata.get('x-marklab-session-token')).toEqual([
      'session-token-a',
    ])
    expect(fixture.close.control).toHaveBeenCalledTimes(1)
    expect(fixture.close.documentSession).toHaveBeenCalledTimes(1)
    expect(fixture.close.markdown).toHaveBeenCalledTimes(1)
    expect(fixture.close.workspace).toHaveBeenCalledTimes(1)
    expect(fixture.close.searchClient).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the index with typed workspace documents', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()
    const documents = [{ content: '# Alpha', path: 'alpha.md', title: 'Alpha' }]

    await client.rebuildIndex(documents)

    expect(fixture.calls.rebuildIndex?.request).toEqual({ documents })
    expect(fixture.calls.rebuildIndex?.metadata.get('x-marklab-session-token')).toEqual([
      'session-token-a',
    ])
  })

  it('syncs markdown overlay documents over a typed duplex stream', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()

    await expect(
      client.openMarkdownDocument('workspace-instance-a', {
        content: '# Alpha',
        documentId: 'alpha.md',
        uri: 'file:///workspace/alpha.md',
        version: 1,
      }),
    ).resolves.toEqual({ acknowledged: { documentId: 'alpha.md', version: '1' } })

    expect(fixture.calls.sync?.request).toEqual({
      open: {
        content: '# Alpha',
        documentId: 'alpha.md',
        uri: 'file:///workspace/alpha.md',
        version: '1',
      },
      workspaceInstanceId: 'workspace-instance-a',
    })
    expect(fixture.calls.sync?.metadata.get('x-marklab-session-token')).toEqual(['session-token-a'])
  })

  it('queries markdown symbols and links through markdown service', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()

    await expect(client.getMarkdownDocumentSymbols('alpha.md', 2)).resolves.toEqual([
      {
        kind: 12,
        level: 1,
        name: 'Alpha',
        range: undefined,
        slug: 'alpha',
      },
    ])
    await expect(client.getMarkdownLinks('alpha.md', 2)).resolves.toEqual([
      {
        isExternal: false,
        range: undefined,
        sourceDocumentId: 'alpha.md',
        target: 'beta.md',
        text: 'Beta',
      },
    ])

    expect(fixture.calls.getDocumentSymbols?.request).toEqual({
      documentId: 'alpha.md',
      documentVersion: '2',
    })
    expect(fixture.calls.getLinks?.request).toEqual({
      documentId: 'alpha.md',
      documentVersion: '2',
    })
  })

  it('collects streamed search results', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()

    const results = await client.search('alpha', 5)

    expect(fixture.calls.search?.request).toMatchObject({ limit: 5, query: 'alpha' })
    expect(fixture.calls.search?.metadata.get('x-marklab-session-token')).toEqual([
      'session-token-a',
    ])
    expect(results).toEqual([
      {
        column: 1,
        end_column: 7,
        line: 3,
        path: 'alpha.md',
        score: 0.75,
        snippet: 'Alpha body',
        snippet_highlights: [{ end: 5, start: 0 }],
        title: 'Alpha',
      },
    ])
  })

  it('sends shutdown with a typed reason', async () => {
    const fixture = createClientFixture()
    const client = fixture.createClient()

    await client.shutdown('test complete')

    expect(fixture.calls.shutdown?.request).toEqual({ reason: 'test complete' })
    expect(fixture.calls.shutdown?.metadata.get('x-marklab-session-token')).toEqual([
      'session-token-a',
    ])
  })
})
