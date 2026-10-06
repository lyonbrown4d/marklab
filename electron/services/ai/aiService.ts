import { generateText as vercelGenerateText } from 'ai'
import pLimit, { type LimitFunction } from 'p-limit'

import { readAiEnvironment } from '@electron/services/ai/environment'
import {
  generateTextRequestSchema,
  isLoopbackHttpUrl,
  providerIdRequestSchema,
  providerUpdateSchema,
  type AiGenerateTextRequest,
} from '@electron/services/ai/schemas'
import type {
  AiEnvironment,
  AiGenerateAdapter,
  AiGenerateOptions,
  AiGenerateTextResult,
  AiModelResolverContract,
  AiProviderStoreContract,
  AiServiceContract,
  PublicAiProvider,
  StoredAiProvider,
} from '@electron/services/ai/types'

const GENERATION_TIMEOUT_MS = 120_000
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096
const MAX_CONCURRENT_GENERATIONS = 2
const MAX_GENERATION_JOBS = 8
const LOOPBACK_COMPATIBLE_API_KEY = 'ollama'

type AiServiceOptions = {
  store: AiProviderStoreContract
  resolver: AiModelResolverContract
  generate?: AiGenerateAdapter
  environment?: AiEnvironment
}

export class AiService implements AiServiceContract {
  private readonly environment: AiEnvironment
  private readonly generate: AiGenerateAdapter
  private readonly generationLimit: LimitFunction

  constructor(private readonly options: AiServiceOptions) {
    this.environment = options.environment ?? readAiEnvironment()
    this.generate = options.generate ?? generateWithVercelAiSdk
    this.generationLimit = pLimit(MAX_CONCURRENT_GENERATIONS)
  }

  async listProviders(): Promise<PublicAiProvider[]> {
    return Promise.all((await this.options.store.list()).map((provider) => this.toPublic(provider)))
  }

  async getProvider(id: string): Promise<PublicAiProvider> {
    const parsed = providerIdRequestSchema.parse({ id })
    return this.toPublic(await this.requireProvider(parsed.id))
  }

  async updateProvider(input: unknown): Promise<PublicAiProvider> {
    return this.toPublic(await this.options.store.update(providerUpdateSchema.parse(input)))
  }

  async deleteProvider(id: string): Promise<{ ok: true }> {
    const parsed = providerIdRequestSchema.parse({ id })
    return this.options.store.delete(parsed.id)
  }

  async testProvider(id: string): Promise<{ ok: true }> {
    await this.schedule(
      {
        providerId: providerIdRequestSchema.parse({ id }).id,
        prompt: 'Reply with OK.',
        maxOutputTokens: 8,
      },
      { maxRetries: 0 },
    )
    return { ok: true }
  }

  async generateText(input: unknown, abortSignal?: AbortSignal): Promise<AiGenerateTextResult> {
    return this.schedule(generateTextRequestSchema.parse(input), { maxRetries: 1 }, abortSignal)
  }

  private schedule(
    request: AiGenerateTextRequest,
    options: { maxRetries: number },
    abortSignal?: AbortSignal,
  ): Promise<AiGenerateTextResult> {
    if (
      this.generationLimit.activeCount + this.generationLimit.pendingCount >=
      MAX_GENERATION_JOBS
    ) {
      return Promise.reject(new Error('AI generation queue is full'))
    }
    return this.generationLimit(() => this.execute(request, options, abortSignal))
  }

  private async execute(
    request: AiGenerateTextRequest,
    options: { maxRetries: number },
    abortSignal?: AbortSignal,
  ): Promise<AiGenerateTextResult> {
    abortSignal?.throwIfAborted()
    const provider = await this.requireProvider(request.providerId)
    const configuredApiKey =
      (await this.options.store.resolveApiKey(provider.id)) ?? this.environment[provider.kind]
    const apiKey =
      configuredApiKey ??
      (provider.kind === 'openai-compatible' && isLoopbackHttpUrl(provider.baseUrl)
        ? LOOPBACK_COMPATIBLE_API_KEY
        : undefined)
    if (!apiKey) throw new Error('AI provider API key is not configured')
    try {
      const model = this.options.resolver.resolve(provider, apiKey)
      const result = await this.generate({
        model,
        prompt: request.prompt,
        ...(request.system === undefined ? {} : { system: request.system }),
        maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        maxRetries: options.maxRetries,
        timeout: GENERATION_TIMEOUT_MS,
        ...(abortSignal ? { abortSignal } : {}),
      })
      return { ...result, warnings: result.warnings ?? [] }
    } catch {
      throw new Error('AI provider request failed')
    }
  }

  private async requireProvider(id: string): Promise<StoredAiProvider> {
    const provider = await this.options.store.get(id)
    if (!provider) throw new Error('AI provider was not found')
    return provider
  }

  private async toPublic(provider: StoredAiProvider): Promise<PublicAiProvider> {
    const source = provider.encryptedApiKey
      ? 'stored'
      : this.environment[provider.kind]
        ? 'environment'
        : 'none'
    return {
      id: provider.id,
      label: provider.label,
      kind: provider.kind,
      model: provider.model,
      ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
      hasApiKey: source !== 'none',
      apiKeySource: source,
      maskedApiKey: source === 'none' ? null : '••••••••',
    }
  }
}

const generateWithVercelAiSdk: AiGenerateAdapter = async (options: AiGenerateOptions) => {
  const result = await vercelGenerateText(options)
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    },
    warnings: result.warnings?.map((warning) => warning.type),
  }
}
