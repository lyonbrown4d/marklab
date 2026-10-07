import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}))

import { createContentSecurityPolicy } from '@electron/main/contentSecurityPolicy'

describe('renderer image CSP', () => {
  it('allows opaque asset capabilities and blocks direct remote images', () => {
    const policy = createContentSecurityPolicy()
    const imageDirective = policy.split('; ').find((directive) => directive.startsWith('img-src'))
    const connectDirective = policy
      .split('; ')
      .find((directive) => directive.startsWith('connect-src'))

    expect(imageDirective).toBe("img-src 'self' data: blob: marklab-asset:")
    expect(imageDirective).not.toContain('http:')
    expect(imageDirective).not.toContain('https:')
    expect(connectDirective).toContain('marklab-asset:')
  })
})
