import { describe, expect, it } from 'vitest'

import {
  guessMediaType,
  looksLikeAssetTarget,
} from '@electron/services/workspace/markdown/media.js'

describe('markdown media targets', () => {
  it('recognizes calendar files as linkable asset targets', () => {
    expect(looksLikeAssetTarget('calendar.ics')).toBe(true)
    expect(guessMediaType('calendar.ics')).toBe('text/calendar')
  })
})
