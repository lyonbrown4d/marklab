import type { Llama, LlamaContext, LlamaModel } from 'node-llama-cpp'

import type { LocalAiEventHandler, LocalAiRuntimeRequest } from '@electron/services/ai/local/types'

type NodeLlamaBindings = typeof import('node-llama-cpp')
type LlamaEngineOptions = { loadBindings?: () => Promise<NodeLlamaBindings> }

const DEFAULT_CONTEXT_SIZE = 4_096
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048

export class LlamaEngine {
  private readonly loadBindings: () => Promise<NodeLlamaBindings>
  private bindings: NodeLlamaBindings | null = null
  private llama: Llama | null = null
  private model: LlamaModel | null = null
  private context: LlamaContext | null = null
  private modelPath: string | null = null

  constructor(options: LlamaEngineOptions = {}) {
    this.loadBindings = options.loadBindings ?? (() => import('node-llama-cpp'))
  }

  async generate(
    request: LocalAiRuntimeRequest,
    emit: LocalAiEventHandler,
    signal: AbortSignal,
  ): Promise<void> {
    await this.ensureModel(request.modelPath)
    const bindings = this.bindings
    const context = this.context
    const model = this.model
    if (!bindings || !context || !model) throw new Error('Local AI model failed to initialize')

    const sequence = context.getSequence()
    const session = new bindings.LlamaChatSession({
      contextSequence: sequence,
      ...(request.system ? { systemPrompt: request.system } : {}),
    })
    let output = ''
    try {
      const result = await session.promptWithMeta(request.prompt, {
        signal,
        maxTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        onTextChunk: (delta) => {
          output += delta
          emit({ requestId: request.requestId, type: 'delta', delta })
        },
      })
      const inputTokens = model.tokenize(
        request.system ? `${request.system}\n${request.prompt}` : request.prompt,
      ).length
      const outputTokens = model.tokenize(output).length
      emit({
        requestId: request.requestId,
        type: 'finish',
        finishReason: result.stopReason === 'maxTokens' ? 'length' : 'stop',
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        warnings: [],
      })
    } finally {
      session.dispose()
      sequence.dispose()
    }
  }

  async dispose(): Promise<void> {
    await this.context?.dispose()
    await this.model?.dispose()
    await this.llama?.dispose()
    this.context = null
    this.model = null
    this.llama = null
    this.bindings = null
    this.modelPath = null
  }

  private async ensureModel(modelPath: string): Promise<void> {
    if (this.modelPath === modelPath && this.context && this.model) return
    await this.dispose()
    const bindings = await this.loadBindings()
    const llama = await bindings.getLlama({ build: 'never' })
    const model = await llama.loadModel({ modelPath })
    const context = await model.createContext({ contextSize: DEFAULT_CONTEXT_SIZE, sequences: 1 })
    this.bindings = bindings
    this.llama = llama
    this.model = model
    this.context = context
    this.modelPath = modelPath
  }
}
