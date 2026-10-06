import type { Agent } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createWebPreviewProtocolHandler,
  installWebPreviewProtocol,
} from '@electron/services/linkPreview/webPreviewProtocol'

describe('createWebPreviewProtocolHandler', () => {
  afterEach(() => vi.useRealTimers())

  it('pins the request to the public address validated for that exact request', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34'])
    const get = vi.fn(async (_url: string, config: Record<string, unknown>) => {
      const httpsAgent = config.httpsAgent as Agent & {
        options: {
          lookup: (
            hostname: string,
            options: { all: true },
            callback: (error: null, addresses: unknown) => void,
          ) => void
        }
      }
      const pinned = await new Promise<unknown>((resolve) => {
        httpsAgent.options.lookup('example.com', { all: true }, (_error, addresses) =>
          resolve(addresses),
        )
      })
      expect(pinned).toEqual([{ address: '93.184.216.34', family: 4 }])
      return {
        data: Buffer.from('<html><body>safe</body></html>'),
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 200,
      }
    })
    const handler = createWebPreviewProtocolHandler({ get }, lookup)

    const response = await handler(new Request('https://example.com/private'))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('safe')
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('uses an upstream HEAD request when Chromium only requests headers', async () => {
    const get = vi.fn()
    const head = vi.fn(async () => ({
      data: new Uint8Array(),
      headers: { 'content-type': 'text/html' },
      status: 200,
    }))
    const handler = createWebPreviewProtocolHandler({ get, head } as never, async () => [
      '93.184.216.34',
    ])

    const response = await handler(new Request('https://example.com/', { method: 'HEAD' }))

    expect(response.status).toBe(200)
    expect(head).toHaveBeenCalledOnce()
    expect(get).not.toHaveBeenCalled()
  })

  it('blocks a rebinding request before the HTTP client can connect', async () => {
    const get = vi.fn()
    const handler = createWebPreviewProtocolHandler({ get }, async () => ['127.0.0.1'])

    await expect(handler(new Request('https://example.com/private'))).rejects.toThrow(
      'public internet address',
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('revalidates a hostname after every redirect before connecting again', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(['93.184.216.34'])
      .mockResolvedValueOnce(['127.0.0.1'])
    const get = vi.fn(async () => ({
      data: new Uint8Array(),
      headers: { location: 'https://rebound.example/private' },
      status: 302,
    }))
    const handler = createWebPreviewProtocolHandler({ get }, lookup)

    await expect(handler(new Request('https://example.com/start'))).rejects.toThrow(
      'public internet address',
    )
    expect(get).toHaveBeenCalledOnce()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('returns a validated redirect to Chromium so the document keeps its final URL', async () => {
    const lookup = vi.fn(async () => ['93.184.216.34'])
    const get = vi.fn(async () => ({
      data: new Uint8Array(),
      headers: { location: '/articles/final/' },
      status: 302,
    }))
    const handler = createWebPreviewProtocolHandler({ get }, lookup)

    const response = await handler(new Request('https://example.com/start'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://example.com/articles/final/')
    expect(get).toHaveBeenCalledOnce()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('forwards browser negotiation headers and CORS response headers without credentials', async () => {
    const get = vi.fn(async (_url: string, config: Record<string, unknown>) => {
      expect(config.headers).toMatchObject({
        Accept: 'text/css,*/*;q=0.1',
        'Accept-Language': 'zh-CN',
        Origin: 'https://example.com',
        Range: 'bytes=0-1023',
        'User-Agent': 'Chromium test agent',
      })
      expect(config.headers).not.toHaveProperty('Cookie')
      expect(config.headers).not.toHaveProperty('Authorization')
      return {
        data: Buffer.from('body{}'),
        headers: {
          'access-control-allow-origin': 'https://example.com',
          'cache-control': 'public, max-age=3600',
          'content-type': 'text/css; charset=utf-8',
          'cross-origin-resource-policy': 'cross-origin',
          'set-cookie': 'session=secret',
        },
        status: 206,
      }
    })
    const handler = createWebPreviewProtocolHandler({ get }, async () => ['93.184.216.34'])
    const request = new Request('https://cdn.example.com/site.css', {
      headers: {
        Accept: 'text/css,*/*;q=0.1',
        'Accept-Language': 'zh-CN',
        Authorization: 'Bearer secret',
        Cookie: 'session=secret',
        Origin: 'https://example.com',
        Range: 'bytes=0-1023',
        'User-Agent': 'Chromium test agent',
      },
    })

    const response = await handler(request)

    expect(response.status).toBe(206)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com')
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.has('set-cookie')).toBe(false)
  })

  it('returns renderable HTTP error pages instead of failing the whole capture', async () => {
    const handler = createWebPreviewProtocolHandler(
      {
        get: vi.fn(async () => ({
          data: Buffer.from('<h1>Access denied</h1>'),
          headers: { 'content-type': 'text/html; charset=utf-8' },
          status: 403,
        })),
      },
      async () => ['93.184.216.34'],
    )

    const response = await handler(new Request('https://example.com/protected'))

    expect(response.status).toBe(403)
    expect(await response.text()).toContain('Access denied')
  })

  it('leaves a missing content type unset so Chromium can apply normal MIME sniffing', async () => {
    const handler = createWebPreviewProtocolHandler(
      {
        get: vi.fn(async () => ({
          data: Buffer.from('<!doctype html><title>Untyped</title>'),
          headers: {},
          status: 200,
        })),
      },
      async () => ['93.184.216.34'],
    )

    const response = await handler(new Request('https://example.com/untyped'))

    expect(response.headers.has('content-type')).toBe(false)
  })

  it('enforces the resource limit even when the HTTP client returns an oversized body', async () => {
    const get = vi.fn(async (_url: string, config: Record<string, unknown>) => {
      expect(config.maxBodyLength).toBe(8 * 1024 * 1024)
      expect(config.maxContentLength).toBe(8 * 1024 * 1024)
      return {
        data: new Uint8Array(8 * 1024 * 1024 + 1),
        headers: { 'content-type': 'image/png' },
        status: 200,
      }
    })
    const handler = createWebPreviewProtocolHandler({ get }, async () => ['93.184.216.34'])

    await expect(handler(new Request('https://example.com/large.png'))).rejects.toThrow(
      'maximum size',
    )
  })

  it('stops waiting for DNS validation when Chromium cancels the request', async () => {
    const abort = new AbortController()
    const handler = createWebPreviewProtocolHandler({ get: vi.fn() }, () => new Promise(() => {}))
    const response = handler(new Request('https://slow.example/resource', { signal: abort.signal }))
    const rejected = expect(response).rejects.toThrow('aborted')

    abort.abort()

    await rejected
  })

  it('bounds DNS validation with the request timeout', async () => {
    vi.useFakeTimers()
    const handler = createWebPreviewProtocolHandler({ get: vi.fn() }, () => new Promise(() => {}), {
      timeoutMs: 50,
    })
    const response = handler(new Request('https://slow.example/resource'))
    const rejected = expect(response).rejects.toThrow('timed out')

    await vi.advanceTimersByTimeAsync(50)

    await rejected
  })
})

describe('installWebPreviewProtocol', () => {
  it('rolls back a partial installation and makes disposal idempotent', () => {
    const handle = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('https is already handled')
      })
    const unhandle = vi.fn()

    expect(() =>
      installWebPreviewProtocol({ protocol: { handle, unhandle } }, async () => ['93.184.216.34']),
    ).toThrow('https is already handled')
    expect(unhandle).toHaveBeenCalledOnce()
    expect(unhandle).toHaveBeenCalledWith('http')

    handle.mockReset()
    unhandle.mockReset()
    const dispose = installWebPreviewProtocol({ protocol: { handle, unhandle } }, async () => [
      '93.184.216.34',
    ])
    dispose()
    dispose()
    expect(unhandle.mock.calls).toEqual([['https'], ['http']])
  })
})
