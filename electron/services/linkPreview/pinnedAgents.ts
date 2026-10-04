import type { LookupOptions } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

import { normalizeNetworkHostname } from '@electron/services/linkPreview/networkSecurity.js'

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number,
) => void

export const createPinnedAgents = (hostname: string, addresses: string[]) => {
  let index = 0
  const lookup = (
    requestedHostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ): void => {
    if (normalizeNetworkHostname(requestedHostname) !== normalizeNetworkHostname(hostname)) {
      callback(createLookupError('Link preview hostname changed during request'), '', 0)
      return
    }

    const candidates = addresses.filter((address) => matchesFamily(address, options.family))
    if (candidates.length === 0) {
      callback(createLookupError('Link preview address family is unavailable'), '', 0)
      return
    }
    if (options.all) {
      callback(
        null,
        candidates.map((address) => ({ address, family: net.isIP(address) })),
      )
      return
    }

    const address = candidates[index % candidates.length] ?? ''
    index += 1
    callback(null, address, net.isIP(address))
  }

  return {
    httpAgent: new http.Agent({ lookup }),
    httpsAgent: new https.Agent({ lookup }),
  }
}

const matchesFamily = (address: string, family: LookupOptions['family']): boolean => {
  if (!family || family === 0) return true
  const expected = family === 'IPv4' ? 4 : family === 'IPv6' ? 6 : family
  return net.isIP(address) === expected
}

const createLookupError = (message: string): NodeJS.ErrnoException => {
  const error: NodeJS.ErrnoException = new Error(message)
  error.code = 'ENOTFOUND'
  return error
}
