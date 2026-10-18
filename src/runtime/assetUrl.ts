import { inferPlatformFromUserAgent } from '@/runtime/environment'

// Keep opaque capabilities in DTOs. WebView2 requires an HTTP origin when the
// capability is handed to a DOM resource loader or fetch().
export const toWebviewAssetUrl = (value: string): string => {
  if (
    typeof window === 'undefined' ||
    !window.marklabTauri ||
    inferPlatformFromUserAgent() !== 'windows'
  ) {
    return value
  }
  const match = /^marklab-asset:\/\/(local|remote)\/v1\/([A-Za-z0-9_-]{43})([?#].*)?$/.exec(value)
  return match
    ? `http://marklab-asset.localhost/${match[1]}/v1/${match[2]}${match[3] ?? ''}`
    : value
}
