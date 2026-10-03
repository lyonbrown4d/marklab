import { describe, expect, it } from 'vitest'

import {
  createRemoteImageCapabilityUrl,
  parseRemoteImageCapabilityUrl,
} from '@electron/services/linkPreview/remoteAsset.js'

describe('remote image capabilities', () => {
  it('creates and parses a strict opaque capability URL', () => {
    const issued = createRemoteImageCapabilityUrl()

    expect(issued.url).toBe(`marklab-asset://remote/v1/${issued.token}`)
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(parseRemoteImageCapabilityUrl(issued.url)).toBe(issued.token)
  })

  it.each([
    'https://remote/v1/token',
    'marklab-asset://local/v1/token',
    'marklab-asset://remote/v2/token',
    'marklab-asset://remote/v1/short',
    'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA?x=1',
    'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA#x',
  ])('rejects malformed capability %s', (url) => {
    expect(parseRemoteImageCapabilityUrl(url)).toBeNull()
  })
})
