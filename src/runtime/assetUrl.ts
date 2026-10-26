// Keep opaque capabilities in DTOs. Both CEF and WebView2 use HTTP custom
// protocol origins when a capability reaches DOM resource loaders or fetch().
export const toWebviewAssetUrl = (value: string): string => {
  if (typeof window === 'undefined' || !window.marklabTauri) return value
  const match = /^marklab-asset:\/\/(local|remote)\/v1\/([A-Za-z0-9_-]{43})([?#].*)?$/.exec(value)
  return match
    ? `http://marklab-asset.localhost/${match[1]}/v1/${match[2]}${match[3] ?? ''}`
    : value
}
