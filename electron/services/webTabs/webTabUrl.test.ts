import { describe, expect, it } from 'vitest'

import { normalizeWebTabUrl } from '@electron/services/webTabs/webTabUrl.js'

describe('normalizeWebTabUrl', () => {
  it('normalizes HTTPS URLs', () => {
    expect(normalizeWebTabUrl('https://example.com/docs?q=hello')).toBe(
      'https://example.com/docs?q=hello',
    )
  })

  it.each([
    'http://example.com',
    'file:///etc/passwd',
    'data:text/html,hello',
    'javascript:alert(1)',
    'marklab://settings',
    'https://user:secret@example.com',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => normalizeWebTabUrl(url)).toThrow('Only credential-free HTTPS URLs are allowed')
  })

  it('rejects excessively long URLs', () => {
    expect(() => normalizeWebTabUrl(`https://example.com/${'a'.repeat(4096)}`)).toThrow(
      'Web tab URL is too long',
    )
  })
})
