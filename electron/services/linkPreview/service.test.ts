import { describe, expect, it, vi } from 'vitest'
import {
  LINK_PREVIEW_MAX_RESPONSE_BYTES,
  LINK_PREVIEW_TIMEOUT_MS,
  LinkPreviewService,
  parseLinkPreviewHtml,
  type LinkPreviewHttpClient,
} from '@electron/services/linkPreview/service.js'

describe('LinkPreviewService', () => {
  it('rejects non-http URLs before making a request', async () => {
    const get = vi.fn()
    const service = new LinkPreviewService({ get: get as LinkPreviewHttpClient['get'] })

    await expect(service.fetch({ url: 'file:///etc/passwd' })).rejects.toThrow(
      'Only http and https URLs are supported',
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('fetches HTML with timeout and body limits, then parses OG metadata', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="OG &amp; Title">
          <meta property="og:description" content="Preview description">
          <meta property="og:image" content="/images/card.png">
          <meta property="og:site_name" content="Example Site">
          <link rel="canonical" href="/docs/canonical">
          <link rel="shortcut icon" href="/favicon.ico">
        </head>
      </html>
    `
    const get = vi.fn(async () => ({
      data: html,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
      request: {
        res: {
          responseUrl: 'https://example.com/docs/page',
        },
      },
    }))
    const service = new LinkPreviewService({ get: get as LinkPreviewHttpClient['get'] })

    await expect(service.fetch({ url: 'https://example.com/docs/page?x=1' })).resolves.toEqual({
      url: 'https://example.com/docs/page',
      title: 'OG & Title',
      description: 'Preview description',
      image: 'https://example.com/images/card.png',
      favicon: 'https://example.com/favicon.ico',
      canonical: 'https://example.com/docs/canonical',
      site_name: 'Example Site',
    })

    expect(get).toHaveBeenCalledWith(
      'https://example.com/docs/page?x=1',
      expect.objectContaining({
        maxBodyLength: LINK_PREVIEW_MAX_RESPONSE_BYTES,
        maxContentLength: LINK_PREVIEW_MAX_RESPONSE_BYTES,
        responseType: 'text',
        timeout: LINK_PREVIEW_TIMEOUT_MS,
      }),
    )
  })
})

describe('parseLinkPreviewHtml', () => {
  it('falls back to standard title and description metadata', () => {
    expect(
      parseLinkPreviewHtml(
        `
          <html>
            <head>
              <title>Plain &amp; Title</title>
              <meta name="description" content="Plain description">
              <link rel="apple-touch-icon" href="icon.png">
            </head>
          </html>
        `,
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
