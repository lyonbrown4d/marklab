import type { CompletionList } from 'vscode-languageserver-types'
import { describe, expect, it, vi } from 'vitest'
import type { EmbeddedLanguageClient } from '@/components/editor/language/embeddedLanguageSession'
import {
  createIncrementalTextChange,
  createPlateCodeCompletionController,
} from '@/components/plate/code/plateCodeCompletionController'

const completionList = (label: string): CompletionList => ({
  isIncomplete: false,
  items: [{ label }],
})

describe('createIncrementalTextChange', () => {
  it('creates a minimal multiline LSP edit', () => {
    expect(createIncrementalTextChange('graph TD\nA --> B', 'graph TD\nA --> C')).toEqual({
      range: {
        start: { line: 1, character: 6 },
        end: { line: 1, character: 7 },
      },
      rangeLength: 1,
      text: 'C',
    })
  })

  it('returns null for unchanged text', () => {
    expect(createIncrementalTextChange('graph TD', 'graph TD')).toBeNull()
  })
})

describe('createPlateCodeCompletionController', () => {
  it('keeps only the newest completion response and cancels after close', async () => {
    const resolvers: Array<(value: CompletionList) => void> = []
    const client: EmbeddedLanguageClient = {
      openDocument: vi.fn().mockResolvedValue(undefined),
      changeDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
      completion: vi.fn(() => new Promise<CompletionList>((resolve) => resolvers.push(resolve))),
    }
    const onCompletions = vi.fn()
    const controller = createPlateCodeCompletionController({
      client,
      uri: 'marklab-embedded://plate/1.mermaid',
      languageId: 'mermaid',
      text: 'graph TD',
      onCompletions,
    })

    const first = controller.complete({ line: 0, character: 2 })
    const second = controller.complete({ line: 0, character: 3 })
    await vi.waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]?.(completionList('graph'))
    await second
    resolvers[0]?.(completionList('flowchart'))
    await first

    expect(onCompletions).toHaveBeenCalledOnce()
    expect(onCompletions).toHaveBeenCalledWith(completionList('graph').items)

    await controller.close()
    await controller.complete({ line: 0, character: 4 })
    expect(client.completion).toHaveBeenCalledTimes(2)
  })
})
