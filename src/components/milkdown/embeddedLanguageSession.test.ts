import type { Position } from 'vscode-languageserver-types'
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
    diagnostics: vi.fn<NonNullable<EmbeddedLanguageClient['diagnostics']>>().mockResolvedValue([]),
  }) satisfies EmbeddedLanguageClient

const position = { line: 2, character: 5 } satisfies Position

describe('embedded language document session', () => {
  it('opens only the fenced block and sends metadata-only completion requests', async () => {
    const client = createClient()
    client.completion.mockResolvedValue([{ label: 'sequenceDiagram' }])
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://document/mermaid-1',
      languageId: 'mermaid',
      text: 'sequence',
    })

    const result = await session.completion(position)

    expect(client.openDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://document/mermaid-1',
      languageId: 'mermaid',
      version: 1,
      text: 'sequence',
    })
    expect(client.completion).toHaveBeenCalledWith({
      uri: 'marklab-embedded://document/mermaid-1',
      languageId: 'mermaid',
      version: 1,
      position,
    })
    expect(client.completion.mock.calls[0]?.[0]).not.toHaveProperty('text')
    expect(client.completion.mock.calls[0]?.[0]).not.toHaveProperty('content')
    expect(result).toEqual([{ label: 'sequenceDiagram' }])
  })

  it('increments the version and sends incremental changes before completion', async () => {
    const client = createClient()
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://document/mermaid-2',
      languageId: 'mermaid',
      text: 'graph TD',
    })
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

    expect(client.changeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://document/mermaid-2',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 },
          },
          text: '\nA --> B',
        },
      ],
    })
    expect(client.completion).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, position: { line: 1, character: 7 } }),
    )
  })

  it('keeps a completion bound to the synchronized version when a newer edit arrives', async () => {
    let releaseFirstChange!: () => void
    const client = createClient()
    client.changeDocument
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstChange = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://document/mermaid-version',
      languageId: 'mermaid',
      text: 'graph',
    })
    const firstChange = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 5 },
      },
      text: ' T',
    }
    session.change([firstChange])
    const completion = session.completion({ line: 0, character: 7 })
    session.change([{ ...firstChange, text: 'D' }])
    await vi.waitFor(() => expect(client.changeDocument).toHaveBeenCalledOnce())

    releaseFirstChange()
    await completion

    expect(client.completion).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }))
  })

  it('supports diagnostics and closes the virtual document once', async () => {
    const client = createClient()
    client.diagnostics.mockResolvedValue([
      {
        range: { start: position, end: position },
        message: 'Expected an arrow',
      },
    ])
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://document/mermaid-3',
      languageId: 'mermaid',
      text: 'graph TD',
    })

    await expect(session.diagnostics()).resolves.toHaveLength(1)
    await Promise.all([session.close(), session.close()])

    expect(client.closeDocument).toHaveBeenCalledOnce()
    expect(client.closeDocument).toHaveBeenCalledWith({
      uri: 'marklab-embedded://document/mermaid-3',
    })
  })

  it('reports lifecycle failures without poisoning later session requests', async () => {
    const client = createClient()
    const onError = vi.fn()
    client.openDocument.mockRejectedValueOnce(new Error('open failed'))
    const session = createEmbeddedLanguageSession({
      client,
      uri: 'marklab-embedded://document/mermaid-recovery',
      languageId: 'mermaid',
      text: 'graph',
      onError,
    })

    await session.completion({ line: 0, character: 5 })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'open failed' }))
    expect(client.completion).toHaveBeenCalledOnce()
  })
})
