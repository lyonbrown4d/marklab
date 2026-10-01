import { describe, expect, it } from 'vitest'

import { LOCAL_AI_MODEL_CATALOG } from '@electron/services/ai/local/catalog.js'

describe('local AI model catalog', () => {
  it('pins the lightweight Qwen artifact and its integrity metadata', () => {
    expect(LOCAL_AI_MODEL_CATALOG).toEqual([
      expect.objectContaining({
        id: 'qwen3-0.6b-q4',
        license: 'Apache-2.0',
        recommended: true,
        sha256: 'da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4',
        sizeBytes: 428_970_080,
        url: expect.stringMatching(/^https:\/\/huggingface\.co\/ggml-org\//),
      }),
    ])
  })

  it('uses fixed safe filenames rather than renderer-provided paths', () => {
    const [model] = LOCAL_AI_MODEL_CATALOG
    expect(model?.fileName).toBe('Qwen3-0.6B-Q4_0.gguf')
    expect(model?.fileName).not.toMatch(/[\\/]/)
    expect(model?.url).toContain('/resolve/b5f37287796e5be0ea3dab2e7430873fb3f73e49/')
    expect(model?.url).not.toContain('/resolve/main/')
  })
})
