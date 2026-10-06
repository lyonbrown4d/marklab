import { isIP } from 'node:net'

export const AI_PROVIDER_KINDS = Object.freeze([
  'openai',
  'anthropic',
  'google',
  'openai-compatible',
] as const)

export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number]
export type AiProviderLocality = 'local' | 'remote'

export type AiProviderConfig = {
  id: string
  kind: AiProviderKind
  model: string
  baseUrl?: string
}

export type AiProviderPolicy = Readonly<{
  kind: AiProviderKind
  environmentVariable?: string
  baseUrlPolicy: 'forbidden' | 'required'
  getLocality: (provider: AiProviderConfig) => AiProviderLocality
  requiresApiKey: (provider: AiProviderConfig) => boolean
  resolveApiKey: (provider: AiProviderConfig, configured: string | undefined) => string | undefined
}>

const remotePolicy = (
  kind: Exclude<AiProviderKind, 'openai-compatible'>,
  environmentVariable: string,
): AiProviderPolicy =>
  Object.freeze({
    kind,
    environmentVariable,
    baseUrlPolicy: 'forbidden' as const,
    getLocality: () => 'remote' as const,
    requiresApiKey: () => true,
    resolveApiKey: (_provider: AiProviderConfig, configured: string | undefined) => configured,
  })

const compatiblePolicy: AiProviderPolicy = Object.freeze({
  kind: 'openai-compatible',
  baseUrlPolicy: 'required',
  getLocality: (provider: AiProviderConfig) =>
    isLoopbackProviderUrl(provider.baseUrl) ? 'local' : 'remote',
  requiresApiKey: (provider: AiProviderConfig) => !isLoopbackProviderUrl(provider.baseUrl),
  resolveApiKey: (provider: AiProviderConfig, configured: string | undefined) =>
    configured ?? (isLoopbackProviderUrl(provider.baseUrl) ? 'ollama' : undefined),
})

const policies = new Map<AiProviderKind, AiProviderPolicy>([
  ['openai', remotePolicy('openai', 'OPENAI_API_KEY')],
  ['anthropic', remotePolicy('anthropic', 'ANTHROPIC_API_KEY')],
  ['google', remotePolicy('google', 'GOOGLE_GENERATIVE_AI_API_KEY')],
  ['openai-compatible', compatiblePolicy],
])

export const getAiProviderPolicy = (kind: AiProviderKind): AiProviderPolicy => {
  const policy = policies.get(kind)
  if (!policy) throw new Error(`Unsupported AI provider kind: ${kind}`)
  return policy
}

export const getProviderBaseUrlIssue = (
  kind: AiProviderKind,
  baseUrl: string | undefined,
): string | null => {
  const policy = getAiProviderPolicy(kind).baseUrlPolicy
  if (policy === 'required' && !baseUrl) {
    return 'baseUrl is required for openai-compatible providers'
  }
  if (policy === 'forbidden' && baseUrl) return `baseUrl is not supported for ${kind} providers`
  return null
}

export const normalizeProviderBaseUrl = (value: string): string => {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('baseUrl must be a valid HTTP(S) URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('baseUrl must use HTTPS or loopback HTTP')
  }
  if (url.username || url.password) throw new Error('baseUrl must not contain credentials')
  if (url.search || url.hash) throw new Error('baseUrl must not contain a query or fragment')
  if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
    throw new Error('Remote AI provider baseUrl must use HTTPS')
  }
  const normalized = url.toString()
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

const isLoopbackProviderUrl = (value: string | undefined): boolean => {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

const isLoopbackHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1') return true
  return isIP(host) === 4 && host.split('.')[0] === '127'
}
