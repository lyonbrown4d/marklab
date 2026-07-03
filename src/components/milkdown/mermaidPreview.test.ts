import type { CodeBlockConfig } from '@milkdown/kit/component/code-block'
import { describe, expect, it, vi } from 'vitest'

import { configureMermaidPreview } from '@/components/milkdown/mermaidPreview'

vi.mock('@/i18n/setup', () => ({
  default: {
    t: (key: string) => (key === 'preview.mermaidLoading' ? 'Loading diagram...' : key),
  },
}))

class SilentIntersectionObserver {
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
}

describe('configureMermaidPreview', () => {
  it('uses the localized Mermaid loading placeholder', () => {
    vi.stubGlobal('IntersectionObserver', SilentIntersectionObserver)
    const applyPreview = vi.fn()
    const previousConfig = {
      languages: [],
      renderPreview: vi.fn(),
    } as unknown as CodeBlockConfig

    configureMermaidPreview(previousConfig).renderPreview(
      'mermaid',
      'graph TD\n  A --> B',
      applyPreview,
    )

    const placeholder = applyPreview.mock.calls[0]?.[0]
    expect(placeholder).toBeInstanceOf(HTMLDivElement)
    expect(placeholder).toHaveTextContent('Loading diagram...')
  })
})
