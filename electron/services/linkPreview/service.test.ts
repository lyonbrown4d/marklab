import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  LINK_PREVIEW_MAX_RESPONSE_BYTES,
  LINK_PREVIEW_MAX_IMAGE_BYTES,
  LINK_PREVIEW_TIMEOUT_MS,
  LinkPreviewService,
  parseLinkPreviewHtml,
  type LinkPreviewHttpClient,
} from '@electron/services/linkPreview/service'

const publicLookup = vi.fn(async () => ['93.184.216.34'])

const response = (
  data: string | Uint8Array,
  contentType: string,
  status = 200,
  headers: Record<string, string> = {},
) => ({ data, headers: { 'content-type': contentType, ...headers }, status })

const createService = (get: ReturnType<typeof vi.fn>) =>
  new LinkPreviewService({
    httpClient: { get: get as LinkPreviewHttpClient['get'] },
    lookup: publicLookup,
  })

describe('LinkPreviewService', () => {
  afterEach(() => vi.useRealTimers())

  it('rejects unsupported URLs and credentials before network I/O', async () => {
    const get = vi.fn()
    const service = createService(get)

    await expect(service.fetch({ url: 'file:///etc/passwd' })).rejects.toThrow(/http and https/i)
    await expect(service.fetch({ url: 'https://user:secret@example.com' })).rejects.toThrow(
      /credentials/i,
    )
    expect(publicLookup).not.toHaveBeenCalled()
    expect(get).not.toHaveBeenCalled()
  })

  it('fetches bounded HTML without proxy or automatic redirects and parses metadata', async () => {
    const get = vi.fn(async () =>
      response(
        `<title>OG &amp; Title</title>
         <meta property="og:description" content="Preview description">
         <meta property="og:image" content="/images/card.png">
         <meta property="og:site_name" content="Example Site">
         <link rel="canonical" href="/docs/canonical">`,
        'text/html; charset=utf-8',
      ),
    )
    const service = createService(get)

    await expect(service.fetch({ url: 'https://example.com/docs/page?x=1' })).resolves.toEqual({
      kind: 'webpage',
      url: 'https://example.com/docs/page?x=1',
      title: 'OG & Title',
      description: 'Preview description',
      image: 'https://example.com/images/card.png',
      favicon: null,
      canonical: 'https://example.com/docs/canonical',
      site_name: 'Example Site',
    })
    expect(get).toHaveBeenCalledWith(
      'https://example.com/docs/page?x=1',
      expect.objectContaining({
        maxBodyLength: LINK_PREVIEW_MAX_IMAGE_BYTES,
        maxContentLength: LINK_PREVIEW_MAX_IMAGE_BYTES,
        maxRedirects: 0,
        proxy: false,
        responseType: 'arraybuffer',
        timeout: LINK_PREVIEW_TIMEOUT_MS,
      }),
    )
  })

  it('supports the all-address lookup contract requested by modern Node HTTP clients', async () => {
    const get = vi.fn(async (_url: string, config: Record<string, unknown>) => {
      const agent = config.httpsAgent as {
        options: {
          lookup: (
            hostname: string,
            options: { all?: boolean },
            callback: (error: Error | null, addresses: unknown) => void,
          ) => void
        }
      }
      const addresses = await new Promise<unknown>((resolve, reject) => {
        agent.options.lookup('example.com', { all: true }, (error, result) => {
          if (error) reject(error)
          else resolve(result)
        })
      })
      expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }])
      return response('<title>Modern lookup</title>', 'text/html')
    })
    const service = createService(get)

    await expect(service.fetch('https://example.com/page')).resolves.toMatchObject({
      kind: 'webpage',
      title: 'Modern lookup',
    })
  })

  it('revalidates every redirect target', async () => {
    const get = vi.fn(async (url: string) => {
      if (url === 'https://example.com/start') {
        return response('', 'text/html', 302, { location: 'https://cdn.example.net/page' })
      }
      return response('<title>Final</title>', 'text/html')
    })
    const lookup = vi.fn(async () => ['93.184.216.34'])
    const service = new LinkPreviewService({
      httpClient: { get: get as LinkPreviewHttpClient['get'] },
      lookup,
    })

    await expect(service.fetch({ url: 'https://example.com/start' })).resolves.toMatchObject({
      kind: 'webpage',
      title: 'Final',
      url: 'https://cdn.example.net/page',
    })
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('returns verified raster image bytes and rejects SVG', async () => {
    const png = new Uint8Array([137, 80, 78, 71])
    const imageService = createService(vi.fn(async () => response(png, 'image/png')))

    const preview = await imageService.fetch('https://example.com/image')
    expect(preview).toEqual({
      kind: 'image',
      media_type: 'image/png',
      src: expect.stringMatching(/^marklab-asset:\/\/remote\/v1\/[A-Za-z0-9_-]{43}$/),
      url: 'https://example.com/image',
    })
    if (preview.kind !== 'image') throw new Error('Expected image preview')
    const token = preview.src.split('/').at(-1) ?? ''
    expect(imageService.resolveImageCapability(token)).toEqual({
      bytes: png,
      mediaType: 'image/png',
    })

    const svgService = createService(
      vi.fn(async () => response('<svg onload="alert(1)"/>', 'image/svg+xml')),
    )
    await expect(svgService.fetch('https://example.com/vector')).rejects.toThrow(/content type/i)
  })

  it('deduplicates concurrent requests and caches results', async () => {
    const get = vi.fn(async () => response('<title>Cached</title>', 'text/html'))
    const service = createService(get)

    const [first, second] = await Promise.all([
      service.fetch('https://example.com/page'),
      service.fetch('https://example.com/page'),
    ])
    const third = await service.fetch('https://example.com/page')

    expect(first).toEqual(second)
    expect(third).toEqual(first)
    expect(get).toHaveBeenCalledOnce()
  })

  it('issues a bounded capability for a separately captured webpage preview', async () => {
    const owner = { contentView: {}, isDestroyed: vi.fn(() => false) }
    const capture = vi.fn(async () => ({
      bytes: new Uint8Array([255, 216, 255]),
      height: 360,
      mediaType: 'image/jpeg' as const,
      width: 640,
    }))
    const service = new LinkPreviewService({
      captureService: { capture, dispose: vi.fn() },
      httpClient: { get: vi.fn() as LinkPreviewHttpClient['get'] },
      lookup: publicLookup,
    } as never)

    await expect(service.capture({ url: 'https://example.com' }, owner as never)).resolves.toEqual({
      height: 360,
      src: expect.stringMatching(/^marklab-asset:\/\/remote\/v1\/[A-Za-z0-9_-]{43}$/),
      url: 'https://example.com/',
      width: 640,
    })
    expect(capture).toHaveBeenCalledExactlyOnceWith('https://example.com/', owner)
  })

  it('logs a sanitized capture failure without attaching the raw error or URL path', async () => {
    const owner = { contentView: {}, isDestroyed: vi.fn(() => false) }
    const failure = new Error(
      'ERR_FAILED loading https://user:secret@example.com/private/path?token=secret',
    )
    const warn = vi.fn()
    const debug = vi.fn()
    const service = new LinkPreviewService({
      captureService: {
        capture: vi.fn(async () => Promise.reject(failure)),
        dispose: vi.fn(),
      },
      httpClient: { get: vi.fn() as LinkPreviewHttpClient['get'] },
      logger: { debug, warn },
      lookup: publicLookup,
    } as never)

    await expect(
      service.capture({ url: 'https://example.com/private/path?token=secret' }, owner as never),
    ).rejects.toThrow('ERR_FAILED')
    expect(warn).toHaveBeenCalledWith(
      'visual link preview failed',
      expect.objectContaining({
        durationMs: expect.any(Number),
        errorCode: 'ERR_LINK_PREVIEW_CAPTURE',
        errorName: 'Error',
        hostname: 'example.com',
        operation: 'capture',
        stage: 'capture',
      }),
    )
    expect(warn.mock.calls[0]?.[1]).not.toHaveProperty('error')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private/path')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret')
  })

  it('logs a sanitized metadata failure without exposing the URL path', async () => {
    const failure = new Error('ERR_PROXY_CONNECTION_FAILED')
    const warn = vi.fn()
    const debug = vi.fn()
    const service = new LinkPreviewService({
      httpClient: {
        get: vi.fn(async () => Promise.reject(failure)) as LinkPreviewHttpClient['get'],
      },
      logger: { debug, warn },
      lookup: publicLookup,
    })

    await expect(service.fetch('https://example.com/private/path?token=secret')).rejects.toThrow(
      'ERR_PROXY_CONNECTION_FAILED',
    )
    expect(warn).toHaveBeenCalledWith(
      'link preview metadata failed',
      expect.objectContaining({
        durationMs: expect.any(Number),
        errorCode: 'ERR_LINK_PREVIEW_REQUEST',
        errorName: 'LinkPreviewOperationError',
        hostname: 'example.com',
        operation: 'metadata',
        stage: 'request',
      }),
    )
    expect(warn.mock.calls[0]?.[1]).not.toHaveProperty('error')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private/path')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('token=secret')
  })

  it('keeps HTML at 256 KiB while allowing bounded raster images up to 8 MiB', async () => {
    const oversizedHtml = new Uint8Array(LINK_PREVIEW_MAX_RESPONSE_BYTES + 1)
    const htmlService = createService(
      vi.fn(async () => response(oversizedHtml, 'text/html; charset=utf-8')),
    )
    await expect(htmlService.fetch('https://example.com/page')).rejects.toThrow(/maximum size/i)

    const oversizedImage = new Uint8Array(LINK_PREVIEW_MAX_IMAGE_BYTES + 1)
    const imageService = createService(vi.fn(async () => response(oversizedImage, 'image/png')))
    await expect(imageService.fetch('https://example.com/image')).rejects.toThrow(/maximum size/i)
  })

  it('expires remote image capabilities after the configured cache TTL', async () => {
    const service = new LinkPreviewService({
      cacheTtlMs: 1,
      httpClient: {
        get: vi.fn(async () =>
          response(new Uint8Array([1, 2, 3]), 'image/webp'),
        ) as LinkPreviewHttpClient['get'],
      },
      lookup: publicLookup,
    })
    const preview = await service.fetch('https://example.com/image')
    if (preview.kind !== 'image') throw new Error('Expected image preview')
    const token = preview.src.split('/').at(-1) ?? ''

    expect(service.resolveImageCapability(token)).not.toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(service.resolveImageCapability(token)).toBeNull()
  })

  it('applies the total timeout while DNS lookup is pending', async () => {
    vi.useFakeTimers()
    const warn = vi.fn()
    const service = new LinkPreviewService({
      httpClient: { get: vi.fn() as LinkPreviewHttpClient['get'] },
      logger: { debug: vi.fn(), warn },
      lookup: () => new Promise(() => undefined),
    })
    const preview = service.fetch('https://example.com/page')
    const timeoutExpectation = expect(preview).rejects.toThrow(/timed out/i)

    await vi.advanceTimersByTimeAsync(LINK_PREVIEW_TIMEOUT_MS)

    await timeoutExpectation
    expect(warn).toHaveBeenCalledWith(
      'link preview metadata failed',
      expect.objectContaining({
        errorCode: 'ERR_LINK_PREVIEW_VALIDATE',
        errorName: 'LinkPreviewOperationError',
        stage: 'validate',
      }),
    )
  })
})

describe('parseLinkPreviewHtml', () => {
  it('falls back to standard title and description metadata', () => {
    expect(
      parseLinkPreviewHtml(
        `<title>Plain &amp; Title</title>
         <meta name="description" content="Plain description">
         <link rel="apple-touch-icon" href="icon.png">`,
        'https://site.test/docs/page',
      ),
    ).toEqual({
      title: 'Plain & Title',
      description: 'Plain description',
      image: null,
      favicon: 'https://site.test/docs/icon.png',
      canonical: null,
      site_name: null,
    })
  })
})
