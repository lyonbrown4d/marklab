import { describe, expect, it } from 'vitest'

import {
  graphLayoutNodeSchema,
  graphLayoutViewportSchema,
} from '@electron/services/graphLayout/graphLayoutSchemas'

const node = {
  collapsed: false,
  height: 240,
  id: 'file:a.md',
  pinned: false,
  userModified: true,
  width: 360,
  x: 10,
  y: 20,
}

describe('graph layout schemas', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite node geometry: %s',
    (value) => {
      expect(() => graphLayoutNodeSchema.parse({ ...node, x: value })).toThrow()
      expect(() => graphLayoutNodeSchema.parse({ ...node, width: value })).toThrow()
    },
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite viewport geometry: %s',
    (value) => {
      expect(() => graphLayoutViewportSchema.parse({ x: 10, y: 20, zoom: value })).toThrow()
    },
  )
})
