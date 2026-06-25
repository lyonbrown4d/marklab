import { fsApi } from '@/services/fsApi'

const MARKLAB_ASSET_PROTOCOL = 'marklab-asset:'

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortError()
}

export const localAssetPathFromSrc = (src: string): string | null => {
  try {
    const url = new URL(src)
    if (url.protocol !== MARKLAB_ASSET_PROTOCOL || url.hostname !== 'local') return null
    return url.searchParams.get('path')
  } catch {
    return null
  }
}

export const fetchPreviewAssetBlob = async (
  src: string,
  fallbackMediaType: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  assertNotAborted(signal)

  const assetPath = localAssetPathFromSrc(src)
  if (assetPath) {
    const asset = await fsApi.readAssetBytes(assetPath)
    assertNotAborted(signal)
    return new Blob([new Uint8Array(asset.bytes as ArrayBuffer)], {
      type: asset.media_type ?? fallbackMediaType,
    })
  }

  const response = await fetch(src, { signal })
  if (!response.ok) throw new Error(`Failed to fetch asset: ${response.status}`)
  return response.blob()
}
