import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  generateTextRequestSchema,
  generationCancelSchema,
  providerUpdateSchema,
} from '@electron/services/ai/schemas'

const provider = {
  id: 'local-model',
  label: 'Local model',
  kind: 'openai-compatible' as const,
  model: 'qwen3',
  apiKey: 'local-key',
}

describe('AI provider validation', () => {
  it('uses the Zod 4 UUID schema for cancellation identifiers', () => {
    expect(generationCancelSchema.shape.requestId).toBeInstanceOf(z.ZodUUID)
    expect(
      generationCancelSchema.parse({ requestId: '7dc985aa-5fb4-4fac-a3e8-246f5a02e906' }),
    ).toEqual({ requestId: '7dc985aa-5fb4-4fac-a3e8-246f5a02e906' })
    expect(() => generationCancelSchema.parse({ requestId: 'request-1' })).toThrow()
  })

  it('allows HTTPS endpoints and loopback-only HTTP endpoints', () => {
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'https://models.example.com/v1/' })
        .baseUrl,
    ).toBe('https://models.example.com/v1')
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'http://127.0.0.1:11434/v1' }).baseUrl,
    ).toBe('http://127.0.0.1:11434/v1')
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'http://127.255.23.4:11434/v1' }).baseUrl,
    ).toBe('http://127.255.23.4:11434/v1')
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'http://[::1]:1234/v1' }).baseUrl,
    ).toBe('http://[::1]:1234/v1')
  })

  it('rejects insecure remote HTTP, credentials, and missing compatible base URLs', () => {
    expect(() =>
      providerUpdateSchema.parse({ ...provider, baseUrl: 'http://models.example.com/v1' }),
    ).toThrow(/HTTPS/i)
    expect(() =>
      providerUpdateSchema.parse({ ...provider, baseUrl: 'https://user:pass@example.com/v1' }),
    ).toThrow(/credentials/i)
    expect(() => providerUpdateSchema.parse(provider)).toThrow(/baseUrl/i)
  })

  it.each(['openai', 'anthropic', 'google'] as const)(
    'rejects a custom base URL for built-in %s providers',
    (kind) => {
      expect(() =>
        providerUpdateSchema.parse({
          ...provider,
          kind,
          baseUrl: 'https://attacker.example/v1',
        }),
      ).toThrow(/baseUrl.*not supported|must not/i)
    },
  )

  it('bounds prompt, system, token, and temperature inputs', () => {
    expect(() =>
      generateTextRequestSchema.parse({ providerId: 'x', prompt: 'x'.repeat(100_001) }),
    ).toThrow()
    expect(() =>
      generateTextRequestSchema.parse({
        providerId: 'x',
        prompt: 'ok',
        system: 'x'.repeat(50_001),
      }),
    ).toThrow()
    expect(() =>
      generateTextRequestSchema.parse({ providerId: 'x', prompt: 'ok', maxOutputTokens: 32_769 }),
    ).toThrow()
    expect(() =>
      generateTextRequestSchema.parse({ providerId: 'x', prompt: 'ok', temperature: 2.1 }),
    ).toThrow()
    expect(() =>
      generateTextRequestSchema.parse({
        providerId: 'x',
        prompt: 'ok',
        temperature: Number.POSITIVE_INFINITY,
      }),
    ).toThrow()
  })
})
