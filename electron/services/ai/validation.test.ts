import { describe, expect, it } from 'vitest'

import { generateTextRequestSchema, providerUpdateSchema } from '@electron/services/ai/schemas'

const provider = {
  id: 'local-model',
  label: 'Local model',
  kind: 'openai-compatible' as const,
  model: 'qwen3',
  apiKey: 'local-key',
}

describe('AI provider validation', () => {
  it('allows HTTPS endpoints and loopback-only HTTP endpoints', () => {
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'https://models.example.com/v1/' })
        .baseUrl,
    ).toBe('https://models.example.com/v1')
    expect(
      providerUpdateSchema.parse({ ...provider, baseUrl: 'http://127.0.0.1:11434/v1' }).baseUrl,
    ).toBe('http://127.0.0.1:11434/v1')
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
  })
})
