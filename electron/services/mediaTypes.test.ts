import { describe, expect, it } from 'vitest'

import { assetMediaTypeForExtension, isAssetMediaExtension } from '@electron/services/mediaTypes.js'

describe('asset media types', () => {
  it('normalizes common image extensions', () => {
    expect(assetMediaTypeForExtension('.jpg')).toBe('image/jpeg')
    expect(assetMediaTypeForExtension('JPEG')).toBe('image/jpeg')
    expect(assetMediaTypeForExtension('.WEBP')).toBe('image/webp')
  })

  it('covers document and calendar preview assets', () => {
    expect(assetMediaTypeForExtension('.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(assetMediaTypeForExtension('.excalidraw')).toBe('application/json')
    expect(assetMediaTypeForExtension('.ics')).toBe('text/calendar')
  })

  it('covers video extensions shared by asset protocol and markdown media', () => {
    expect(assetMediaTypeForExtension('.m4v')).toBe('video/mp4')
    expect(assetMediaTypeForExtension('.mkv')).toBe('video/x-matroska')
  })

  it('returns null for unknown extensions', () => {
    expect(assetMediaTypeForExtension('.unknown')).toBeNull()
    expect(isAssetMediaExtension('.unknown')).toBe(false)
  })
})
