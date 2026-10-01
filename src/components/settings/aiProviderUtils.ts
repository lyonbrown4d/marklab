import type { PublicAiProvider } from '@/services/aiApi'

const isLoopbackHost = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1') return true
  const parts = host.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part))
}

export const isLoopbackHttpUrl = (value?: string) => {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

export const isAiProviderUsable = (provider: PublicAiProvider) =>
  provider.hasApiKey ||
  (provider.kind === 'openai-compatible' && isLoopbackHttpUrl(provider.baseUrl))

export const createAiProviderId = (mode: 'ollama' | 'compatible' | 'cloud') =>
  `${mode}-${crypto.randomUUID()}`

export const isOllamaPreset = (provider: PublicAiProvider) =>
  provider.id === 'ollama-local' ||
  (provider.kind === 'openai-compatible' && provider.baseUrl === 'http://127.0.0.1:11434/v1')
