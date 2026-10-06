import { describe, expect, it, vi } from 'vitest'

import { LlamaEngine } from '@electron/services/ai/local/llamaEngine'

describe('LlamaEngine', () => {
  it('streams text from node-llama-cpp and reports bounded usage', async () => {
    const emit = vi.fn()
    const session = {
      dispose: vi.fn(),
      promptWithMeta: vi.fn(
        async (_prompt: string, options: { onTextChunk: (text: string) => void }) => {
          options.onTextChunk('你好')
          return { responseText: '你好', stopReason: 'eogToken' }
        },
      ),
    }
    const sequence = { dispose: vi.fn() }
    const context = { dispose: vi.fn(), getSequence: vi.fn(() => sequence) }
    const model = {
      createContext: vi.fn(async () => context),
      dispose: vi.fn(),
      tokenize: vi.fn((text: string) => [...text]),
    }
    const llama = { dispose: vi.fn(), loadModel: vi.fn(async () => model) }
    const SessionConstructor = vi.fn(function SessionConstructor() {
      return session
    })
    const engine = new LlamaEngine({
      loadBindings: vi.fn(async () => ({
        LlamaChatSession: SessionConstructor,
        getLlama: vi.fn(async () => llama),
      })) as never,
    })

    await engine.generate(
      { requestId: 'r1', modelPath: 'model.gguf', prompt: '重写', maxOutputTokens: 20 },
      emit,
      new AbortController().signal,
    )

    expect(emit).toHaveBeenCalledWith({ requestId: 'r1', type: 'delta', delta: '你好' })
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'r1',
        type: 'finish',
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 },
      }),
    )
    expect(session.dispose).toHaveBeenCalledOnce()
    expect(sequence.dispose).toHaveBeenCalledOnce()
  })
})
