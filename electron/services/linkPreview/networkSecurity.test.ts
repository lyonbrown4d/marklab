import { describe, expect, it, vi } from 'vitest'

import {
  assertPublicLinkPreviewUrl,
  normalizeNetworkHostname,
  validatePublicAddress,
} from '@electron/services/linkPreview/networkSecurity.js'

describe('link preview network security', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '100.64.0.1',
    '192.0.2.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::ffff:127.0.0.1',
  ])('rejects non-public address %s', (address) => {
    expect(() => validatePublicAddress(address)).toThrow(/public internet/i)
  })

  it('accepts globally routable IPv4 and IPv6 addresses', () => {
    expect(validatePublicAddress('8.8.8.8')).toBe('8.8.8.8')
    expect(validatePublicAddress('2606:4700:4700::1111')).toBe('2606:4700:4700::1111')
  })

  it('rejects a hostname when any DNS result is private', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34', '127.0.0.1'])

    await expect(
      assertPublicLinkPreviewUrl(new URL('https://example.com'), lookup),
    ).rejects.toThrow(/public internet/i)
  })

  it('handles public and private WHATWG IPv6 literal hostnames without DNS', async () => {
    const lookup = vi.fn()

    await expect(
      assertPublicLinkPreviewUrl(new URL('https://[2606:4700:4700::1111]/'), lookup),
    ).resolves.toEqual(['2606:4700:4700::1111'])
    await expect(assertPublicLinkPreviewUrl(new URL('https://[::1]/'), lookup)).rejects.toThrow(
      /public internet/i,
    )
    expect(lookup).not.toHaveBeenCalled()
  })

  it('normalizes brackets and a trailing DNS root dot for pinned comparisons', () => {
    expect(normalizeNetworkHostname('[2606:4700:4700::1111]')).toBe('2606:4700:4700::1111')
    expect(normalizeNetworkHostname('Example.COM.')).toBe('example.com')
  })
})
