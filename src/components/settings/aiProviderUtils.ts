import type { PublicAiProvider } from '@/services/aiApi'

export const isAiProviderUsable = (provider: PublicAiProvider) => provider.available

export const createAiProviderId = (mode: 'ollama' | 'compatible' | 'cloud') =>
  `${mode}-${crypto.randomUUID()}`

export const isOllamaPreset = (provider: PublicAiProvider) =>
  provider.id === 'ollama-local' ||
  (provider.kind === 'openai-compatible' && provider.baseUrl === 'http://127.0.0.1:11434/v1')
