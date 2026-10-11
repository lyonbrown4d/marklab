import { describe, expect, it } from 'vitest'
import { scanPlateDocumentFindSource } from '@/workers/plateDocumentFindWorkerModel'

const source = [
  {
    entries: [
      { path: [0, 0], text: 'prefix-' },
      { path: [0, 1], text: '123-suffix' },
    ],
  },
]

describe('plate document find worker model', () => {
  it('returns cross-leaf ranges and serializable capture context', () => {
    const [match] = scanPlateDocumentFindSource(source, '(?<=prefix-)(\\d+)(?=-suffix)', {
      matchCase: false,
      useRegex: true,
      wholeWord: false,
    })

    expect(match).toEqual({
      anchor: { offset: 0, path: [0, 1] },
      focus: { offset: 3, path: [0, 1] },
      regex: {
        captures: ['123'],
        groups: {},
        match: '123',
        prefix: 'prefix-',
        suffix: '-suffix',
      },
    })
  })

  it('throws a typed invalid-regex error without returning partial matches', () => {
    expect(() =>
      scanPlateDocumentFindSource(source, '[', {
        matchCase: false,
        useRegex: true,
        wholeWord: false,
      }),
    ).toThrow('invalidRegex')
  })

  it('rejects oversized patterns before compiling them', () => {
    expect(() =>
      scanPlateDocumentFindSource(source, 'a'.repeat(10_001), {
        matchCase: false,
        useRegex: true,
        wholeWord: false,
      }),
    ).toThrow('patternTooLong')
  })
})
