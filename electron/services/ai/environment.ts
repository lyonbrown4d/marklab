import type { AiEnvironment, AiProviderKind } from '@electron/services/ai/types.js'

const environmentVariables: Record<AiProviderKind, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  'openai-compatible': 'MARKLAB_OPENAI_COMPATIBLE_API_KEY',
}

export const readAiEnvironment = (environment: NodeJS.ProcessEnv = process.env): AiEnvironment => ({
  openai: readSecret(environment, environmentVariables.openai),
  anthropic: readSecret(environment, environmentVariables.anthropic),
  google: readSecret(environment, environmentVariables.google),
  'openai-compatible': readSecret(environment, environmentVariables['openai-compatible']),
})

const readSecret = (environment: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = environment[name]
  return value?.trim() ? value : undefined
}
