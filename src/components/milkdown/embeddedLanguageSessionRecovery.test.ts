import { describe, expect, it, vi } from 'vitest'
import {
  createEmbeddedLanguageSession,
  type EmbeddedLanguageClient,
} from '@/components/milkdown/embeddedLanguageSession'

const createClient = () =>
  ({
    openDocument: vi.fn().mockResolvedValue(undefined),
    changeDocument: vi.fn().mockResolvedValue(undefined),
    closeDocument: vi.fn().mockResolvedValue(undefined),
    completion: vi.fn<EmbeddedLanguageClient['completion']>().mockResolvedValue([]),
  }) satisfies EmbeddedLanguageClient

const uri = 'marklab-embedded://document/mermaid-recovery'

describe('embedded language session recovery', () => {
  it('reopens the complete local snapshot before completion after open failure', async () => {
    const client = createClient()
    const onError = vi.fn()
    client.openDocument.mockRejectedValueOnce(new Error('open failed'))
    const session = createEmbeddedLanguageSession({
      client,
      uri,
      languageId: 'mermaid',
      text: 'graph TD',
      onError,
    })

    await session.completion({ line: 0, character: 8 })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'open failed' }))
    expect(client.closeDocument).toHaveBeenCalledWith({ uri })
    expect(client.openDocument).toHaveBeenLastCalledWith({
      uri,
      languageId: 'mermaid',
      version: 1,
      text: 'graph TD',
    })
    expect(client.openDocument).toHaveBeenCalledTimes(2)
  })

  it('reopens the latest snapshot instead of sending another delta after change failure', async () => {
    const client = createClient()
    const onError = vi.fn()
    client.changeDocument.mockRejectedValueOnce(new Error('change failed'))
    const session = createEmbeddedLanguageSession({
      client,
      uri,
      languageId: 'mermaid',
      text: 'graph',
      onError,
    })
    session.change([
      {
        range: {
          start: { line: 0, character: 5 },
          end: { line: 0, character: 5 },
        },
        text: ' TD',
      },
    ])
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())

    session.change([
      {
        range: {
          start: { line: 0, character: 8 },
          end: { line: 0, character: 8 },
        },
        text: '\nA --> B',
      },
    ])
    await session.completion({ line: 1, character: 7 })

    expect(client.closeDocument).toHaveBeenCalledWith({ uri })
    expect(client.openDocument).toHaveBeenLastCalledWith({
      uri,
      languageId: 'mermaid',
      version: 3,
      text: 'graph TD\nA --> B',
    })
    expect(client.changeDocument).toHaveBeenCalledTimes(1)
  })
})
