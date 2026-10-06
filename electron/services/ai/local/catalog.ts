import type { LocalAiCatalogEntry } from '@electron/services/ai/local/types'

export const LOCAL_AI_MODEL_CATALOG: readonly LocalAiCatalogEntry[] = [
  {
    id: 'qwen3-0.6b-q4',
    label: 'Qwen3 0.6B · Lightweight',
    description: 'A compact multilingual model for lightweight Chinese and Markdown rewriting.',
    sizeBytes: 428_970_080,
    license: 'Apache-2.0',
    recommended: true,
    fileName: 'Qwen3-0.6B-Q4_0.gguf',
    sha256: 'da2572f16c06133561ce56accaa822216f2391ef4d37fba427801cd6736417d4',
    url: 'https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/b5f37287796e5be0ea3dab2e7430873fb3f73e49/Qwen3-0.6B-Q4_0.gguf',
  },
]
