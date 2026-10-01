import { Agent as HttpAgent, type ClientRequestArgs } from 'node:http'
import { Agent as HttpsAgent, type RequestOptions as HttpsRequestOptions } from 'node:https'
import type { Duplex } from 'node:stream'

import { WebDavError } from '@electron/services/sync/webdav/errors.js'

type RequestAgent = HttpAgent | HttpsAgent

export const createOriginLockedAgents = (
  origin: string,
): {
  httpAgent: RequestAgent
  httpsAgent: RequestAgent
} => ({
  httpAgent: new OriginLockedHttpAgent(origin),
  httpsAgent: new OriginLockedHttpsAgent(origin),
})

class OriginLockedHttpAgent extends HttpAgent {
  private readonly expected: URL

  constructor(origin: string) {
    super()
    this.expected = new URL(origin)
  }

  override createConnection(
    options: ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    if (!isExpectedOrigin(this.expected, options, 'http:')) {
      return rejectConnection(callback)
    }
    return super.createConnection(options, callback)
  }
}

class OriginLockedHttpsAgent extends HttpsAgent {
  private readonly expected: URL

  constructor(origin: string) {
    super()
    this.expected = new URL(origin)
  }

  override createConnection(
    options: HttpsRequestOptions,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    if (!isExpectedOrigin(this.expected, options, 'https:')) {
      return rejectConnection(callback)
    }
    return super.createConnection(options, callback)
  }
}

const isExpectedOrigin = (
  expected: URL,
  options: ClientRequestArgs,
  fallbackProtocol: 'http:' | 'https:',
): boolean => {
  const protocol = options.protocol ?? fallbackProtocol
  const hostname = normalizeHostname(options.hostname ?? options.host ?? '')
  const expectedPort = expected.port || defaultPort(expected.protocol)
  const actualPort = String(options.port ?? defaultPort(protocol))
  return (
    protocol === expected.protocol &&
    hostname === normalizeHostname(expected.hostname) &&
    actualPort === expectedPort
  )
}

const normalizeHostname = (value: string): string => {
  const lower = value.toLowerCase()
  if (lower.startsWith('[')) {
    const closingBracket = lower.indexOf(']')
    return closingBracket === -1 ? lower : lower.slice(1, closingBracket)
  }
  return lower.indexOf(':') !== lower.lastIndexOf(':') ? lower : lower.replace(/:\d+$/, '')
}

const defaultPort = (protocol: string): string => (protocol === 'https:' ? '443' : '80')

const rejectConnection = (
  callback: ((error: Error | null, stream: Duplex) => void) | undefined,
): undefined => {
  const error = new WebDavError('ORIGIN_MISMATCH')
  if (!callback) throw error
  callback(error, undefined as unknown as Duplex)
  return undefined
}
