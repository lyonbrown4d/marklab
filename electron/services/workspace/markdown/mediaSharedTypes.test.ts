import { describe, expect, it } from 'vitest'

import {
  guessMediaType,
  looksLikeAssetTarget,
} from '@electron/services/workspace/markdown/media.js'

describe('markdown media shared MIME table', () => {
  it('uses data URI media types before extension inference', () => {
    expect(guessMediaType('data:image/png;base64,AAAA')).toBe('image/png')
  })

  it('recognizes extensions shared with the asset protocol', () => {
    expect(guessMediaType('calendar.ics')).toBe('text/calendar')
    expect(guessMediaType('movie.m4v#t=2')).toBe('video/mp4')
    expect(looksLikeAssetTarget('calendar.ics')).toBe(true)
  })
})
