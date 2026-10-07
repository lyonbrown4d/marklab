import { describe, expect, it } from 'vitest'

import {
  parseOccurrenceSearchCancel,
  parseOccurrenceSearchRequest,
} from '@electron/services/workspace/workspaceOccurrenceSearchRequest'

describe('workspace occurrence search request validation', () => {
  it('accepts a bounded typed request', () => {
    expect(
      parseOccurrenceSearchRequest({
        requestId: 'request-1',
        query: 'needle',
        limit: 200,
        options: { caseSensitive: true, wholeWord: false, useRegex: true },
      }),
    ).toEqual({
      requestId: 'request-1',
      query: 'needle',
      limit: 200,
      options: { caseSensitive: true, wholeWord: false, useRegex: true },
    })
  })

  it('rejects empty identifiers, oversized patterns, and excessive limits', () => {
    const base = {
      requestId: 'request-1',
      query: 'needle',
      options: { caseSensitive: false, wholeWord: false, useRegex: false },
    }

    expect(() => parseOccurrenceSearchRequest({ ...base, requestId: '' })).toThrow()
    expect(() => parseOccurrenceSearchRequest({ ...base, query: 'x'.repeat(257) })).toThrow()
    expect(() => parseOccurrenceSearchRequest({ ...base, limit: 501 })).toThrow()
    expect(() => parseOccurrenceSearchCancel({ requestId: '../not-an-id' })).toThrow()
  })
})
