import { lookup as dnsLookup } from 'node:dns/promises'
import ipaddr from 'ipaddr.js'

export type LinkPreviewLookup = (hostname: string) => Promise<string[]>

export const normalizeNetworkHostname = (hostname: string): string => {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized
}

export const defaultLinkPreviewLookup: LinkPreviewLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

export const validatePublicAddress = (address: string): string => {
  if (!ipaddr.isValid(address)) throw new Error('Link preview DNS returned an invalid address')
  const parsed = ipaddr.parse(address)
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) {
    throw new Error('Link preview target must use a public internet address')
  }
  if (parsed.range() !== 'unicast') {
    throw new Error('Link preview target must use a public internet address')
  }
  return address
}

export const assertPublicLinkPreviewUrl = async (
  url: URL,
  lookup: LinkPreviewLookup = defaultLinkPreviewLookup,
): Promise<string[]> => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported')
  }
  if (url.username || url.password) throw new Error('Link preview URLs cannot include credentials')
  const hostname = normalizeNetworkHostname(url.hostname)
  if (!hostname) throw new Error('Link preview URL must include a hostname')

  if (ipaddr.isValid(hostname)) return [validatePublicAddress(hostname)]
  const addresses = await lookup(hostname)
  if (!addresses.length) throw new Error('Link preview hostname did not resolve')
  return addresses.map(validatePublicAddress)
}
