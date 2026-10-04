import axios from 'axios'

import {
  assertPublicLinkPreviewUrl,
  type LinkPreviewLookup,
} from '@electron/services/linkPreview/networkSecurity.js'
import { createPinnedAgents } from '@electron/services/linkPreview/pinnedAgents.js'
import { headerValue } from '@electron/services/linkPreview/response.js'

const MAX_RESOURCE_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const EMPTY_BODY_STATUSES = new Set([204, 205, 304])
const REQUEST_HEADERS = [
  ['accept', 'Accept'],
  ['accept-language', 'Accept-Language'],
  ['if-modified-since', 'If-Modified-Since'],
  ['if-none-match', 'If-None-Match'],
  ['if-range', 'If-Range'],
  ['origin', 'Origin'],
  ['range', 'Range'],
  ['sec-fetch-dest', 'Sec-Fetch-Dest'],
  ['sec-fetch-mode', 'Sec-Fetch-Mode'],
  ['sec-fetch-site', 'Sec-Fetch-Site'],
  ['user-agent', 'User-Agent'],
] as const
const RESPONSE_HEADERS = [
  'access-control-allow-credentials',
  'access-control-allow-origin',
  'accept-ranges',
  'cache-control',
  'content-language',
  'content-range',
  'content-security-policy',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'etag',
  'expires',
  'last-modified',
  'referrer-policy',
  'timing-allow-origin',
  'vary',
  'x-content-type-options',
] as const

type ProtocolHttpResponse = {
  data: unknown
  headers?: unknown
  status?: number
}

type ProtocolHttpClient = {
  get(url: string, config: Record<string, unknown>): Promise<ProtocolHttpResponse>
  head?(url: string, config: Record<string, unknown>): Promise<ProtocolHttpResponse>
}

type ProtocolSession = {
  protocol: {
    handle(scheme: string, handler: (request: Request) => Promise<Response>): void
    unhandle(scheme: string): void
  }
}

type ProtocolHandlerOptions = { timeoutMs?: number }

export const installWebPreviewProtocol = (
  session: ProtocolSession,
  lookup: LinkPreviewLookup,
): (() => void) => {
  const handler = createWebPreviewProtocolHandler(axios, lookup)
  const installed: string[] = []
  try {
    for (const scheme of ['http', 'https']) {
      session.protocol.handle(scheme, handler)
      installed.push(scheme)
    }
  } catch (error) {
    disposeProtocols(session, installed)
    throw error
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    disposeProtocols(session, installed)
  }
}

export const createWebPreviewProtocolHandler = (
  httpClient: ProtocolHttpClient,
  lookup: LinkPreviewLookup,
  options: ProtocolHandlerOptions = {},
) => {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new Error('Web preview only supports safe HTTP methods')
    }
    const lifetime = createRequestLifetime(request.signal, options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    try {
      return await proxyRequest(httpClient, lookup, request, lifetime.signal)
    } finally {
      lifetime.dispose()
    }
  }
}

const proxyRequest = async (
  httpClient: ProtocolHttpClient,
  lookup: LinkPreviewLookup,
  request: Request,
  signal: AbortSignal,
): Promise<Response> => {
  const currentUrl = new URL(request.url)
  const addresses = await raceWithAbort(assertPublicLinkPreviewUrl(currentUrl, lookup), signal)
  const agents = createPinnedAgents(currentUrl.hostname, addresses)
  try {
    const config = {
      headers: requestHeaders(request),
      httpAgent: agents.httpAgent,
      httpsAgent: agents.httpsAgent,
      maxBodyLength: MAX_RESOURCE_BYTES,
      maxContentLength: MAX_RESOURCE_BYTES,
      maxRedirects: 0,
      proxy: false,
      responseType: 'arraybuffer',
      signal,
      timeout: REQUEST_TIMEOUT_MS,
      transformResponse: [(data: unknown) => data],
      validateStatus: () => true,
    }
    const response =
      request.method === 'HEAD' && httpClient.head
        ? await httpClient.head(currentUrl.toString(), config)
        : await httpClient.get(currentUrl.toString(), config)
    return await responseFromUpstream(response, currentUrl, request.method, lookup, signal)
  } finally {
    agents.httpAgent.destroy()
    agents.httpsAgent.destroy()
  }
}

const responseFromUpstream = async (
  response: ProtocolHttpResponse,
  currentUrl: URL,
  method: string,
  lookup: LinkPreviewLookup,
  signal: AbortSignal,
): Promise<Response> => {
  const status = response.status ?? 200
  if (status < 200 || status > 599) throw new Error(`Web preview returned invalid HTTP ${status}`)
  const headers = responseHeaders(response.headers)
  if (REDIRECT_STATUSES.has(status)) {
    const location = headerValue(response.headers, 'location')
    if (location) {
      const target = new URL(location, currentUrl)
      await raceWithAbort(assertPublicLinkPreviewUrl(target, lookup), signal)
      headers.set('Location', target.toString())
    }
    return new Response(null, { headers, status })
  }
  const body =
    method === 'HEAD' || EMPTY_BODY_STATUSES.has(status) ? null : toResponseBody(response.data)
  return new Response(body, { headers, status })
}

const requestHeaders = (request: Request): Record<string, string> => {
  const headers: Record<string, string> = {}
  for (const [source, target] of REQUEST_HEADERS) {
    const value = request.headers.get(source)
    if (value) headers[target] = value
  }
  headers.Accept ??= '*/*'
  headers['Accept-Language'] ??= 'en-US,en;q=0.8'
  headers['User-Agent'] ??= 'Marklab/0.2 web-preview'
  if (request.referrer && request.referrer !== 'about:client') headers.Referer = request.referrer
  return headers
}

const responseHeaders = (source: unknown): Headers => {
  const headers = new Headers()
  const contentType = headerValue(source, 'content-type')
  if (contentType) headers.set('Content-Type', contentType)
  for (const name of RESPONSE_HEADERS) {
    const value = headerValue(source, name)
    if (value) headers.set(name, value)
  }
  return headers
}

const toResponseBody = (value: unknown): ArrayBuffer => {
  if (value instanceof ArrayBuffer) {
    assertWithinResourceLimit(value.byteLength)
    return value
  }
  let bytes: Uint8Array
  if (ArrayBuffer.isView(value)) {
    bytes = Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  } else if (typeof value === 'string') bytes = new TextEncoder().encode(value)
  else throw new Error('Web preview returned an unsupported response body')
  assertWithinResourceLimit(bytes.byteLength)
  return bytes.buffer instanceof ArrayBuffer ? bytes.buffer : Uint8Array.from(bytes).buffer
}

const assertWithinResourceLimit = (byteLength: number): void => {
  if (byteLength > MAX_RESOURCE_BYTES) throw new Error('Web preview response exceeded maximum size')
}

const createRequestLifetime = (requestSignal: AbortSignal, timeoutMs: number) => {
  const controller = new AbortController()
  const cancel = () => controller.abort(new Error('Web preview request was aborted'))
  if (requestSignal.aborted) cancel()
  else requestSignal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(
    () => controller.abort(new Error('Web preview request timed out')),
    timeoutMs,
  )
  timer.unref?.()
  return {
    dispose: () => {
      clearTimeout(timer)
      requestSignal.removeEventListener('abort', cancel)
    },
    signal: controller.signal,
  }
}

const raceWithAbort = async <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) throw abortReason(signal)
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(abortReason(signal))
    signal.addEventListener('abort', aborted, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new Error('Web preview request was aborted')

const disposeProtocols = (session: ProtocolSession, schemes: string[]): void => {
  for (const scheme of [...schemes].reverse()) {
    try {
      session.protocol.unhandle(scheme)
    } catch {
      // The owning session is being torn down; continue releasing the remaining handlers.
    }
  }
}
