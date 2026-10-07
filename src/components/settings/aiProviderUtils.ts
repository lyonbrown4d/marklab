import type { AiProviderUpdate, PublicAiProvider } from '@/services/aiApi'

export type AiProviderKind = AiProviderUpdate['kind']

type AiProviderOption = {
  kind: AiProviderKind
  label: string
  defaultBaseUrl?: string
}

export const aiProviderOptions: readonly AiProviderOption[] = [
  { kind: 'openai', label: 'OpenAI' },
  { kind: 'anthropic', label: 'Anthropic' },
  { kind: 'google', label: 'Google' },
  { kind: 'deepseek', label: 'DeepSeek' },
  {
    kind: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://127.0.0.1:11434/v1',
  },
  { kind: 'openai-compatible', label: 'OpenAI-compatible' },
]

export const getAiProviderOption = (kind: AiProviderKind) =>
  aiProviderOptions.find((option) => option.kind === kind)!

export const aiProviderUsesBaseUrl = (kind: AiProviderKind) =>
  kind === 'ollama' || kind === 'openai-compatible'

export const isAiProviderUsable = (provider: PublicAiProvider) => provider.available

export const createAiProviderId = (kind: AiProviderKind, suffix = crypto.randomUUID()) =>
  `${kind}-${suffix}`
