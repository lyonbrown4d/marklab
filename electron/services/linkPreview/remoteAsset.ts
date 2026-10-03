import { randomBytes } from 'node:crypto'

export const REMOTE_IMAGE_CAPABILITY_PREFIX = 'marklab-asset://remote/v1/'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type RemoteImageAsset = {
  bytes: Uint8Array
  mediaType: string
}

export const createRemoteImageCapabilityUrl = (): { token: string; url: string } => {
  const token = randomBytes(32).toString('base64url')
  return { token, url: `${REMOTE_IMAGE_CAPABILITY_PREFIX}${token}` }
}

export const parseRemoteImageCapabilityUrl = (value: string): string | null => {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'marklab-asset:' ||
      url.hostname !== 'remote' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null
    }
    const match = /^\/v1\/([A-Za-z0-9_-]{43})$/.exec(url.pathname)
    return match?.[1] && TOKEN_PATTERN.test(match[1]) ? match[1] : null
  } catch {
    return null
  }
}
