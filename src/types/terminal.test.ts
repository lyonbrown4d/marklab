import { describe, expect, it } from 'vitest'

import { terminalCreateRequestSchema } from '@/types/terminal'

describe('terminal contracts', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects a non-finite terminal dimension: %s',
    (value) => {
      expect(() => terminalCreateRequestSchema.parse({ cols: value, rows: 24 })).toThrow()
      expect(() => terminalCreateRequestSchema.parse({ cols: 80, rows: value })).toThrow()
    },
  )
})
