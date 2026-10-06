import { describe, expect, it } from 'vitest'

import { linkPreviewRequestSchema } from '@/types/linkPreview'

describe('link preview contracts', () => {
  it('accepts and normalizes HTTP and HTTPS URLs', () => {
    expect(linkPreviewRequestSchema.parse({ url: 'https://example.com/docs' })).toEqual({
      url: 'https://example.com/docs',
    })
    expect(linkPreviewRequestSchema.parse({ url: 'http://example.com' })).toEqual({
      url: 'http://example.com/',
    })
  })

  it.each([
    'ftp://example.com/file',
    'file:///C:/notes/private.md',
    'https://user@example.com/private',
    'https://user:password@example.com/private',
  ])('rejects unsafe preview URL %s', (url) => {
    expect(() => linkPreviewRequestSchema.parse({ url })).toThrow('Expected a safe HTTP URL')
  })
})
