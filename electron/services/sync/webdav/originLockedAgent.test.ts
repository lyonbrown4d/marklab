import type { RequestOptions } from 'node:https'

import { describe, expect, it, vi } from 'vitest'

import { createOriginLockedAgents } from '@electron/services/sync/webdav/originLockedAgent.js'

describe('origin-locked WebDAV agents', () => {
  it('rejects a cross-origin redirect before a request is sent', () => {
    const { httpsAgent } = createOriginLockedAgents('https://dav.example.com')
    const callback = vi.fn()

    httpsAgent.createConnection(
      {
        protocol: 'https:',
        hostname: 'evil.example.com',
        port: 443,
      } as RequestOptions,
      callback,
    )

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ORIGIN_MISMATCH' }),
      undefined,
    )
  })

  it('rejects a protocol downgrade on the companion HTTP agent', () => {
    const { httpAgent } = createOriginLockedAgents('https://dav.example.com')
    const callback = vi.fn()

    httpAgent.createConnection(
      {
        protocol: 'http:',
        hostname: 'dav.example.com',
        port: 80,
      } as RequestOptions,
      callback,
    )

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ORIGIN_MISMATCH' }),
      undefined,
    )
  })

  it('compares the full IPv6 hostname rather than only its prefix', () => {
    const { httpAgent } = createOriginLockedAgents('http://[fd12::1]')
    const callback = vi.fn()

    httpAgent.createConnection(
      {
        protocol: 'http:',
        hostname: 'fd12::2',
        port: 80,
      } as RequestOptions,
      callback,
    )

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ORIGIN_MISMATCH' }),
      undefined,
    )
  })
})
