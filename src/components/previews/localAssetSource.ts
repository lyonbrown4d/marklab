import { fsApi } from '@/services/fsApi'

const MARKLAB_ASSET_PROTOCOL = 'marklab-asset:'
const MARKLAB_ASSET_URL_PATTERN = /^marklab-asset:\/\/local\/v1\/[A-Za-z0-9._~-]+$/
const FETCHABLE_PREVIEW_PROTOCOLS = new Set(['http:', 'https:', 'blob:'])
const BLOCKED_EXTERNAL_PDF_PROTOCOLS = new Set(['http:', 'https:', 'data:'])

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')
const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError()
}
const sourceProtocol = (src: string) => {
  try {
    return new URL(src).protocol.toLowerCase()
  } catch {
    return null
  }
}
const strictAssetUrlWithoutHash = (src: string) => {
  const hashIndex = src.indexOf('#')
  const assetUrl = hashIndex >= 0 ? src.slice(0, hashIndex) : src
  return MARKLAB_ASSET_URL_PATTERN.test(assetUrl) ? assetUrl : null
}

export const fetchPreviewAssetBlob = async (
  src: string,
  fallbackMediaType: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  assertNotAborted(signal)
  const assetUrl = strictAssetUrlWithoutHash(src)
  if (assetUrl) {
    const asset = await fsApi.readAssetBytes(assetUrl)
    assertNotAborted(signal)
    return new Blob([new Uint8Array(asset.bytes as ArrayBuffer)], {
      type: asset.media_type ?? fallbackMediaType,
    })
  }

  const protocol = sourceProtocol(src)
  if (
    fallbackMediaType === 'application/pdf' &&
    protocol &&
    BLOCKED_EXTERNAL_PDF_PROTOCOLS.has(protocol)
  ) {
    throw new Error('External HTTP(S) and data PDF previews are unsupported')
  }
  if (
    protocol === MARKLAB_ASSET_PROTOCOL ||
    !protocol ||
    !FETCHABLE_PREVIEW_PROTOCOLS.has(protocol)
  ) {
    throw new Error('Unsupported preview asset URL')
  }

  const response = await fetch(src, { signal })
  if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`)
  return response.blob()
}
