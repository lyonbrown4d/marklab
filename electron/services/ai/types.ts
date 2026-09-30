import type { LanguageModel } from 'ai'

import type {
  AiGenerateTextRequest,
  AiProviderUpdate,
  aiProviderKindSchema,
} from '@electron/services/ai/schemas.js'
import type { z } from 'zod'

export type AiProviderKind = z.infer<typeof aiProviderKindSchema>

export type StoredAiProvider = Omit<AiProviderUpdate, 'apiKey'> & {
  createdAt: string
  updatedAt: string
  encryptedApiKey?: string
}

export type PublicAiProvider = Omit<StoredAiProvider, 'encryptedApiKey'> & {
  hasApiKey: boolean
  apiKeySource: 'stored' | 'environment' | 'none'
  maskedApiKey: '••••••••' | null
}

export type AiEnvironment = Record<AiProviderKind, string | undefined>

export type AiProviderStoreContract = {
  list: () => Promise<StoredAiProvider[]>
  get: (id: string) => Promise<StoredAiProvider | null>
  update: (input: AiProviderUpdate) => Promise<StoredAiProvider>
  delete: (id: string) => Promise<{ ok: true }>
  resolveApiKey: (id: string) => Promise<string | null>
}

export type AiModelResolverContract = {
  resolve: (provider: StoredAiProvider, apiKey: string) => LanguageModel
}

export type AiGenerateOptions = Pick<
  AiGenerateTextRequest,
  'prompt' | 'system' | 'maxOutputTokens' | 'temperature'
> & {
  model: LanguageModel
  maxRetries: number
  timeout: number
}

export type AiGenerateAdapterResult = {
  text: string
  finishReason: string
  usage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  warnings?: string[]
}

export type AiGenerateAdapter = (options: AiGenerateOptions) => Promise<AiGenerateAdapterResult>

export type AiGenerateTextResult = AiGenerateAdapterResult & { warnings: string[] }

export type AiServiceContract = {
  listProviders: () => Promise<PublicAiProvider[]>
  getProvider: (id: string) => Promise<PublicAiProvider>
  updateProvider: (input: unknown) => Promise<PublicAiProvider>
  deleteProvider: (id: string) => Promise<{ ok: true }>
  testProvider: (id: string) => Promise<{ ok: true }>
  generateText: (input: unknown) => Promise<AiGenerateTextResult>
}

export type AiSafeStorage = {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (encrypted: Buffer) => string
  isAsyncEncryptionAvailable?: () => Promise<boolean>
  encryptStringAsync?: (plainText: string) => Promise<Buffer>
  decryptStringAsync?: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>
}
