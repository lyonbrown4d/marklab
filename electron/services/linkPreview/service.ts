import axios from 'axios'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { LRUCache } from 'lru-cache'
import type { BrowserWindow } from 'electron'

import {
  assertPublicLinkPreviewUrl,
  defaultLinkPreviewLookup,
  normalizeNetworkHostname,
  type LinkPreviewLookup,
} from '@electron/services/linkPreview/networkSecurity.js'
import {
  createRemoteImageCapabilityUrl,
  parseRemoteImageCapabilityUrl,
  type RemoteImageAsset,
} from '@electron/services/linkPreview/remoteAsset.js'
import { headerValue, parseLinkPreviewResponse } from '@electron/services/linkPreview/response.js'
import type {
  LinkPreviewCapture,
  LinkPreviewRequest,
  LinkPreviewResult,
} from '@/types/linkPreview.js'

export { parseLinkPreviewHtml } from '@electron/services/linkPreview/metadata.js'

export const LINK_PREVIEW_TIMEOUT_MS = 5000
export const LINK_PREVIEW_MAX_RESPONSE_BYTES = 256 * 1024
export const LINK_PREVIEW_MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const LINK_PREVIEW_MAX_REDIRECTS = 5
export const LINK_PREVIEW_CACHE_TTL_MS = 30 * 60 * 1000

type LinkPreviewHttpResponse<T> = {
  data: T
  headers?: unknown
  status?: number
}

export type LinkPreviewHttpClient = {
  get<T = unknown>(
    url: string,
    config: Record<string, unknown>,
  ): Promise<LinkPreviewHttpResponse<T>>
}

export type LinkPreviewServiceContract = {
  capture(payload: unknown, owner: BrowserWindow): Promise<LinkPreviewCapture>
  dispose(): void
  fetch(payload: unknown): Promise<LinkPreviewResult>
  resolveImageCapability(token: string): RemoteImageAsset | null
}

export type CapturedWebPreview = {
  bytes: Uint8Array
  height: number
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
}

export type WebPreviewCaptureServiceContract = {
  capture(url: string, owner: BrowserWindow): Promise<CapturedWebPreview>
  dispose(): void
}

type LinkPreviewServiceOptions = {
  cacheTtlMs?: number
  captureService?: WebPreviewCaptureServiceContract
  httpClient?: LinkPreviewHttpClient
  lookup?: LinkPreviewLookup
}

export class LinkPreviewService implements LinkPreviewServiceContract {
  private readonly cache: LRUCache<string, LinkPreviewResult>
  private readonly inflight = new Map<string, Promise<LinkPreviewResult>>()
  private readonly imageCache: LRUCache<string, RemoteImageAsset>
  private readonly httpClient: LinkPreviewHttpClient
  private readonly lookup: LinkPreviewLookup
  private readonly captureService?: WebPreviewCaptureServiceContract

  constructor(options: LinkPreviewServiceOptions = {}) {
    const cacheTtlMs = options.cacheTtlMs ?? LINK_PREVIEW_CACHE_TTL_MS
    this.cache = new LRUCache<string, LinkPreviewResult>({
      max: 128,
      maxSize: 32 * 1024 * 1024,
      sizeCalculation: (value) => JSON.stringify(value).length,
      ttl: cacheTtlMs,
    })
    this.imageCache = new LRUCache<string, RemoteImageAsset>({
      maxSize: 32 * 1024 * 1024,
      sizeCalculation: (asset) => asset.bytes.byteLength,
      ttl: cacheTtlMs,
    })
    this.httpClient = options.httpClient ?? axios
    this.lookup = options.lookup ?? defaultLinkPreviewLookup
    this.captureService = options.captureService
  }

  async capture(payload: unknown, owner: BrowserWindow): Promise<LinkPreviewCapture> {
    const request = parseLinkPreviewRequest(payload)
    if (!this.captureService) throw new Error('Visual link preview is unavailable')
    const captured = await this.captureService.capture(request.url, owner)
    return {
      height: captured.height,
      src: this.issueImageCapability(captured.bytes, captured.mediaType),
      url: request.url,
      width: captured.width,
    }
  }

  dispose(): void {
    this.captureService?.dispose()
  }

  async fetch(payload: unknown): Promise<LinkPreviewResult> {
    const request = parseLinkPreviewRequest(payload)
    const cached = this.cache.get(request.url)
    if (cached && this.isCachedResultAvailable(cached)) return cached
    if (cached) this.cache.delete(request.url)
    const running = this.inflight.get(request.url)
    if (running) return running

    const operation = this.fetchUncached(request.url).then((result) => {
      this.cache.set(request.url, result)
      return result
    })
    this.inflight.set(request.url, operation)
    try {
      return await operation
    } finally {
      this.inflight.delete(request.url)
    }
  }

  resolveImageCapability(token: string): RemoteImageAsset | null {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    return this.imageCache.get(token) ?? null
  }

  private async fetchUncached(initialUrl: string): Promise<LinkPreviewResult> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('Link preview request timed out')),
      LINK_PREVIEW_TIMEOUT_MS,
    )
    let currentUrl = initialUrl
    try {
      for (let redirects = 0; ; redirects += 1) {
        const parsed = new URL(currentUrl)
        const addresses = await withAbort(
          assertPublicLinkPreviewUrl(parsed, this.lookup),
          controller.signal,
        )
        const agents = createPinnedAgents(parsed.hostname, addresses)
        try {
          const response = await this.httpClient.get<unknown>(currentUrl, {
            headers: {
              Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/*;q=0.8',
              'User-Agent': 'Marklab/0.2 link-preview',
            },
            httpAgent: agents.httpAgent,
            httpsAgent: agents.httpsAgent,
            maxBodyLength: LINK_PREVIEW_MAX_IMAGE_BYTES,
            maxContentLength: LINK_PREVIEW_MAX_IMAGE_BYTES,
            maxRedirects: 0,
            proxy: false,
            responseType: 'arraybuffer',
            signal: controller.signal,
            timeout: LINK_PREVIEW_TIMEOUT_MS,
            transformResponse: [(data: unknown) => data],
            validateStatus: () => true,
          })
          const status = response.status ?? 200
          if (status >= 300 && status < 400) {
            if (redirects >= LINK_PREVIEW_MAX_REDIRECTS) {
              throw new Error('Link preview exceeded redirect limit')
            }
            const location = headerValue(response.headers, 'location')
            if (!location) throw new Error('Link preview redirect is missing a location')
            currentUrl = normalizeHttpUrl(new URL(location, currentUrl).toString())
            continue
          }
          if (status < 200 || status >= 300) throw new Error(`Link preview returned HTTP ${status}`)
          return parseLinkPreviewResponse({
            htmlLimitBytes: LINK_PREVIEW_MAX_RESPONSE_BYTES,
            imageLimitBytes: LINK_PREVIEW_MAX_IMAGE_BYTES,
            issueImage: (bytes, mediaType) => this.issueImageCapability(bytes, mediaType),
            response,
            url: currentUrl,
          })
        } finally {
          agents.httpAgent.destroy()
          agents.httpsAgent.destroy()
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new Error('Link preview request timed out')
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private issueImageCapability(bytes: Uint8Array, mediaType: string): string {
    const capability = createRemoteImageCapabilityUrl()
    this.imageCache.set(capability.token, { bytes, mediaType })
    return capability.url
  }

  private isCachedResultAvailable(result: LinkPreviewResult): boolean {
    if (result.kind !== 'image') return true
    const token = parseRemoteImageCapabilityUrl(result.src)
    return Boolean(token && this.imageCache.has(token))
  }
}

export const parseLinkPreviewRequest = (payload: unknown): LinkPreviewRequest => {
  const rawUrl =
    typeof payload === 'string'
      ? payload
      : payload && typeof payload === 'object' && 'url' in payload
        ? (payload as Record<string, unknown>).url
        : null
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Link preview URL must be a string')
  }
  return { url: normalizeHttpUrl(rawUrl) }
}

const normalizeHttpUrl = (value: string): string => {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Link preview URL must be absolute')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }
  if (parsed.username || parsed.password)
    throw new Error('Link preview URLs cannot include credentials')
  return parsed.toString()
}

const createPinnedAgents = (hostname: string, addresses: string[]) => {
  let index = 0
  const lookup = (
    requestedHostname: string,
    _options: unknown,
    callback: (error: Error | null, address: string, family: number) => void,
  ) => {
    if (normalizeNetworkHostname(requestedHostname) !== normalizeNetworkHostname(hostname)) {
      callback(new Error('Link preview hostname changed during request'), '', 0)
      return
    }
    const address = addresses[index % addresses.length] ?? ''
    index += 1
    callback(null, address, net.isIP(address))
  }
  return {
    httpAgent: new http.Agent({ lookup: lookup as never }),
    httpsAgent: new https.Agent({ lookup: lookup as never }),
  }
}

const withAbort = <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      },
    )
  })
}
